import {describe, expect, it} from 'vitest';
import {GRAD, scaled, stageCosts, toGraduation} from './balance';
import type {Active} from './save';

const active = (patch: Partial<Active> = {}): Active => ({
  baseID: 1, rarity: 'common', isShiny: false, path: [1], stage: 0, planned: [1, 2, 3], forms: 3, used: 0, boost: false, unownForm: null, ...patch,
});

describe('scaled', () => {
  it('clamps the slider to 10 %..200 % like the app', () => {
    expect(scaled(1000, 50)).toBe(500);
    expect(scaled(1000, 1)).toBe(100);
    expect(scaled(1000, 900)).toBe(2000);
  });
});

describe('stageCosts', () => {
  it('splits the graduation cost 1:2:3 over a three-form line', () => {
    const c = stageCosts(active(), 100);
    expect(c).toEqual([125e6, 250e6, 375e6]);
    expect(c.reduce((a, b) => a + b)).toBe(GRAD.common);
  });

  it('halves every form once the line has graduated, then applies the growth slider', () => {
    expect(stageCosts(active({boost: true}), 100)).toEqual([62.5e6, 125e6, 187.5e6]);
    expect(stageCosts(active(), 200)).toEqual([250e6, 500e6, 750e6]);
  });
});

describe('toGraduation', () => {
  it('counts what is left of the current form plus the forms after it', () => {
    expect(toGraduation(active({stage: 1, used: 50e6}), 100)).toBe(200e6 + 375e6);
  });
});
