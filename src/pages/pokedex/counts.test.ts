import {describe, expect, it} from 'vitest';
import {GENS, percent, tally} from './counts';

describe('tally', () => {
  it('counts the caught species of a range, then per rarity, legendary first', () => {
    expect(tally(new Set([1, 2, 25, 143, 144, 152]), 1, 151)).toEqual({caught: 5, total: 151, rarities: [
      {rarity: 'legendary', caught: 1, total: 5}, {rarity: 'rare', caught: 2, total: 35},
      {rarity: 'uncommon', caught: 1, total: 7}, {rarity: 'common', caught: 1, total: 104},
    ]});
  });

  it('leaves out a rarity the range does not have', () => {
    expect(tally(new Set(), 150, 151).rarities).toEqual([{rarity: 'legendary', caught: 0, total: 2}]);
  });

  it('adds up the regions of each rarity to the whole Pokédex', () => {
    const caught = new Set(Array.from({length: 649}, (_, i) => i + 1).filter(id => id % 3 === 0));
    const whole = tally(caught, 1, 649), regions = GENS.map(([, a, b]) => tally(caught, a, b));
    expect(whole.total).toBe(649);
    for (const r of whole.rarities) {
      const own = regions.flatMap(t => t.rarities.filter(x => x.rarity === r.rarity));
      expect([own.reduce((s, x) => s + x.caught, 0), own.reduce((s, x) => s + x.total, 0)]).toEqual([r.caught, r.total]);
    }
  });
});

describe('percent', () => {
  it('rounds down, so only a complete group shows 100', () => {
    expect(percent({caught: 299, total: 300})).toBe(99);
    expect(percent({caught: 300, total: 300})).toBe(100);
    expect(percent({caught: 1, total: 649})).toBe(0);
    expect(percent({caught: 0, total: 5})).toBe(0);
  });

  it('gives 29 for 29 of 100, where 29 / 100 * 100 falls just under', () => {
    expect(percent({caught: 29, total: 100})).toBe(29);
  });
});
