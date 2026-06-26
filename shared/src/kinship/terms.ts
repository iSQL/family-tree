/**
 * Tabela pravila: oblik putanje (koraci gore/dole, linija, supružničke ivice,
 * polovi) → srpski termin + gramatički rod + detalj opisa.
 */
import type { PersonSlim } from '../types';
import type { KinGraph } from './graph';
import type { KinPath } from './resolve';

export type TermGender = 'm' | 'f' | 'n';

export interface ResolvedTerm {
  /** Termin (šta je B osobi A); null → kompozicioni fallback u index.ts. */
  term: string | null;
  /** Gramatički rod termina, za slaganje prisvojnog prideva ('Markov stric' / 'Markova tetka' / 'Markovo dete'). */
  gender: TermGender;
  /** Detalj u zagradi, npr. '(očev brat)'. */
  detail: string | null;
}

const NONE: ResolvedTerm = { term: null, gender: 'm', detail: null };

function t(term: string, gender: TermGender, detail: string | null = null): ResolvedTerm {
  return { term, gender, detail };
}

/**
 * Duboki preci preko 4. kolena (čukundeda) — [muški, ženski] oblik po broju koraka naviše.
 * Folklorni nazivi (od navr- naviše retko se standardizuju); izvor: tradicionalna srpska lestvica.
 */
const DEEP_ANCESTORS: Record<number, [string, string]> = {
  5: ['navrdeda', 'navrbaba'],
  6: ['kurđel', 'kurđela'],
  7: ['kurlebalo', 'kurlebala'],
  8: ['sukurdol', 'sukurdola'],
  9: ['sudepač', 'sudepača'],
  10: ['pardupan', 'pardupana'],
  11: ['ožimikura', 'ožimikurka'],
  12: ['kurajber', 'kurajbera'],
  13: ['sajkatava', 'sajkatavka'],
  14: ['beli orao', 'bela pčela'],
};

/** Detalj uz zet: muž krvne srodnice niz lozu (njeno mesto u porodici). */
function zetDetail(up: number, down: number): string | null {
  if (up === 0 && down === 1) return '(ćerkin muž)';
  if (up === 1 && down === 1) return '(sestrin muž)';
  if (up === 0 && down === 2) return '(unukin muž)';
  return null;
}

/** Detalj uz snaha: žena krvnog srodnika niz lozu (njegovo mesto u porodici). */
function snahaDetail(up: number, down: number): string | null {
  if (up === 0 && down === 1) return '(sinovljeva žena)';
  if (up === 1 && down === 1) return '(bratova žena)';
  if (up === 0 && down === 2) return '(unukova žena)';
  return null;
}

