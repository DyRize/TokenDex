import {describe, expect, it} from 'vitest';
import boughtEggsSave from '../../../samples/bought-eggs.json';
import manyHatchesSave from '../../../samples/many-hatches.json';
import {readSaveFile, type State} from '../../lib/save';
import {BY_ID, DITTO, criteria, luckAfterEach, luckScore, possibleEggs, replay} from './luck';

const state = async (save: unknown) => (await readSaveFile({text: async () => JSON.stringify(save), lastModified: 0})).st;
const scoreFromScratch = (st: State, k: number, charmFrom: number) =>
  luckScore(criteria(replay(k <= st.dex.length ? {...st, dex: st.dex.slice(0, k), active: null} : st, true, charmFrom)));

describe('luckAfterEach', () => {
  it('gives every hatch the score computed from scratch on the hatches up to it, bought eggs and Shiny Charm included', async () => {
    const st = await state(manyHatchesSave), hs = replay(st, true, 60);
    expect(hs.filter(h => h.purchased)).toHaveLength(3);
    const curve = luckAfterEach(hs);
    expect(curve).toHaveLength(st.dex.length + 1);
    curve.forEach((score, i) => expect(score).toBeCloseTo(scoreFromScratch(st, i + 1, 60), 9));
  });

  it('moves the curve from the hatch the Shiny Charm starts at, not before', async () => {
    const st = await state(manyHatchesSave);
    const without = luckAfterEach(replay(st, false, 1)), from80 = luckAfterEach(replay(st, true, 80));
    expect(from80.slice(0, 79)).toEqual(without.slice(0, 79));
    expect(from80[79]).not.toBeCloseTo(without[79], 9);
  });
});

const raw = (dex: [base: number, rarity: string, released?: boolean][]) =>
  ({dex: dex.map(([baseID, rarity, released], i) => ({baseID, finalID: baseID, rarity, caughtAt: 800000000 + i * 86400, releasedAt: released ? 800000000 + i * 86400 : undefined})), collectedFinals: []});
// Bulbasaur graduates, then a Rare Egg gives Charmander and an Uncommon Egg gives Rhyhorn.
const eggSave = raw([[1, 'rare'], [19, 'common', true], [4, 'rare'], [16, 'common', true], [111, 'uncommon']]);

describe('replay with bought eggs', () => {
  it('draws a Rare Egg and an Uncommon Egg over the lines their guarantee allows', async () => {
    const hs = replay(await state(eggSave), false, 1, new Map([[3, {egg: 'rare', from: 'log'}], [5, {egg: 'uncommon', from: 'player'}]]));
    // Rare Egg pool: 120 lines, capture_rate summing to 3392 (339 for the 48 legendaries); Bulbasaur's 45 halves to 22.
    expect(hs[2]).toMatchObject({egg: 'rare', eggFrom: 'log', pUnc: 0, pDitto: 0});
    expect(hs[2].pLine).toBeCloseTo(45 / 3369, 12);
    expect(hs[2].pLeg).toBeCloseTo(339 / 3369, 12);
    expect(hs[2].pRare).toBeCloseTo(3030 / 3369, 12);
    // Uncommon Egg pool: 153 lines summing to 6527, of which 3135 uncommon; Bulbasaur and Charmander halve.
    expect(hs[4]).toMatchObject({egg: 'uncommon', eggFrom: 'player', pDitto: 0});
    expect(hs[4].pLine).toBeCloseTo(120 / 6481, 12);
    expect(hs[4].pUnc).toBeCloseTo(3135 / 6481, 12);
    expect(hs[4].pRare).toBeCloseTo(3007 / 6481, 12);
    expect(hs[4].pLeg).toBeCloseTo(339 / 6481, 12);
  });

  it('draws a Pokémon Egg exactly like a free egg', async () => {
    const st = await state(eggSave);
    const bought = replay(st, false, 1, new Map([[3, {egg: 'none', from: 'player'}]]))[2], unknown = replay(st, false, 1)[2];
    expect(bought.pLine).toBeCloseTo(45 / 43744, 12);
    for (const k of ['pLine', 'pLeg', 'pUnc', 'pRare', 'pDup', 'pFav', 'pDitto'] as const) expect(bought[k]).toBe(unknown[k]);
  });

  it('scores as before while no bought egg has a known type, even one that hatched a common', async () => {
    const many = await state(manyHatchesSave), bought = await state(boughtEggsSave);
    expect(replay(bought, false, 1).some(h => h.purchased && h.egg === null && BY_ID.get(h.e.base)?.rarity === 'common')).toBe(true);
    expect(luckScore(criteria(replay(many, true, 60)))).toBeCloseTo(42.87675587167211, 9);
    expect(luckScore(criteria(replay(bought, false, 60)))).toBeCloseTo(51.57784044118488, 9);
  });

  it('counts a bought egg of known type in every criterion, and leaves the unknown ones out except for shiny', async () => {
    const st = await state(boughtEggsSave), hs = replay(st, false, 1);
    const all = new Map(hs.filter(h => h.purchased).map(h => [h.n, {egg: possibleEggs(h.e.base).at(-1)!, from: 'player' as const}]));
    expect(criteria(replay(st, false, 1, all)).map(c => c.paid)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    const rare = criteria(hs).find(c => c.key === 'rare')!, rareKnown = criteria(replay(st, false, 1, all)).find(c => c.key === 'rare')!;
    expect(rare.paid).toBeGreaterThan(0);
    expect(rareKnown.obs).toBe(rare.obs + rare.paid);
  });
});

describe('possibleEggs', () => {
  it('offers only the eggs whose pool holds the line that hatched', () => {
    expect(possibleEggs(16)).toEqual(['none']);
    expect(possibleEggs(DITTO)).toEqual(['none']);
    expect(possibleEggs(111)).toEqual(['none', 'uncommon']);
    expect(possibleEggs(147)).toEqual(['none', 'uncommon', 'rare']);
    expect(possibleEggs(144)).toEqual(['none', 'uncommon', 'rare']);
  });
});
