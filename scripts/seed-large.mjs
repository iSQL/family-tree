/**
 * Dev alat: ubaci veliko, povezano porodično stablo (~1500 osoba) kroz API,
 * radi testiranja performansi i adaptivnog ograničavanja dubine prikaza.
 * Zahteva pokrenut server (`npm run dev`) sa AUTH_DISABLED i bez Origin headera.
 *
 *   node scripts/seed-large.mjs [target]   # podrazumevano 1500
 *
 * Sve ubačene osobe imaju notes = 'SEED-LARGE' radi lakšeg čišćenja:
 *   node scripts/seed-large.mjs --purge
 */
const BASE = 'http://localhost:3001';
const MARKER = 'SEED-LARGE';
const TARGET = Number(process.argv[2]) || 1500;

async function api(path, opts = {}) {
  const res = await fetch(BASE + path, {
    method: opts.method ?? 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 204) return null;
  const txt = await res.text();
  if (!res.ok) throw new Error(`${opts.method ?? 'GET'} ${path} → ${res.status}: ${txt}`);
  return txt ? JSON.parse(txt) : null;
}

// --- Čišćenje prethodnog seed-a -------------------------------------------------
if (process.argv.includes('--purge')) {
  const tree = await api('/api/tree');
  // notes nije u /api/tree (PersonSlim), pa dohvatamo pun red da nađemo marker.
  let purged = 0;
  for (const p of tree.persons) {
    const full = await api(`/api/persons/${p.id}`);
    if (full?.notes === MARKER) {
      await api(`/api/persons/${p.id}`, { method: 'DELETE' });
      purged++;
    }
  }
  console.log(`Obrisano ${purged} seed osoba.`);
  process.exit(0);
}

// --- Imena ----------------------------------------------------------------------
const MALE = ['Marko', 'Nikola', 'Stefan', 'Luka', 'Miloš', 'Petar', 'Đorđe', 'Vuk', 'Lazar', 'Filip', 'Aleksa', 'Bogdan', 'Uroš', 'Pavle', 'Dušan', 'Vladimir', 'Nemanja', 'Strahinja'];
const FEMALE = ['Ana', 'Jelena', 'Milica', 'Marija', 'Sofija', 'Teodora', 'Katarina', 'Jovana', 'Anđela', 'Sara', 'Mina', 'Dunja', 'Nataša', 'Ivana', 'Tijana', 'Sanja', 'Vesna', 'Ljubica'];
const SURNAMES = ['Petrović', 'Jovanović', 'Nikolić', 'Marković', 'Đorđević', 'Stojanović', 'Ilić', 'Pavlović', 'Kovačević', 'Lukić', 'Popović', 'Ristić', 'Mitrović', 'Savić'];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

let total = 0;
async function createPerson(gender, year, surname, fatherId, motherId, maiden) {
  const first = gender === 'M' ? pick(MALE) : pick(FEMALE);
  const p = await api('/api/persons', {
    method: 'POST',
    body: {
      first_name: first,
      last_name: surname,
      maiden_name: maiden ?? null,
      gender,
      birth_date: String(year),
      father_id: fatherId,
      mother_id: motherId,
      notes: MARKER,
    },
  });
  total++;
  if (total % 200 === 0) console.log(`  …${total}/${TARGET}`);
  return p;
}
async function marry(husbandId, wifeId, year) {
  await api('/api/unions', {
    method: 'POST',
    body: { partner1_id: husbandId, partner2_id: wifeId, type: 'marriage', start_date: String(year) },
  });
}

const yearOf = (gen) => 1850 + gen * 28;

// --- Founderi (gen 0) -----------------------------------------------------------
console.log(`Seeding do ~${TARGET} osoba…`);
let couples = [];
for (let i = 0; i < 8 && total < TARGET; i++) {
  const sur = pick(SURNAMES);
  const h = await createPerson('M', yearOf(0), sur, null, null);
  const w = await createPerson('F', yearOf(0), sur, null, null, pick(SURNAMES));
  await marry(h.id, w.id, yearOf(0));
  couples.push({ h, w, surname: sur });
}

// --- Generacije: deca po paru, pa brak sa pridošlim supružnikom -----------------
let gen = 1;
while (total < TARGET && couples.length > 0) {
  const children = [];
  for (const c of couples) {
    if (total >= TARGET) break;
    const n = randInt(1, 4);
    for (let k = 0; k < n && total < TARGET; k++) {
      const g = Math.random() < 0.5 ? 'M' : 'F';
      const ch = await createPerson(g, yearOf(gen), c.surname, c.h.id, c.w.id);
      children.push({ ...ch, gender: g, surname: c.surname });
    }
  }
  const next = [];
  for (const ch of children) {
    if (total >= TARGET) break;
    if (Math.random() < 0.78) {
      const spouseGender = ch.gender === 'M' ? 'F' : 'M';
      const spouseSur = pick(SURNAMES);
      const sp = await createPerson(spouseGender, yearOf(gen), spouseSur, null, null,
        spouseGender === 'F' ? pick(SURNAMES) : null);
      const husband = ch.gender === 'M' ? ch.id : sp.id;
      const wife = ch.gender === 'M' ? sp.id : ch.id;
      await marry(husband, wife, yearOf(gen));
      // Sledeća generacija nosi prezime muža.
      next.push({ h: { id: husband }, w: { id: wife }, surname: ch.gender === 'M' ? ch.surname : spouseSur });
    }
  }
  couples = next;
  gen++;
}

const final = await api('/api/tree');
console.log(`Gotovo: ${total} ubačeno, ${final.persons.length} ukupno u bazi, ${gen} generacija.`);
