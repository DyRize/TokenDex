import {describe, expect, it} from 'vitest';
import manyHatchesSave from '../../../samples/many-hatches.json';
import {readSaveFile, type State} from '../../lib/save';
import {criteria, luckAfterEach, luckScore, replay} from './luck';

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
