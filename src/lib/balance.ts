import type {Active, Rarity} from './save';

/* Growth and shop rules of the app (PokemonBalance, RareCandy, ShinyCharm, FreshEgg), before the sliders. */
export const GRAD: Record<Rarity, number> = {common: 750e6, uncommon: 1875e6, rare: 3e9, legendary: 6e9};
export const EGG_COST = 5e6;
export const CANDY_XP = 100e6;
export const PRICE = {candy: 500e6, mint: 100e6, egg: 1e9, uncommonEgg: 2.5e9, rareEgg: 4e9, charm: 3e9};
/** A cost at slider pct (percent), clamped to 10 to 200 % like the app. */
export const scaled = (x: number, pct: number) => Math.round(x * Math.min(2, Math.max(0.1, pct / 100)));
/** Cost of each form of the growing line at growth g (percent); halved when the line already graduated. */
export function stageCosts(a: Active, g: number) {
  const k = Math.max(1, a.forms), den = k * (k + 1) / 2, mult = a.boost ? 2 : 1;
  return Array.from({length: k}, (_, i) => scaled(Math.max(1, Math.round(Math.round(GRAD[a.rarity] * (i + 1) / den) / mult)), g));
}
export const toGraduation = (a: Active, g: number) => { const c = stageCosts(a, g); return c[a.stage] - a.used + c.slice(a.stage + 1).reduce((x, y) => x + y, 0); };
