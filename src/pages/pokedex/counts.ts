import {RAR, RAR_KEY} from '../../data/species';
import {tr} from '../../lib/i18n';
import type {Rarity} from '../../lib/save';

export const GENS: [string, number, number][] = [['Kanto', 1, 151], ['Johto', 152, 251], ['Hoenn', 252, 386], ['Sinnoh', 387, 493], [tr('Unys', 'Unova'), 494, 649]];

export interface Tally { caught: number; total: number }
export interface RarityTally extends Tally { rarity: Rarity }

export function tally(got: {has(id: number): boolean}, from: number, to: number): Tally & {rarities: RarityTally[]} {
  const all = {caught: 0, total: 0}, rarities = ['l', 'r', 'u', 'c'].map(code => ({rarity: RAR_KEY[code], caught: 0, total: 0}));
  for (let id = from; id <= to; id++) {
    const row = rarities.find(x => x.rarity === RAR_KEY[RAR[id - 1]])!, hit = got.has(id) ? 1 : 0;
    row.total++; row.caught += hit; all.total++; all.caught += hit;
  }
  return {...all, rarities: rarities.filter(row => row.total)};
}

// 29 / 100 * 100 is 28.999999999999996: multiply first.
export const percent = ({caught, total}: Tally) => Math.floor(caught * 100 / total);
