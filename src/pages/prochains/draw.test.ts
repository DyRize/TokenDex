import {describe, expect, it} from 'vitest';
import {nextEgg} from './draw';

const lines = [{id: 1, cr: 45}, {id: 4, cr: 45}, {id: 10, cr: 255}];

describe('nextEgg', () => {
  it('counts the growing line as graduated for the egg that follows its graduation', () => {
    const {p, collected} = nextEgg(lines, [], 4, 'none', 255);
    expect(collected.has(4)).toBe(true);
    expect(p.get(4)).toBeCloseTo(22 / (45 + 22 + 255));
  });

  it('keeps the full weight of the growing line for a bought egg, which releases it', () => {
    const {p, collected} = nextEgg(lines, [], 4, 'rare', 45);
    expect(collected.has(4)).toBe(false);
    expect(p.get(4)).toBeCloseTo(0.5);
  });

  it('halves a line graduated before, whatever the egg', () => {
    expect(nextEgg(lines, [4], 4, 'rare', 45).p.get(4)).toBeCloseTo(22 / (45 + 22));
  });
});
