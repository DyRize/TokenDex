import {afterEach, describe, expect, it, vi} from 'vitest';
import {commitNotice} from './commit';
import {SAVE_KEY, fetchServedSave, readSaveFile, readStoredSave} from './save';

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
    expect(st.dex[0]).toMatchObject({id: 'a', chain: [1, 2, 3], isShiny: true, releasedAt: 0, caughtAt: Date.UTC(2001, 0, 1), form: null});
    expect(st.dex[1]).toMatchObject({chain: [201], isShiny: false, releasedAt: 1, caughtAt: Date.UTC(2026, 8, 1, 10), form: 'k'});
    expect(st.active).toEqual({baseID: 7, rarity: 'uncommon', isShiny: false, path: [7], stage: 0, planned: [7], forms: 3, used: 10, boost: true, form: null});
    expect(st).toMatchObject({eggUsage: 0, pendingHatchID: null, pendingForm: null, eggTier: null, inventory: {rareCandy: 2}, usedSinceInstall: 100, spentTokens: 40});
  });

  it('reads the form of graduations and of the growing Pokémon from form, else unownForm', async () => {
    const read = async (keys: object) => (await readSaveFile(file({...state,
      dex: [{baseID: 422, finalID: 423, rarity: 'common', chainOrder: [422, 423], ...keys}],
      active: {...state.active, baseID: 422, pathIDs: [422, 423], ...keys}}))).st;
    const forms = async (keys: object) => { const st = await read(keys); return [st.dex[0].form, st.active!.form]; };
    expect(await forms({form: 'east'})).toEqual(['east', 'east']);
    expect(await forms({unownForm: 'east'})).toEqual(['east', 'east']);
    expect(await forms({form: 'east', unownForm: 'west'})).toEqual(['east', 'east']);
    expect(await forms({form: null, unownForm: 'east'})).toEqual(['east', 'east']);
    const unown = await readSaveFile(file({...state, dex: [{baseID: 201, finalID: 201, rarity: 'common', chainOrder: [201], form: 'k'}]}));
    expect(unown.st.dex[0].form).toBe('k');
  });

  it("reads a missing or unknown form as the line's default, and no form for a line without any", async () => {
    const form = async (entry: object) => (await readSaveFile(file({...state, dex: [{rarity: 'common', ...entry}]}))).st.dex[0].form;
    expect(await form({baseID: 422, finalID: 423, chainOrder: [422, 423]})).toBe('west');
    expect(await form({baseID: 422, finalID: 423, chainOrder: [422, 423], form: 'sky'})).toBe('west');
    expect(await form({baseID: 201, finalID: 201, chainOrder: [201]})).toBe('a');
    expect(await form({baseID: 412, finalID: 414, chainOrder: [412, 414], form: 'sandy'})).toBe('sandy');
    expect(await form({baseID: 1, finalID: 3, chainOrder: [1, 2, 3], form: 'b'})).toBeNull();
  });

  it("reads the pending egg's form from pendingForm, else pendingUnownForm", async () => {
    const pending = async (more: object) => (await readSaveFile(file({...state, active: null, ...more}))).st.pendingForm;
    expect(await pending({pendingHatchID: 479, pendingForm: 'wash'})).toBe('wash');
    expect(await pending({pendingHatchID: 201, pendingUnownForm: 'k'})).toBe('k');
    expect(await pending({pendingHatchID: 479})).toBe('normal');
    expect(await pending({pendingHatchID: 1, pendingForm: 'wash'})).toBeNull();
    expect(await pending({pendingForm: 'wash'})).toBeNull();
  });

  it("hides a disguised Ditto's shiny until its reveal, like the app", async () => {
    const shiny = async (active: object) => (await readSaveFile(file({...state, active: {...state.active, isShiny: true, ...active}}))).st.active!.isShiny;
    expect(await shiny({dittoDisguise: 7})).toBe(false);
    expect(await shiny({dittoDisguise: 7, dittoRevealed: false})).toBe(false);
    expect(await shiny({baseID: 132, dittoDisguise: 7, dittoRevealed: true})).toBe(true);
    expect(await shiny({dittoDisguise: null})).toBe(true);
    expect(await shiny({})).toBe(true);
  });

  it("doesn't know which build of the app wrote a companion-state.json", async () => {
    expect((await readSaveFile(file(state))).commit).toBeUndefined();
  });

  it("reads an export, dated by its exportedAt", async () => {
    const {at, st} = await readSaveFile(file({format: 'poketokenbar.save', exportedAt: '2026-09-30T08:00:00Z', state}));
    expect(at).toBe(Date.UTC(2026, 8, 30, 8));
    expect(st.dex).toHaveLength(2);
  });

  it("doesn't take an export's appVersion for its build, since PokeTokenLBI always writes 2.5.5", async () => {
    const save = await readSaveFile(file({format: 'poketokenbar.save', appVersion: '2.5.5', exportedAt: '2026-09-30T08:00:00Z', state}));
    expect(save.commit).toBeUndefined();
    expect(save).not.toHaveProperty('appVersion');
  });

  it('rejects anything else', async () => {
    await expect(readSaveFile(file({dex: []}))).rejects.toThrow('not a PokeTokenBar save');
    await expect(readSaveFile({text: async () => '{', lastModified: 0})).rejects.toThrow(SyntaxError);
  });
});

describe('fetchServedSave', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('carries the commit of the app and its date serve.py reports, or none', async () => {
    const commit = async (headers: Record<string, string>) => {
      vi.stubGlobal('fetch', async () => new Response(JSON.stringify(state), {headers}));
      return (await fetchServedSave())!.commit;
    };
    const sha = 'dec94879726d866aed6fe065d6e6fcf2e993d3be';
    expect(await commit({'X-PokeTokenLBI-Commit': sha, 'X-PokeTokenLBI-Commit-Date': '2026-10-15 11:46'})).toEqual({sha, date: '2026-10-15 11:46'});
    expect(await commit({'X-PokeTokenLBI-Commit': sha})).toEqual({sha});
    expect(await commit({'X-PokeTokenLBI-Commit-Date': '2026-10-15 11:46'})).toBeUndefined();
    expect(await commit({'X-PokeTokenBar-Version': '2.6.0'})).toBeUndefined();
  });
});

describe('readStoredSave', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('loads a save kept by a TokenDex that read app versions, with no notice', async () => {
    const {st} = await readSaveFile(file(state));
    vi.stubGlobal('localStorage', {getItem: (k: string) => k === SAVE_KEY ? JSON.stringify({at: 1, st, appVersion: '2.6.0'}) : null});
    const save = readStoredSave()!;
    expect(save.st).toEqual(st);
    expect(commitNotice(save.commit)).toBeNull();
  });
});
