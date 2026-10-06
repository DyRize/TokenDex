import {describe, expect, it} from 'vitest';
import type {DexEntry} from '../../lib/save';
import {captures, duplicatedSpecies} from './captures';

const grad = (chain: number[], hour: number, more: Partial<DexEntry> = {}): DexEntry => ({
  baseID: chain[0], finalID: chain[chain.length - 1], rarity: 'common', isShiny: false, releasedAt: 0,
  chain, caughtAt: Date.UTC(2026, 8, 1, hour), unownForm: null, ...more,
});
const rows = (dex: DexEntry[]) => duplicatedSpecies(captures(dex, null));

describe('duplicatedSpecies', () => {
  it('lists a species graduated three times with its 3 copies, and leaves out one graduated once', () => {
    expect(rows([grad([1, 2, 3], 1), grad([4, 5, 6], 2), grad([1, 2, 3], 3), grad([1, 2, 3], 4)]))
      .toEqual([{finalId: 3, form: null, copies: 3}]);
  });

  it('sorts by copies, most first, then by Pokédex number', () => {
    const dex = [grad([4, 5, 6], 1), grad([4, 5, 6], 2), grad([16, 17, 18], 3), grad([16, 17, 18], 4), grad([16, 17, 18], 5),
      grad([1, 2, 3], 6), grad([1, 2, 3], 7)];
    expect(rows(dex).map(r => [r.finalId, r.copies])).toEqual([[18, 3], [3, 2], [6, 2]]);
  });

  it('counts an Eevee that grows into a new Eeveelution as no duplicate, and the same one again as one', () => {
    expect(rows([grad([133, 134], 1), grad([133, 135], 2), grad([133, 134], 3)])).toEqual([{finalId: 134, form: null, copies: 2}]);
  });

  it('keeps each Unown form apart', () => {
    const unown = (form: string, hour: number) => grad([201], hour, {unownForm: form});
    expect(rows([unown('b', 1), unown('c', 2)])).toEqual([]);
    expect(rows([unown('b', 1), unown('c', 2), unown('b', 3), unown('c', 4)]))
      .toEqual([{finalId: 201, form: 'b', copies: 2}, {finalId: 201, form: 'c', copies: 2}]);
  });

  it('leaves out released Pokémon, which neither are duplicates, nor make one, nor count as copies', () => {
    expect(rows([grad([1, 2, 3], 1), grad([1, 2, 3], 2, {releasedAt: 1})])).toEqual([]);
    expect(rows([grad([1, 2, 3], 1, {releasedAt: 1}), grad([1, 2, 3], 2)])).toEqual([]);
    expect(rows([grad([1, 2, 3], 1), grad([1, 2, 3], 2, {releasedAt: 1}), grad([1, 2, 3], 3)])).toEqual([{finalId: 3, form: null, copies: 2}]);
  });
});
