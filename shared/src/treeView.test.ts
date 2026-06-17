import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ANCESTRY_DEPTH,
  DEFAULT_PROGENY_DEPTH,
  LARGE_TREE_THRESHOLD,
  resolveTreeDepth,
} from './treeView';

describe('resolveTreeDepth', () => {
  it('malo stablo bez parametara → neograničeno (oba undefined)', () => {
    expect(resolveTreeDepth(10, null, null)).toEqual({ ancestry: undefined, progeny: undefined });
    expect(resolveTreeDepth(LARGE_TREE_THRESHOLD, undefined, undefined)).toEqual({
      ancestry: undefined,
      progeny: undefined,
    });
  });

  it('veliko stablo bez parametara → adaptivni podrazumevani', () => {
    expect(resolveTreeDepth(LARGE_TREE_THRESHOLD + 1, null, null)).toEqual({
      ancestry: DEFAULT_ANCESTRY_DEPTH,
      progeny: DEFAULT_PROGENY_DEPTH,
    });
  });

  it('eksplicitna dubina pobeđuje, nezavisno po osi', () => {
    expect(resolveTreeDepth(5000, 4, 1)).toEqual({ ancestry: 4, progeny: 1 });
    // Zadat samo up; down ostaje na adaptivnom podrazumevanom za veliko stablo.
    expect(resolveTreeDepth(5000, 4, null)).toEqual({
      ancestry: 4,
      progeny: DEFAULT_PROGENY_DEPTH,
    });
  });

  it('dubina 0 (samo glavna osoba) se poštuje — nije isto što i undefined', () => {
    expect(resolveTreeDepth(5000, 0, 0)).toEqual({ ancestry: 0, progeny: 0 });
  });

  it('eksplicitna dubina nadjačava i kod malog stabla', () => {
    expect(resolveTreeDepth(10, 1, 2)).toEqual({ ancestry: 1, progeny: 2 });
  });

  it('nevalidni parametri → tretiraju se kao nezadati', () => {
    // negativan, necelobrojni, NaN → undefined (pa adaptivni podrazumevani za veliko stablo)
    expect(resolveTreeDepth(5000, -1, 2.5)).toEqual({
      ancestry: DEFAULT_ANCESTRY_DEPTH,
      progeny: DEFAULT_PROGENY_DEPTH,
    });
    expect(resolveTreeDepth(10, Number.NaN, -3)).toEqual({
      ancestry: undefined,
      progeny: undefined,
    });
  });
});
