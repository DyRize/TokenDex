import {describe, expect, it} from 'vitest';
import boughtEggsSave from '../../../samples/bought-eggs.json';
import manyHatchesSave from '../../../samples/many-hatches.json';
import {readSaveFile, type State} from '../../lib/save';
import type {Egg} from '../prochains/draw';
import {BY_ID, DITTO, averageWait, criteria, hatchPace, luckAfterEach, luckEffects, luckScore, possibleEggs, replay, type Hatch} from './luck';

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

  it('keeps the curve of the made-up save with 150 hatches', async () => {
    const curve = luckAfterEach(replay(await state(manyHatchesSave), true, 60));
    expect(curve.reduce((a, b) => a + b, 0)).toBeCloseTo(7209.475069804471, 9);
    [54.40546290788233, 59.08586358456781, 53.81551083315569, 42.11584057014071, 42.87675587167211]
      .forEach((score, k) => expect(curve[[0, 9, 49, 99, 149][k]]).toBeCloseTo(score, 9));
  });
});

describe('luckEffects', () => {
  it('gives each hatch how much it moved the luck score, from the 50 of a player with no hatch', async () => {
    const curve = luckAfterEach(replay(await state(manyHatchesSave), true, 60)), effects = luckEffects(curve);
    expect(luckScore(criteria([]))).toBe(50);
    expect(effects[0]).toBeCloseTo(curve[0] - 50, 12);
    expect(effects[99]).toBeCloseTo(curve[99] - curve[98], 12);
    expect(effects.reduce((a, b) => a + b, 50)).toBeCloseTo(curve.at(-1)!, 9);
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
    expect(luckScore(criteria(replay(st, false, 1, all)))).toBeCloseTo(55.211472766724256, 9);
    const rare = criteria(hs).find(c => c.key === 'rare')!, rareKnown = criteria(replay(st, false, 1, all)).find(c => c.key === 'rare')!;
    expect(rare.paid).toBeGreaterThan(0);
    expect(rareKnown.obs).toBe(rare.obs + rare.paid);
  });
});

const OUTCOMES = ['pCommon', 'pUnc', 'pRare', 'pLeg', 'pDitto'] as const;
const OUTCOME = {common: 'pCommon', uncommon: 'pUnc', rare: 'pRare', legendary: 'pLeg'} as const;
const hatched = (h: Hatch) => h[h.ditto ? 'pDitto' : OUTCOME[BY_ID.get(h.e.base)!.rarity]];