/** Bira termin za pronađenu putanju; NONE kad pravilo nije pokriveno. */
export function resolveTerm(graph: KinGraph, path: KinPath, a: PersonSlim, b: PersonSlim): ResolvedTerm {
  const { stepsUp: up, stepsDown: down, firstUpLine: line, spouseAtA: sA, spouseAtB: sB } = path;
  const bg = b.gender;
  const at = (i: number): PersonSlim | undefined => {
    const id = path.path[i];
    return id === undefined ? undefined : graph.persons.get(id);
  };
  // prvi čvor posle zajedničkog pretka (silazna strana: brat/sestra roditelja, A-in brat/sestra…)
  const firstDown = at((sA ? 1 : 0) + up + 1);
  // osoba za koju je B vezan supružničkom ivicom (kad postoji spouseAtB)
  const beforeB = at(path.path.length - 2);

  // ── samo supružnička ivica: muž/žena ──
  if (up === 0 && down === 0) {
    if (sA && sB) return NONE; // oba u braku sa istom trećom osobom — nije supružnik
    return bg === 'M' ? t('muž', 'm') : bg === 'F' ? t('žena', 'f') : t('supružnik', 'm');
  }

  // ── bez supružničkih ivica: krvno srodstvo ──
  if (!sA && !sB) {
    if (down === 0) {
      // direktan predak
      if (up === 1) return bg === 'M' ? t('otac', 'm') : bg === 'F' ? t('majka', 'f') : t('roditelj', 'm');
      if (up === 2) {
        const lineDetail = line === 'father' ? '(po ocu)' : '(po majci)';
        return bg === 'M' ? t('deda', 'm', lineDetail) : bg === 'F' ? t('baba', 'f', lineDetail) : NONE;
      }
      if (up === 3) return bg === 'M' ? t('pradeda', 'm') : bg === 'F' ? t('prababa', 'f') : NONE;
      if (up === 4) return bg === 'M' ? t('čukundeda', 'm') : bg === 'F' ? t('čukunbaba', 'f') : NONE;
      const deep = DEEP_ANCESTORS[up];
      if (deep) return bg === 'M' ? t(deep[0], 'm') : bg === 'F' ? t(deep[1], 'f') : NONE;
      return NONE;
    }
    if (up === 0) {
      // direktan potomak
      if (down === 1) return bg === 'M' ? t('sin', 'm') : bg === 'F' ? t('ćerka', 'f') : t('dete', 'n');
      if (down === 2) return bg === 'M' ? t('unuk', 'm') : bg === 'F' ? t('unuka', 'f') : NONE;
      if (down === 3) return bg === 'M' ? t('praunuk', 'm') : bg === 'F' ? t('praunuka', 'f') : NONE;
      if (down === 4) return bg === 'M' ? t('čukununuk', 'm') : bg === 'F' ? t('čukununuka', 'f') : NONE;
      // sve generacije ispod čukununuka: bele pčele
      if (down >= 5) return bg === 'M' ? t('beli orao', 'm') : bg === 'F' ? t('bela pčela', 'f') : NONE;
      return NONE;
    }
    if (up === 1 && down === 1) {
      // brat/sestra — puni ili polu (dele tačno jednog roditelja)
      const sharedFather = a.father_id !== null && a.father_id === b.father_id;
      const sharedMother = a.mother_id !== null && a.mother_id === b.mother_id;
      if (sharedFather && sharedMother) {
        return bg === 'M' ? t('brat', 'm') : bg === 'F' ? t('sestra', 'f') : t('brat/sestra', 'm');
      }
      const halfDetail = sharedFather ? '(po ocu)' : '(po majci)';
      if (bg === 'M') return t('polubrat', 'm', halfDetail);
      if (bg === 'F') return t('polusestra', 'f', halfDetail);
      return t('polubrat/polusestra', 'm', halfDetail);
    }
    if (up === 2 && down === 1) {
      // brat/sestra roditelja: stric / ujak / tetka
      if (bg === 'M') return line === 'father' ? t('stric', 'm', '(očev brat)') : t('ujak', 'm', '(majčin brat)');
      if (bg === 'F') return t('tetka', 'f', line === 'father' ? '(očeva sestra)' : '(majčina sestra)');
      return NONE;
    }
    if (up === 1 && down === 2 && firstDown !== undefined) {
      // dete brata/sestre: bratanac/bratanica, sestrić/sestričina
      if (firstDown.gender === 'M') {
        if (bg === 'M') return t('bratanac', 'm', a.gender === 'M' ? '(bratov sin, sinovac)' : '(bratov sin)');
        if (bg === 'F') return t('bratanica', 'f', '(bratova ćerka)');
        return NONE;
      }
      if (firstDown.gender === 'F') {
        if (bg === 'M') return t('sestrić', 'm', '(sestrin sin)');
        if (bg === 'F') return t('sestričina', 'f', '(sestrina ćerka)');
      }
      return NONE;
    }
    if (up === 2 && down === 2 && firstDown !== undefined) {
      // braća/sestre od strica/ujaka/tetke
      let via: string | null = null;
      if (firstDown.gender === 'M') via = line === 'father' ? 'od strica' : 'od ujaka';
      else if (firstDown.gender === 'F') via = 'od tetke';
      if (via === null) return NONE;
      if (bg === 'M') return t(`brat ${via}`, 'm');
      if (bg === 'F') return t(`sestra ${via}`, 'f');
      return NONE;
    }
    if (up === 2 && down === 3) {
      // dete brata/sestre od strica/ujaka/tetke (dete rođaka)
      if (bg === 'M') return t('rođaković', 'm', '(dete rođaka)');
      if (bg === 'F') return t('rođakovićka', 'f', '(dete rođake)');
      return NONE;
    }
    return NONE;
  }

  // ── supružnička ivica samo na A strani: rodbina supružnika ──
  if (sA && !sB) {
    const spouse = at(1);
    if (spouse === undefined) return NONE;
    if (up === 0 && down === 1) {
      // supružnikovo dete koje mi nije krvni rod: pastorak / pastorka
      const sd = spouse.gender === 'F' ? 'ženin' : spouse.gender === 'M' ? 'muževljev' : 'supružnikov';
      if (bg === 'M') return t('pastorak', 'm', `(${sd} sin)`);
      if (bg === 'F') return t('pastorka', 'f', `(${spouse.gender === 'F' ? 'ženina' : spouse.gender === 'M' ? 'muževljeva' : 'supružnikova'} ćerka)`);
      return NONE;
    }
    if (up === 1 && down === 0) {
      // roditelj supružnika: svekar/svekrva, tast/tašta
      if (spouse.gender === 'M') {
        if (bg === 'M') return t('svekar', 'm', '(muževljev otac)');
        if (bg === 'F') return t('svekrva', 'f', '(muževljeva majka)');
        return NONE;
      }
      if (spouse.gender === 'F') {
        if (bg === 'M') return t('tast', 'm', '(ženin otac)');
        if (bg === 'F') return t('tašta', 'f', '(ženina majka)');
      }
      return NONE;
    }
    if (up === 1 && down === 1) {
      // brat/sestra supružnika: dever/zaova, šurak/svastika
      if (spouse.gender === 'M') {
        if (bg === 'M') return t('dever', 'm', '(muževljev brat)');
        if (bg === 'F') return t('zaova', 'f', '(muževljeva sestra)');
        return NONE;
      }
      if (spouse.gender === 'F') {
        if (bg === 'M') return t('šurak', 'm', '(ženin brat)');
        if (bg === 'F') return t('svastika', 'f', '(ženina sestra)');
      }
      return NONE;
    }
    if (up === 1 && down === 2 && spouse.gender === 'F' && firstDown !== undefined && firstDown.gender === 'F') {
      // deca ženine sestre (svastike): svastić / svastičina
      if (bg === 'M') return t('svastić', 'm', '(sin ženine sestre)');
      if (bg === 'F') return t('svastičina', 'f', '(ćerka ženine sestre)');
      return NONE;
    }
    return NONE;
  }

  // ── supružnička ivica samo na B strani: supružnici rodbine ──
  if (!sA && sB) {
    if (beforeB === undefined) return NONE;
    if (down === 0) {
      // supružnik pretka
      if (up === 1) {
        // roditeljev supružnik koji mi nije krvni roditelj: očuh / maćeha
        if (bg === 'M') return t('očuh', 'm', beforeB.gender === 'F' ? '(majčin muž)' : '(roditeljev suprug)');
        if (bg === 'F') return t('maćeha', 'f', beforeB.gender === 'M' ? '(očeva žena)' : '(roditeljeva supruga)');
      }
      return NONE; // dublji „pomajka/poočim" preci nemaju ustaljen termin → fallback
    }
    if (up === 2 && down === 1) {
      // supružnik strica/ujaka/tetke: strina, ujna, teča
      if (bg === 'M' && beforeB.gender === 'F') return t('teča', 'm', '(tetkin muž)');
      if (bg === 'F' && beforeB.gender === 'M') {
        return line === 'father' ? t('strina', 'f', '(stričeva žena)') : t('ujna', 'f', '(ujakova žena)');
      }
      return NONE;
    }
    // opšti slučaj: supružnik krvnog srodnika niz lozu → zet (muž srodnice) / snaha (žena srodnika)
    if (bg === 'M' && beforeB.gender === 'F') return t('zet', 'm', zetDetail(up, down));
    if (bg === 'F' && beforeB.gender === 'M') return t('snaha', 'f', snahaDetail(up, down));
    return NONE;
  }

  // ── obe ivice: supružnici supružnikove braće/sestara (pašenog, jetrva, šurnjaja, svojak) ──
  if (up === 1 && down === 1) {
    const spouse = at(1); // A-in supružnik
    if (spouse === undefined || beforeB === undefined) return NONE; // beforeB = supružnikov brat/sestra
    if (spouse.gender === 'F') {
      // A oženjen — veza preko žene
      if (beforeB.gender === 'F' && bg === 'M') return t('pašenog', 'm', '(muž ženine sestre)');
      if (beforeB.gender === 'M' && bg === 'F') return t('šurnjaja', 'f', '(žena ženinog brata)');
    } else if (spouse.gender === 'M') {
      // A udata — veza preko muža
      if (beforeB.gender === 'M' && bg === 'F') return t('jetrva', 'f', '(žena muževljevog brata)');
      if (beforeB.gender === 'F' && bg === 'M') return t('svojak', 'm', '(muž muževljeve sestre)');
    }
  }
  return NONE;
}
