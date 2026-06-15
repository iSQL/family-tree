# Porodično stablo

Web PWA aplikacija za porodično stablo: interaktivni prikaz, unos i izmena osoba i veza, slike, pretraga, rođendani i godišnjice, vremenska linija, kalkulator srodstva sa srpskim terminima i GEDCOM import/export. Radi offline (read-only) i može da se instalira na telefon/računar.

Datumi se prikazuju i unose u formatu `DD.MM.GGGG` (uz kalendar za izbor i podršku za nepotpune datume — npr. samo godina). Pored pune porodične lozinke, postoji i opciona lozinka **samo za pregled** (vidi `READONLY_PASSWORD` ispod).

## Tehnologije

- **Klijent:** React 19 + Vite 8, Tailwind CSS 4, TanStack Query, react-router, [family-chart](https://github.com/donatso/family-chart) za prikaz stabla, vite-plugin-pwa (Workbox)
- **Server:** Express 5, better-sqlite3 (SQLite), iron-session, sharp (obrada slika), read-gedcom
- **Deljeno:** TypeScript tipovi + zod šeme u `shared/` — jedan ugovor za obe strane

## Pokretanje (development)

Potreban je Node.js ≥ 22.

```bash
npm install
npm run seed   # (opciono) ubaci probnu porodicu u bazu
npm run dev    # server na :3001 + Vite klijent na :5173
```

Otvori **http://localhost:5173**. U dev modu je prijava isključena (`AUTH_DISABLED=true` u `.env`) radi lakšeg testiranja.

Korisne skripte:

| Komanda | Šta radi |
|---|---|
| `npm run dev` | Server (tsx watch) + klijent (Vite) istovremeno |
| `npm test` | vitest — kinship, datumi, pretraga, GEDCOM, API (supertest) |
| `npm run typecheck` | TypeScript provera oba workspace-a |
| `npm run build` | Produkcijski build klijenta i servera |
| `npm run seed` | Probna porodica (3 generacije, ponovni brak, polubrat) |
| `node scripts/generate-icons.mjs` | Regeneriše PWA ikone |

## Konfiguracija (`.env`)

Vidi [.env.example](.env.example). Ključno:

- `AUTH_PASSWORD` — zajednička porodična lozinka (produkcija)
- `READONLY_PASSWORD` — *(opciono)* lozinka za pristup **samo za pregled**: ko se prijavi njom može da gleda stablo, ali ne može ništa da menja (dodaje/menja/briše/uvozi). Mora se razlikovati od `AUTH_PASSWORD`; ostavi prazno da bi se isključilo
- `PUBLIC_READ=true` — *(opciono)* **javno čitanje bez prijave**: bilo ko može da gleda stablo, ali izmene i dalje traže `AUTH_PASSWORD`. Zgodno za privremeno deljenje; podrazumevano isključeno
- `SESSION_SECRET` — min 32 karaktera, za potpisivanje session cookie-ja
- `AUTH_DISABLED=true` — isključuje prijavu, **poštuje se samo van produkcije**; u produkciji server odbija da se pokrene sa ovim flagom (fail-safe). Dok je uključen sve je pun pristup, pa se režim samo za pregled aktivira tek kad je prijava uključena
- `DATA_DIR` — direktorijum sa celokupnim stanjem: SQLite baza, slike, bekapi

## Produkcija (Docker)

```bash
# pored docker-compose.yml napravi .env sa AUTH_PASSWORD i SESSION_SECRET
docker compose up -d --build
```

Aplikacija sluša na `:3001`; ispred postavi HTTPS reverse proxy — primer za Caddy sa automatskim Let's Encrypt sertifikatom je u [deploy/Caddyfile](deploy/Caddyfile). PWA instalacija i sigurni cookie-ji zahtevaju HTTPS.

**Coolify:** za hostovanje na [Coolify](https://coolify.io) instanci (ima ugrađen proxy + HTTPS, pa Caddy nije potreban) koristi [docker-compose.coolify.yml](docker-compose.coolify.yml) i uputstvo [deploy/COOLIFY.md](deploy/COOLIFY.md).

**Podaci i bekap:** sve živi u `./data` (volume): `familytree.db`, `photos/`, `backups/`. Server pravi dnevni bekap baze u `data/backups/` (čuva poslednjih 14). Za bekap je dovoljno kopirati ceo `data/` direktorijum; GEDCOM izvoz služi i kao čitljiv backup.

## Struktura

```
shared/   tipovi, zod šeme, parcijalni datumi, pretraga, kalkulator srodstva
server/   Express API, SQLite, slike, GEDCOM, auth
client/   React PWA (stablo, osobe, rođendani, timeline, kalkulator, GEDCOM)
data/     (gitignored) baza + slike + bekapi
```
