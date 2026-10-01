import {describe, expect, it} from 'vitest';
import {COST_N} from './model';
import {simulate, type SimParams} from './sim';

const params: SimParams = {g: 1, s: 1, rate: 100, freeWeek: 0, init: null};
const [noShop, candies, rareDupes, rareEnd] = simulate(params, 10);

describe('simulate', () => {
  it('is deterministic', () => {
    expect(simulate(params, 2)).toEqual(simulate(params, 2));
  });

  it('spends more tokens for every extra species, up to the full dex', () => {
    for (const r of [noShop, candies, rareDupes, rareEnd]) {
      for (let n = 2; n <= 649; n++) expect(r.tokens[n]).toBeGreaterThanOrEqual(r.tokens[n - 1]);
      expect(r.tokens[649]).toBeGreaterThan(0);
    }
  });

  it('agrees with the precomputed model curve without the shop', () => {
    for (const n of [100, 300, 649]) expect(Math.abs(noShop.tokens[n] / 1e9 / COST_N[n - 1] - 1)).toBeLessThan(0.15);
  });

  it('finishes faster with any shop strategy', () => {
    for (const r of [candies, rareDupes, rareEnd]) expect(r.tokens[649]).toBeLessThan(noShop.tokens[649]);
  });

  it('starts from a save: species already caught cost nothing', () => {
    const init = {dex: [1, 4, 7, 10, 13], finals: [], wallet: 0, candies: 0, active: null};
    const [r] = simulate({...params, init}, 2);
    expect(r.tokens[5]).toBe(0);
    expect(r.tokens[6]).toBeGreaterThan(0);
  });
});
