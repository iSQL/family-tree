import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import type { KinshipResult, KinshipSystem } from '@shared/kinship';
import { STR } from './strings';

interface KinshipSystemContextValue {
  kinshipSystem: KinshipSystem;
  setKinshipSystem: (system: KinshipSystem) => void;
}

const KinshipSystemContext = createContext<KinshipSystemContextValue>({
  kinshipSystem: 'civil',
  setKinshipSystem: () => undefined,
});

function readStoredKinshipSystem(): KinshipSystem {
  try {
    const v = localStorage.getItem('kinship_system');
    if (v === 'civil' || v === 'canon') return v;
  } catch {
    /* localStorage nedostupan */
  }
  return 'civil';
}

export function KinshipSystemProvider({ children }: { children: ReactNode }) {
  const [kinshipSystem, setKinshipSystemState] = useState<KinshipSystem>(readStoredKinshipSystem);

  const setKinshipSystem = useCallback((s: KinshipSystem) => {
    try {
      localStorage.setItem('kinship_system', s);
    } catch {
      /* ignoriši */
    }
    setKinshipSystemState(s);
  }, []);

  return (
    <KinshipSystemContext.Provider value={{ kinshipSystem, setKinshipSystem }}>
      {children}
    </KinshipSystemContext.Provider>
  );
}

export function useKinshipSystem(): KinshipSystemContextValue {
  return useContext(KinshipSystemContext);
}


export interface KinshipDegreeDisplay {
  /** Stepen za prikaz u izabranom sistemu; null kad srodstvo nema stepen (tazbina, supružnici). */
  degree: number | null;
  /** Kratka oznaka sistema u znački („rimsko" / „kanonsko"). */
  badge: string;
  /** Objašnjenje sistema za `title` atribut. */
  tooltip: string;
  /** Da li je pobočna linija nejednaka (samo kanonski sistem). */
  unequalLine: boolean;
  /** Opis srodstva prilagođen izabranom sistemu. */
  description: string;
}

/**
 * Priprema prikaz stepena srodstva za izabrani sistem (rimski/kanonski).
 * Deljeno između prikaza rezultata i strane sa vezom.
 */
export function kinshipDegreeDisplay(
  result: KinshipResult,
  system: KinshipSystem,
): KinshipDegreeDisplay {
  const isCanon = system === 'canon';
  const unequalLine = isCanon && result.isCanonEqualLine === false;
  const tooltip = isCanon
    ? unequalLine
      ? `${STR.kinship.systemCanon}: duža linija do zajedničkog pretka (${STR.kinship.unequalLine})`
      : `${STR.kinship.systemCanon}: broj generacija do zajedničkog pretka`
    : `${STR.kinship.systemCivil}: zbir rođenja do zajedničkog pretka i od njega`;

  // Kompozicioni opis („…u N. kolenu") nosi rimski stepen — u kanonskom režimu ga zamenjujemo.
  let description = result.description;
  if (isCanon && result.term === null && result.civilDegree !== null && result.canonDegree !== null) {
    description = description.replace(
      `u ${result.civilDegree}. kolenu`,
      `u ${result.canonDegree}. kanonskom stepenu`,
    );
  }

  return {
    degree: isCanon ? result.canonDegree : result.civilDegree,
    badge: isCanon ? STR.kinship.systemCanonBadge : STR.kinship.systemCivilBadge,
    tooltip,
    unequalLine,
    description,
  };
}
