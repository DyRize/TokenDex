// The draw of the next egg (CompanionStore.chooseBase). Pure, so it runs in tests without the page.
export type Egg = 'none' | 'uncommon' | 'rare';
// The highest capture_rate an egg can draw (Rarity.captureRateCeiling).
export const CEIL: Record<Egg, number> = {none: 255, uncommon: 120, rare: 45};
type Drawn = {id: number; cr: number};

export const weight = (l: Drawn, collected: Set<number>) => collected.has(l.id) ? Math.max(1, Math.floor(l.cr / 2)) : Math.max(1, l.cr);

export function nextEgg<L extends Drawn>(lines: L[], graduated: number[], active: number | null, egg: Egg, ceil: number) {
  // A free egg only comes once the active Pokémon graduates; buying an egg releases it without graduating it.
  const collected = new Set(graduated);
  if (active && egg === 'none') collected.add(active);
  const pool = lines.filter(l => l.cr <= ceil);
  const w = pool.map(l => weight(l, collected));
  const total = w.reduce((a, b) => a + b, 0);
  const p = new Map(pool.map((l, i) => [l.id, w[i] / total]));
  return {pool, p, collected};
}
