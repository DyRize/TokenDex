import {describe, expect, it} from 'vitest';
import {readSaveFile} from '../../lib/save';
import {knownEggs, type Purchase} from './eggs';

const T = 800000000, DAY = 86400;
const iso = (appleSeconds: number) => new Date((appleSeconds + 978307200) * 1000).toISOString().replace('.000', '');
// Bought eggs: Charmander at hatch 3, Rhyhorn at 5, a disguised Ditto at 7, and Dratini still growing at 9.
const st = (await readSaveFile({text: async () => JSON.stringify({collectedFinals: [], active: {baseID: 147, rarity: 'rare'}, dex: (
  [[1, 'rare'], [19, 'common', 1], [4, 'rare'], [16, 'common', 1], [111, 'uncommon'], [10, 'common', 1], [132, 'rare'], [21, 'common', 1]] as const)
  .map(([baseID, rarity, released], i) => ({baseID, finalID: baseID, rarity, caughtAt: T + i * DAY + 0.42, releasedAt: released && T + i * DAY + 0.42}))}), lastModified: 0})).st;
const bought = (i: number, tier: Purchase['tier'], base: number | null, late = 0): Purchase => ({at: iso(T + i * DAY + late), tier, base});

describe('knownEggs', () => {
  it('gives a bought egg the type of the purchase logged as its predecessor was released', () => {
    const eggs = knownEggs(st, [bought(1, 'rare', 4), bought(3, 'uncommon', 111, 2), bought(7, 'rare', null)], {});
    expect([...eggs]).toEqual([[3, {egg: 'rare', from: 'log'}], [5, {egg: 'uncommon', from: 'log'}], [9, {egg: 'rare', from: 'log'}]]);
  });

  it('ignores a purchase no released entry matches, and one whose next hatch has another base', () => {
    expect(knownEggs(st, [bought(2, 'rare', 4), bought(1, 'rare', 4, 3600), bought(3, 'uncommon', 112)], {}).size).toBe(0);
  });

  it('takes a Ditto from the purchase that names the line it hatched disguised as, if that line could disguise it', () => {
    expect(knownEggs(st, [bought(5, 'none', 16)], {}).get(7)).toEqual({egg: 'none', from: 'log'});
    expect(knownEggs(st, [bought(5, 'rare', 147)], {}).size).toBe(0);
  });

  it('takes the player\'s choice where the log says nothing, among the eggs that could give that hatch', () => {
    const eggs = knownEggs(st, [], {1: 'none', 3: 'uncommon', 5: 'rare', 7: 'none', 9: 'rare'});
    expect([...eggs]).toEqual([[3, {egg: 'uncommon', from: 'player'}], [7, {egg: 'none', from: 'player'}], [9, {egg: 'rare', from: 'player'}]]);
  });

  it('lets the log win over the player\'s choice', () => {
    expect(knownEggs(st, [bought(1, 'rare', 4)], {3: 'none'}).get(3)).toEqual({egg: 'rare', from: 'log'});
  });
});
