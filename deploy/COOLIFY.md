# Hostovanje na Coolify

[Coolify](https://coolify.io) ima ugrađen reverse proxy (Traefik/Caddy) sa automatskim Let's Encrypt HTTPS-om, generisanje tajni i upravljanje volumenima. Zbog toga **Caddy iz `deploy/Caddyfile` NIJE potreban** — Coolify radi TLS terminaciju.

Postoje dva načina; oba grade isti `Dockerfile`. **Compose put je preporučen** jer sam generiše `SESSION_SECRET` i deklariše trajni volumen.

---

## Način A — Docker Compose (preporučeno)

1. U Coolify-ju: **+ New → Resource → Docker Compose**, izaberi server i poveži ovaj Git repo (grana `main`).
2. U podešavanjima resursa postavi **Docker Compose Location** na:
   ```
   /docker-compose.coolify.yml
   ```
3. **Environment Variables** → dodaj porodičnu lozinku:
   ```
   AUTH_PASSWORD = <vaša-porodična-lozinka>
   ```
   `SESSION_SECRET` se generiše automatski (magična varijabla `SERVICE_BASE64_64_SESSIONSECRET`) i trajno čuva — ne diraj je.
4. **Domains** → Coolify dodeli domen za servis `family-tree` na portu 3001; promeni ga na svoj (npr. `stablo.tvoj-domen.rs`) ako želiš. HTTPS se podešava sam.
5. **Deploy.**

Trajni volumen `family-tree-data` (baza + slike + bekapi) je već deklarisan u compose fajlu i preživljava redeploy.

---

## Način B — Dockerfile (jednostavnije, ručno podešavanje)

1. **+ New → Resource → Application → Public/Private Git repo**, izaberi repo i granu.
2. **Build Pack: Dockerfile** (Coolify automatski nađe `Dockerfile` u korenu).
3. **Port** (Ports Exposes) → `3001`.
4. **Environment Variables:**
   | Ključ | Vrednost |
   |---|---|
   | `NODE_ENV` | `production` |
   | `AUTH_PASSWORD` | vaša porodična lozinka |
   | `SESSION_SECRET` | nasumičan string ≥ 32 znaka (npr. `openssl rand -hex 32`) |
5. **⚠ Persistent Storage (OBAVEZNO):** dodaj volumen sa **Destination Path** `/app/data`. Bez ovoga se baza, slike i bekapi **brišu pri svakom redeploy-u.**
6. **Domains** → postavi domen; HTTPS automatski.
7. **Deploy.**

---

## Promenljive okruženja

| Ključ | Obavezno (prod) | Opis |
|---|---|---|
| `NODE_ENV` | da | mora biti `production` |
| `AUTH_PASSWORD` | da | zajednička porodična lozinka za prijavu |
| `SESSION_SECRET` | da | ≥ 32 znaka; potpisuje session cookie (Compose put generiše sam) |
| `PORT` | ne | podrazumevano `3001` |
| `DATA_DIR` | ne | podrazumevano `/app/data` (u Docker image-u) |
| `CLIENT_DIST` | ne | podrazumevano `/app/client/dist` |
| `AUTH_DISABLED` | — | **ne postavljati u produkciji** — server fail-safe odbija boot |

Fail-safe: ako u produkciji nedostaje `AUTH_PASSWORD`, `SESSION_SECRET` je kraći od 32 znaka, ili je `AUTH_DISABLED` uključen — kontejner namerno **ne startuje** (vidljivo u Coolify logovima).

---

## Trajni podaci i bekap

Sve stanje aplikacije živi u **`/app/data`**: `familytree.db` (+ WAL), `photos/`, `backups/`. Aplikacija svakog dana pravi kopiju baze u `data/backups/` (čuva poslednjih 14).

- **Compose put:** podaci su u Docker volumenu `family-tree-data`.
- **Dockerfile put:** podaci su u volumenu koji si mapirao na `/app/data`.

Za eksterni bekap: u Coolify-ju koristi **Scheduled Backups** nad tim volumenom, ili periodično povuci `data/` direktorijum sa servera. GEDCOM izvoz (u aplikaciji: *GEDCOM → Preuzmi .ged*) služi i kao čitljiv backup.

---

## Provera i rešavanje problema

- **Health check:** kontejner se smatra zdravim kada `GET /api/health` vrati `200` (definisano u `Dockerfile`). Coolify to prikazuje kao status servisa.
- **Kontejner se ne diže / restart petlja:** pogledaj logove u Coolify-ju. Najčešće: nedostaje `AUTH_PASSWORD` ili je `SESSION_SECRET` < 32 znaka (poruka je na srpskom u logu).
- **Podaci nestali posle redeploy-a:** nije postavljen trajni volumen na `/app/data` (Način B, korak 5).
- **Slike se ne učitavaju / 404:** proveri da je `/app/data` upisiv i da volumen postoji.
- **Native moduli (better-sqlite3, sharp):** koriste prebuilt binarne fajlove za linux/amd64 i arm64 — rade na uobičajenim Coolify serverima bez dodatne kompilacije.
