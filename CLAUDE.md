# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Web PWA for a family tree — Serbian-language UI. Interactive tree view, person/union editing, photos, search, birthdays/anniversaries, timeline, kinship calculator with Serbian kinship terms, and GEDCOM import/export. Works offline (read-only) and is installable.

## Commands

Node ≥ 22.12 required. Workspaces: `client`, `server` (top-level `npm install` installs both).

| Command | What it does |
|---|---|
| `npm run dev` | server (tsx watch :3001) + Vite client (:5173) via concurrently. Open http://localhost:5173 |
| `npm test` | vitest — runs `shared/src/**/*.test.ts` and `server/src/**/*.test.ts` (node env) |
| `npm run typecheck` | tsc `--noEmit` for server and client tsconfigs |
| `npm run build` | client (Vite) then server (esbuild bundle) |
| `npm run seed` | seeds a sample family (3 generations + remarriage + half-sibling) into the dev DB |
| `npm start` | runs the built server (`node server/dist/index.js`) |

Run a single test file: `npx vitest run server/src/persons.test.ts` (or pass a name pattern with `-t`).

Dev mode runs with `AUTH_DISABLED=true` so the login screen is skipped. The server **refuses to start** in production with `AUTH_DISABLED=true` (fail-safe in [server/src/config.ts](server/src/config.ts)). Production also requires `AUTH_PASSWORD` and a `SESSION_SECRET` ≥ 32 chars. An optional `READONLY_PASSWORD` (must differ from `AUTH_PASSWORD`) grants view-only access. Setting `PUBLIC_READ=true` lets anyone read (GET) without logging in while writes still require `AUTH_PASSWORD` — useful for temporary public sharing. Note: when `AUTH_DISABLED=true` everything is full access, so the read-only / public-read flows only activate with auth enabled.

## Architecture

### Three workspaces, one shared contract

