import {describe, expect, it} from 'vitest';
import {lead, move, replace, toggle} from './team';

describe('move', () => {
  it('inserts a member at a later place and shifts the ones between back', () => {
    expect(move(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('inserts a member at an earlier place and shifts the ones between forward', () => {
    expect(move(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('sends a member dropped on an empty slot to the end of the team', () => {
    expect(move(['a', 'b', 'c'], 0, 5)).toEqual(['b', 'c', 'a']);
  });
});

describe('replace', () => {
  it('puts the newcomer at the replaced member\'s place and leaves the others where they were', () => {
    expect(replace(['a', 'b', 'c', 'd', 'e', 'f'], 2, 'x')).toEqual(['a', 'b', 'x', 'd', 'e', 'f']);
  });
});

describe('toggle', () => {
  it('adds a Pokémon at the end of a team with room', () => {
    expect(toggle(['a', 'b'], 'x')).toEqual(['a', 'b', 'x']);
  });

  it('removes a member and closes the gap', () => {
    expect(toggle(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
  });

  it('removes a member of a full team', () => {
    expect(toggle(['a', 'b', 'c', 'd', 'e', 'f'], 'f')).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('gives nothing for a Pokémon outside a full team, which needs a replacement instead', () => {
    expect(toggle(['a', 'b', 'c', 'd', 'e', 'f'], 'x')).toBeNull();
  });
});

describe('lead', () => {
  it('makes a member the lead and shifts the ones before it back', () => {
    expect(lead(['a', 'b', 'c', 'd'], 'c')).toEqual(['c', 'a', 'b', 'd']);
  });
});