describe('odds of what hatched', () => {
  it('splits every free hatch into five rarities adding up to 1, and gives the rarity and the new line or duplicate that hatched, a Ditto included', async () => {
    const hs = [...replay(await state(manyHatchesSave), true, 60), ...replay(await state(raw([[1, 'rare'], [DITTO, 'rare']])), false, 1)].filter(h => !h.purchased);
    expect(hs.filter(h => h.ditto)).toHaveLength(1);
    for (const h of hs) {
      expect(OUTCOMES.reduce((a, k) => a + h[k], 0)).toBeCloseTo(1, 12);
      expect(h.pRarity).toEqual({low: hatched(h), high: hatched(h)});
      const novelty = h.isDup ? h.pDup : 1 - h.pDup;
      expect(h.pNovelty).toEqual({low: novelty, high: novelty});
    }
    expect(hs.some(h => h.isDup)).toBe(true);
  });

  it('draws a bought egg of known type over its own pool, with no common and no Ditto from a guaranteed egg', async () => {
    const st = await state(eggSave);
    const hs = replay(st, false, 1, new Map([[3, {egg: 'rare', from: 'log'}], [5, {egg: 'uncommon', from: 'player'}]]));
    expect(hs[2]).toMatchObject({pCommon: 0, pDitto: 0});
    expect(hs[2].pRarity.low).toBeCloseTo(3030 / 3369, 12);
    expect(hs[2].pRarity.high).toBe(hs[2].pRarity.low);
    expect(hs[2].pNovelty.low).toBeCloseTo(3347 / 3369, 12);
    expect(hs[4]).toMatchObject({pCommon: 0, pDitto: 0});
    expect(hs[4].pRarity.low).toBeCloseTo(3135 / 6481, 12);
    expect(hs[4].pRarity.high).toBe(hs[4].pRarity.low);
    expect(hs[4].pNovelty.low).toBeCloseTo(6437 / 6481, 12);
    expect(replay(st, false, 1, new Map([[3, {egg: 'none', from: 'player'}]]))[2].pRarity.low).toBeCloseTo(3030 / 43744, 12);
  });

  it('gives a bought egg of unknown type the range over the eggs that could have produced it, and a single value for a common', async () => {
    const st = await state(eggSave), hs = replay(st, false, 1);
    const under = (n: number, egg: Egg) => replay(st, false, 1, new Map([[n, {egg, from: 'player'}]]))[n - 1];
    expect(hs[2].pRarity).toEqual({low: under(3, 'none').pRarity.low, high: under(3, 'rare').pRarity.low});
    expect(under(3, 'uncommon').pRarity.low).toBeGreaterThan(under(3, 'none').pRarity.low);
    expect(under(3, 'uncommon').pRarity.low).toBeLessThan(under(3, 'rare').pRarity.low);
    expect(hs[2].pNovelty).toEqual({low: under(3, 'rare').pNovelty.low, high: under(3, 'none').pNovelty.low});
    expect(hs[4].pRarity).toEqual({low: under(5, 'none').pRarity.low, high: under(5, 'uncommon').pRarity.low});
    expect(hs[4].pNovelty).toEqual({low: under(5, 'uncommon').pNovelty.low, high: under(5, 'none').pNovelty.low});
    const common = replay(await state(boughtEggsSave), false, 1).find(h => h.purchased && h.egg === null && BY_ID.get(h.e.base)?.rarity === 'common')!;
    expect(common.pRarity).toEqual({low: common.pCommon, high: common.pCommon});
    expect(common.pNovelty.low).toBe(common.pNovelty.high);
  });
});

describe('hatchPace', () => {
  const first = (800000000 + 978307200) * 1000, DAY = 86400000;
  it('counts the dated hatches per week, from the first one to the save\'s date', async () => {
    expect(hatchPace(await state(eggSave), first + 14 * DAY)).toBe(2.5);
  });

  it('gives no pace with fewer than two dated hatches, or less than a day between them', async () => {
    const st = await state(eggSave);
    expect(hatchPace({...st, dex: st.dex.map(d => ({...d, caughtAt: null}))}, first + 14 * DAY)).toBeNull();
    expect(hatchPace({...st, dex: [st.dex[0], {...st.dex[1], caughtAt: null}]}, first + 14 * DAY)).toBeNull();
    expect(hatchPace({...st, dex: [st.dex[0], {...st.dex[1], caughtAt: first + DAY - 1}]}, first + 14 * DAY)).toBeNull();
  });
});

describe('averageWait', () => {
  it('turns the odds of a draw into the time it takes on average at a pace, in days, weeks, months or years', () => {
    expect(averageWait(1 / 10, 7)).toEqual({n: 10, unit: 'day'});
    expect(averageWait(1 / 30, 5)).toEqual({n: 6, unit: 'week'});
    expect(averageWait(1 / 100, 2.5)).toEqual({n: 9, unit: 'month'});
    expect(averageWait(1 / 14589, 12)).toEqual({n: 23, unit: 'year'});
  });

  it('switches unit once the rounded wait reaches 14 days, 3 months and 2 years, and never shows less than 1', () => {
    expect(averageWait(1 / 13.4, 7)).toEqual({n: 13, unit: 'day'});
    expect(averageWait(1 / 13.6, 7)).toEqual({n: 2, unit: 'week'});
    expect(averageWait(1 / 91.3, 7)).toEqual({n: 13, unit: 'week'});
    expect(averageWait(1 / 91.4, 7)).toEqual({n: 3, unit: 'month'});
    expect(averageWait(1 / 715, 7)).toEqual({n: 23, unit: 'month'});
    expect(averageWait(1 / 716, 7)).toEqual({n: 2, unit: 'year'});
    expect(averageWait(1 / 2, 100)).toEqual({n: 1, unit: 'day'});
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
