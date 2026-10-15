import {afterEach, describe, expect, it, vi} from 'vitest';
import {fetchServedSave, readSaveFile} from './save';

const file = (v: unknown, lastModified = 1_790_000_000_000) => ({text: async () => JSON.stringify(v), lastModified});
const state = {
  dex: [
    {id: 'a', baseID: 1, finalID: 3, rarity: 'common', isShiny: true, chainOrder: [1, 2, 3], caughtAt: 0},
    {baseID: 201, finalID: 201, rarity: 'uncommon', releasedAt: 812345678, caughtAt: '2026-09-01T10:00:00Z', unownForm: 'k'},
  ],
  collectedFinals: ['1:3'],
  active: {baseID: 7, rarity: 'uncommon', pathIDs: [7], stageIndex: 0, totalForms: 3, usedAtStage: 10, hasGrowthBoost: true},
  inventory: {rareCandy: 2}, usedSinceInstall: 100, spentTokens: 40,
};

describe('readSaveFile', () => {
  it("reads the app's companion-state.json", async () => {
    const {at, st} = await readSaveFile(file(state));
    expect(at).toBe(1_790_000_000_000);
    expect(st.dex[0]).toMatchObject({id: 'a', chain: [1, 2, 3], isShiny: true, releasedAt: 0, caughtAt: Date.UTC(2001, 0, 1), unownForm: null});
    expect(st.dex[1]).toMatchObject({chain: [201], isShiny: false, releasedAt: 1, caughtAt: Date.UTC(2026, 8, 1, 10), unownForm: 'k'});
    expect(st.active).toEqual({baseID: 7, rarity: 'uncommon', isShiny: false, path: [7], stage: 0, planned: [7], forms: 3, used: 10, boost: true, unownForm: null});
    expect(st).toMatchObject({eggUsage: 0, pendingHatchID: null, eggTier: null, inventory: {rareCandy: 2}, usedSinceInstall: 100, spentTokens: 40});
  });

  it("hides a disguised Ditto's shiny until its reveal, like the app", async () => {
    const shiny = async (active: object) => (await readSaveFile(file({...state, active: {...state.active, isShiny: true, ...active}}))).st.active!.isShiny;
    expect(await shiny({dittoDisguise: 7})).toBe(false);
    expect(await shiny({dittoDisguise: 7, dittoRevealed: false})).toBe(false);
    expect(await shiny({baseID: 132, dittoDisguise: 7, dittoRevealed: true})).toBe(true);
    expect(await shiny({dittoDisguise: null})).toBe(true);
    expect(await shiny({})).toBe(true);
  });

  it("doesn't know which version of the app wrote a companion-state.json", async () => {
    expect((await readSaveFile(file(state))).appVersion).toBeUndefined();
  });

  it("reads an export, dated by its exportedAt", async () => {
    const {at, st} = await readSaveFile(file({format: 'poketokenbar.save', exportedAt: '2026-09-30T08:00:00Z', state}));
    expect(at).toBe(Date.UTC(2026, 8, 30, 8));
    expect(st.dex).toHaveLength(2);
  });

  it('keeps the version of the app an export records', async () => {
    const save = await readSaveFile(file({format: 'poketokenbar.save', appVersion: '2.5.4', exportedAt: '2026-09-30T08:00:00Z', state}));
    expect(save.appVersion).toBe('2.5.4');
  });

  it('rejects anything else', async () => {
    await expect(readSaveFile(file({dex: []}))).rejects.toThrow('not a PokeTokenBar save');
    await expect(readSaveFile({text: async () => '{', lastModified: 0})).rejects.toThrow(SyntaxError);
  });
});

describe('fetchServedSave', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('carries the version of the app serve.py reports, or none', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(state), {headers: {'X-PokeTokenBar-Version': '2.6.0'}}));
    expect((await fetchServedSave())!.appVersion).toBe('2.6.0');
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(state)));
    expect((await fetchServedSave())!.appVersion).toBeUndefined();
  });
});