- `shared/src/` is the **only contract** between client and server: `types.ts` (DTOs), `schemas.ts` (zod validators — used by server for input parsing and client forms), plus pure logic (`partialDate.ts`, `search.ts`, `kinship/`). Imported as `@shared/*` (path alias in [tsconfig.base.json](tsconfig.base.json), [vitest.config.ts](vitest.config.ts), and the client's [vite.config.ts](client/vite.config.ts)).
- DTO ↔ DB convention: **snake_case keys, 1:1 with SQLite columns**. Don't rename in transit.
- Partial dates everywhere: birth/death/union start/end are stored/validated as ISO strings `'YYYY' | 'YYYY-MM' | 'YYYY-MM-DD'` (`partialDateSchema`). **Display** is European: full dates render `15.03.1956.` (`formatPartialDate`), partial dates keep a named month (`mart 1956.` / `1956.`). **Input** is European too — `parsePartialDateInput`/`formatPartialDateInput` convert between `DD.MM.GGGG`/`MM.GGGG`/`GGGG` and the stored ISO. ISO remains the only on-the-wire/DB format; the European format never leaves the UI layer.

### Server (`server/src/`)

- Stack: Express 5, better-sqlite3 (synchronous), iron-session (cookie sessions), helmet, sharp (photo resize), read-gedcom, pino.
- Entrypoint [index.ts](server/src/index.ts) wires config → DB → app, ensures `data/photos` and `data/backups` exist, starts the daily backup timer, and in production also serves the built client (SPA fallback for non-`/api` GETs — same-origin, no CORS).
- [app.ts](server/src/app.ts) builds the Express app without `listen()` so supertest can mount it directly. Order matters: helmet → pino → json body → iron-session → CSRF/origin check → `/api/health` and `/api/auth` (public) → `requireAuth` → feature routers → 404 → error handler.
- DB: [db.ts](server/src/db.ts) opens better-sqlite3 with `journal_mode=WAL`, `foreign_keys=ON`, runs migrations. Migrations are **inline strings** in [migrations.ts](server/src/migrations.ts) (bundle-safe, no `.sql` files on disk) and gated by `PRAGMA user_version`. To change schema, append a new migration object — never edit an existing one.
- Schema invariants: `persons.father_id`/`mother_id` are self-references with `ON DELETE SET NULL`. `unions` enforce `partner1_id < partner2_id` at the DB level — **the server canonicalizes order** before insert (this is why unions don't have "from one side or the other" semantics; child relations are independent of unions and live on `persons`).
- Routes are thin (parse with zod → call service → respond). Business logic lives in `services/` (`personService.ts`, `photoService.ts`, `backup.ts`). PATCH uses `onlyPresentKeys` from [lib/patch.ts](server/src/lib/patch.ts) to distinguish "field omitted" from "field set to null".
- Auth: shared family password (single tenant). Session in an iron-session cookie. CSRF defense is origin-based ([middleware/csrfOrigin.ts](server/src/middleware/csrfOrigin.ts)). `requireAuth` is bypassed when `cfg.authDisabled` is true. Login accepts either `AUTH_PASSWORD` (full access) or the optional `READONLY_PASSWORD`; the latter sets `session.readonly`, and `blockReadonlyWrites` ([middleware/auth.ts](server/src/middleware/auth.ts), mounted after `requireAuth` in [app.ts](server/src/app.ts)) rejects any non-GET/HEAD/OPTIONS request with 403 — this is the real read-only guard; the client only hides write affordances. `requireFullAccess` (same file) is a stricter admin-only guard applied **per-router** (not globally) — it rejects readonly sessions and anonymous/public-read visitors even for GET; used by the full-backup router so the whole-DB export download also requires the full password. With `PUBLIC_READ=true`, `requireAuth` lets safe (GET/HEAD/OPTIONS) requests through without a session, but non-safe methods still need auth — so anonymous visitors can read but not write. `GET /api/auth/session` returns `readonly` and `public_read` so the client can adapt (it treats an unauthenticated visitor under public read as read-only and offers a "log in to edit" link).
- Errors: routes `throw new AppError(status, code)`; the error middleware ([middleware/errors.ts](server/src/middleware/errors.ts)) shapes them into `ApiErrorBody`.
- Tests use [testHelpers.ts](server/src/testHelpers.ts) — `testApp()` builds an in-memory SQLite app, `insertPerson()` is a direct DB fixture. Test config sets `nodeEnv='test'`, `authDisabled=true`. Note: `testHelpers.ts` is **not** a test file (vitest only collects `*.test.ts`).

### Client (`client/src/`)

- Stack: React 19 + Vite 8, Tailwind 4, TanStack Query, react-router 7, family-chart (`f3`) for tree rendering, react-hook-form + zod resolvers, vite-plugin-pwa (Workbox), sonner toasts.
- [App.tsx](client/src/App.tsx) is the route table. All app routes are wrapped in `AuthGuard` → `AppShell` (layout). `/login` is the only public route.
- Data access is centralized: [api/client.ts](client/src/api/client.ts) is the fetch wrapper; React Query hooks live in `hooks/` (`useTree`, `usePerson`, `useSession`, `useMutations`). The whole tree comes back in **one** `GET /api/tree` call (the `TreeResponse` cache feeds tree view, search, birthdays, timeline, and the kinship calculator).
- [lib/toF3.ts](client/src/lib/toF3.ts) is the **only** module that knows about the family-chart datum format — it converts `TreeResponse` to f3's `{id, data, rels}` shape. `family-chart` itself is imported only by `TreeCanvas` (interactive chart) and [lib/posterLayout.ts](client/src/lib/posterLayout.ts) (headless `CalculateTree` for the print poster — exposes plain `{nodes, lines}` coordinates, no f3 types leak out).
- Poster export (`/settings/poster`, [routes/Poster.tsx](client/src/routes/Poster.tsx)): options panel + live preview. Six scopes: current view (`?focus`+`?down`, f3 `progeny_depth`), whole lineage, ancestors, descendants, selected nodes (cards are clickable in the preview's pick mode), and kinship connection (`?a`/`?b`, reuses `kinship/connection.buildConnectionView`). Entry points: Settings card, "Poster" button on the tree page, "Poster" link on the connection view. Scope filtering is pure logic in [shared/src/posterScope.ts](shared/src/posterScope.ts), layout comes from `lib/posterLayout.ts`, the sheet itself is [components/poster/PosterSheet.tsx](client/src/components/poster/PosterSheet.tsx) (always light — it's paper). Printing mounts a hidden portal (`.poster-print-root`, print CSS in [index.css](client/src/index.css)) scaled to physical mm with a dynamic `@page` rule; "Preuzmi PDF" is the same print dialog (browser "Save as PDF"), and "Više A4" tiles an A2 poster onto 4 × A4 pages.
- PWA caching policy (in [vite.config.ts](client/vite.config.ts)): photos are `CacheFirst` (30 days), `/api/(tree|persons)` is `NetworkFirst` with a 3s timeout, `/api/auth` is **never** cached, and `/api/*` is excluded from the SPA shell fallback. Service worker uses `registerType: 'autoUpdate'`.
- Dev server proxies `/api` → `http://localhost:3001` so the client always talks to the same origin in both dev and prod.
- Date entry goes through [components/ui/DateInput.tsx](client/src/components/ui/DateInput.tsx) — a `DD.MM.GGGG` text field plus a Serbian (Monday-first) calendar popover. It holds the stored ISO partial date and converts via `parsePartialDateInput`/`formatPartialDateInput`; on invalid input it passes the raw text up so the zod resolver surfaces the error. It's the only date-entry control (used by `PersonForm` and `UnionForm`).
- Read-only access: [hooks/useAccess.ts](client/src/hooks/useAccess.ts) exposes `useReadonly()` and `useCanWrite()` (= online && !readonly). Write affordances are hidden for read-only sessions (`PersonDetailContent`, `Tree`, `Gedcom` import; `PersonForm` route redirects), and [ReadonlyBanner](client/src/components/layout/ReadonlyBanner.tsx) shows the mode. This is UX only — the server middleware is the actual guard.

### Kinship calculator (`shared/src/kinship/`)

Runs on the client over the cached `TreeResponse`, and is unit-tested on the server (pure, no I/O). BFS from both persons upward to the nearest common ancestor over `father_id`/`mother_id`, allowing at most **one** spouse edge at each end. The rule table ([terms.ts](shared/src/kinship/terms.ts)) is keyed by (steps-up, steps-down, target gender, paternal/maternal line, spouse edges) and covers blood ties (incl. deep ancestors navrdeda…beli orao and descendants up to bele pčele) plus in-law terms: snaha/zet (generalized to any descendant-line relative), svekar, tast, dever, šurak, očuh, maćeha, pastorak, strina/ujna/teča, pašenog, jetrva, svojak, šurnjaja, svastić… **Prija/prijatelj** (parents of married children) has a spouse edge in the *middle* of the path, so BFS misses it — it's caught by a dedicated `detectPrija` in [index.ts](shared/src/kinship/index.ts). Falls back to a composed chain ("sin brata oca") + cousin degree when no term matches. `describeKinship` returns the single closest relation; `describeKinships(tree, from, to, limit=3)` returns **all independent lines** (double/multiple kinship — e.g. related through both a grandfather's and a grandmother's line), closest first, each a full renderable `KinshipResult` with a `viaLabel` (the common-ancestor couple). It enumerates most-recent common ancestors via `findBloodLines` ([resolve.ts](shared/src/kinship/resolve.ts)) — an MRCA is a common ancestor none of whose children are common; ancestral **couples collapse to one line**. The client renders the list via [KinshipResults](client/src/components/kinship/KinshipResults.tsx) (used by the calculator and the in-tree kinship panel); each line has its own "Prikaži vezu" → `/connection?a=&b=&line=i`, and the connection view ([routes/Connection.tsx](client/src/routes/Connection.tsx)) renders the chosen line with pills to switch between them.

### Data layout (`data/`, gitignored)

- `familytree.db` (SQLite, WAL)
- `photos/` (UUID stems; `sharp` produces `full` + `thumb` sizes — see [photoService.ts](server/src/services/photoService.ts))
- `backups/` (daily DB copies, last 14 retained)

To back up, copy the whole `data/` directory. Three backup surfaces exist, in increasing completeness: **GEDCOM export** (`/api/gedcom/export`) — portable standard, genealogy data only (no photos, no `is_family_head`, lossy on partnerships/end-reasons); the automatic **daily DB copy** (`backups/`, DB only, no photos); and the **full backup** (`/api/backup`, [services/fullBackup.ts](server/src/services/fullBackup.ts)) — a ZIP with a JSON dump of both tables (all columns) **plus every photo file**, restorable in place. Full backup is **admin-only** (`requireFullAccess`) and restore is destructive (wipes then two-pass re-inserts to satisfy parent FKs, then swaps the photos dir). ZIP via `fflate` (`zipSync`/`unzipSync`, store-only). UI lives on the GEDCOM page ([routes/Gedcom.tsx](client/src/routes/Gedcom.tsx)), shown only for `useCanWrite()`.

## Conventions

- All user-facing strings and code comments are in **Serbian (Latin script)**. Match that when editing or adding code in this repo.
- When adding a server route, validate the body with a zod schema from `@shared/schemas` (or a new one added there if shared with the client form).
- When adding a field to `Person`/`Union`: update [shared/src/types.ts](shared/src/types.ts), the matching zod schema, add a migration in [server/src/migrations.ts](server/src/migrations.ts) (new `version` — never edit existing ones), update the service layer, and the form component on the client.
- f3 logic should not leak outside `TreeCanvas`, `lib/toF3.ts` and `lib/posterLayout.ts`.
