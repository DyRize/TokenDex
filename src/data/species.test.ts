import {describe, expect, it} from 'vitest';
import {NAMES_EN, NAMES_FR, RAR} from './species';

describe('species', () => {
  it('names the 649 species in both languages and gives each a rarity', () => {
    expect(NAMES_FR).toHaveLength(649);
    expect(NAMES_EN).toHaveLength(649);
    expect(RAR).toMatch(/^[curl]{649}$/);
  });
});
