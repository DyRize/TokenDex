import './page.css';
import {useEffect, useMemo, useRef, useState} from 'preact/hooks';
import {Header, NoSave, mount, saveEyebrow} from '../../components/Page';
import {RLABEL} from '../../components/Rarity';
import {NAMES} from '../../data/species';
import {tok} from '../../lib/format';
import {useSave, useServed} from '../../lib/hooks';
import {LANG, LOCALE, tr} from '../../lib/i18n';
import type {Rarity, State} from '../../lib/save';
import {bwSprite, spriteID, withForm} from '../../lib/sprites';
import {lead, move, replace, toggle} from './team';

const RPLURAL: Record<Rarity, string> = LANG === 'fr' ? {common: 'Communs', uncommon: 'Peu communs', rare: 'Rares', legendary: 'Légendaires'} : RLABEL;
const RANK: Record<Rarity, number> = {common: 0, uncommon: 1, rare: 2, legendary: 3};
const gem = (a: string, b: string, c: string) => `linear-gradient(135deg,${a},${b} 35%,${c} 50%,${b} 65%,${a})`;
const metal = (a: string, b: string, c: string) => `linear-gradient(135deg,${a},${b} 30%,${c} 55%,${b} 80%,${a})`;
type Frame = [key: string, label: string, background: string, accent: string];
// Frame groups: [title, [key, label, background, accent]]. The accent is text on the card, keep it dark.
const FRAME_GROUPS: [string, Frame[]][] = [
  [tr('Versions', 'Games'), [
    ['rouge', tr('Rouge', 'Red'), 'var(--brand)', '#a83a2f'],
    ['bleu', tr('Bleu', 'Blue'), '#3b7fd9', '#2c5fa8'],
    ['vert', tr('Vert', 'Green'), '#3aa55a', '#2a7a43'],
    ['jaune', tr('Jaune', 'Yellow'), '#f2c230', '#8a6600'],
    ['or', tr('Or', 'Gold'), metal('#a8761f', '#f5d77a', '#c99a3a'), '#8a6414'],
    ['argent', tr('Argent', 'Silver'), metal('#7c848d', '#eef1f4', '#a9b0b8'), '#4f5761'],
    ['cristal', tr('Cristal', 'Crystal'), gem('#58b4d4', '#9fe0f2', '#effcff'), '#1f6f8b'],
    ['rubis', tr('Rubis', 'Ruby'), gem('#7a0c1f', '#d42a46', '#ff9aa8'), '#9b1530'],
    ['saphir', tr('Saphir', 'Sapphire'), gem('#0c2366', '#2f5fd0', '#9fbaff'), '#1f3f99'],
    ['emeraude', tr('Émeraude', 'Emerald'), gem('#0a4a32', '#1fae74', '#9ff3cf'), '#0f6b47'],
    ['diamant', tr('Diamant', 'Diamond'), metal('#7da3d8', '#eef5ff', '#9dbde9'), '#2f5c9a'],
    ['perle', tr('Perle', 'Pearl'), metal('#d6aec0', '#fff6f9', '#e6c3d2'), '#9a4a6c'],
    ['platine', tr('Platine', 'Platinum'), metal('#4f545d', '#dfe2e6', '#7d838d'), '#3d434c'],
    ['noir', tr('Noir', 'Black'), '#2a2c31', '#2a2c31'],
    ['blanc', tr('Blanc', 'White'), '#e4e4df', '#3a3d42'],
  ]],
  [tr('Autres', 'Others'), [
    ['rose', tr('Rose', 'Pink'), '#e85d9a', '#b0306b'],
    ['violet', tr('Violet', 'Purple'), '#8b5cd6', '#6a3fb5'],
    ['orange', 'Orange', '#f08a24', '#b35a00'],
    ['turquoise', 'Turquoise', '#1fb5b0', '#0e7a76'],
    ['holo', 'Holo', 'linear-gradient(125deg,#ff9bd2,#ffd76e 22%,#8ff0c4 44%,#7fc8ff 64%,#c9a2ff 84%,#ff9bd2)', '#7a4fc4'],
  ]],
];
const FRAMES = FRAME_GROUPS.flatMap(([, list]) => list);
// Trainers of generations I to V by region and role, as Showdown sprite name = French name.
// The English name is the sprite name, but for these three.
const EN_TRAINER: Record<string, string> = {ltsurge: 'Lt. Surge', tateandliza: 'Tate & Liza', crasherwake: 'Crasher Wake'};
const baseOf = (slug: string) => slug.replace(/-gen\d.*$/, '');
const trainerName = (slug: string, fr: string) => {
  if (LANG === 'fr') return fr;
  const base = baseOf(slug);
  return EN_TRAINER[base] || base[0].toUpperCase() + base.slice(1);
};
const ROLES = {heroes: tr('Héros et rivaux', 'Heroes and rivals'), prof: tr('Professeur', 'Professor'), gyms: tr('Champions d\'arène', 'Gym Leaders'),
  e4: tr('Conseil 4', 'Elite Four'), e4c: tr('Conseil 4 et Maître', 'Elite Four and Champion'), e4cs: tr('Conseil 4 et Maîtres', 'Elite Four and Champions'), bad: tr('Méchants', 'Villains')};
type Trainer = [slug: string, name: string];
const REGIONS: [string, [string, Trainer[]][]][] = ([
  ['Kanto', [
    ['heroes', 'red=Red|leaf-gen3=Leaf|blue=Blue'],
    ['prof', 'oak=Chen'],
    ['gyms', 'brock=Pierre|misty=Ondine|ltsurge=Major Bob|erika=Erika|koga=Koga|janine=Jeannine|sabrina=Morgane|blaine=Auguste'],
    ['e4', 'lorelei-gen3=Olga|bruno=Aldo|agatha-gen3=Agatha|lance=Peter'],
    ['bad', 'giovanni=Giovanni'],
  ]],
  ['Johto', [
    ['heroes', 'ethan=Luth|lyra=Célia|kris=Kris|silver=Silver'],
    ['prof', 'elm=Orme'],
    ['gyms', 'falkner=Albert|bugsy=Hector|whitney=Blanche|morty=Mortimer|chuck=Chuck|jasmine=Jasmine|pryce=Frédo|clair=Sandra'],
    ['e4', 'will=Clément|karen=Marion'],
  ]],
  ['Hoenn', [
    ['heroes', 'brendan=Brice|may=Flora|wally=Timmy'],
    ['prof', 'birch=Seko'],
    ['gyms', 'roxanne=Roxanne|brawly=Bastien|wattson=Voltère|flannery=Adriane|norman=Norman|winona=Alizée|tateandliza-gen3=Lévy et Tatia|juan=Juan'],
    ['e4cs', 'sidney=Damien|phoebe-gen3=Spectra|glacia=Glacia|drake-gen3=Aragon|steven=Pierre Rochard|wallace=Marc'],
    ['bad', 'archie-gen3=Arthur|maxie-gen3=Max'],
  ]],
  ['Sinnoh', [
    ['heroes', 'lucas=Louka|dawn=Aurore|barry=Barry'],
    ['prof', 'rowan=Sorbier'],
    ['gyms', 'roark=Pierrick|gardenia=Flo|maylene=Mélina|crasherwake=Lovis|fantina=Kiméra|byron=Charles|candice=Gladys|volkner=Tanguy'],
    ['e4c', 'aaron=Aaron|bertha=Terry|flint=Adrien|lucian=Lucio|cynthia=Cynthia'],
    ['bad', 'cyrus=Hélio|mars=Mars|jupiter=Jupiter|saturn=Saturne|charon=Charon'],
  ]],
  [tr('Unys', 'Unova'), [
    ['heroes', 'hilbert=Héros Noir et Blanc|hilda=Héroïne Noir et Blanc|cheren=Tcheren|bianca=Bianca|nate=Héros Noir 2 et Blanc 2|rosa=Héroïne Noir 2 et Blanc 2|hugh=Matis'],
    ['prof', 'juniper=Keteleeria'],
    ['gyms', 'cilan=Rachid|chili=Armando|cress=Noa|lenora=Aloé|burgh=Artie|elesa=Inezia|clay=Bardane|skyla=Carolina|brycen=Zhu|drayden=Watson|roxie=Strykna|marlon=Amana'],
    ['e4cs', 'shauntal=Anis|grimsley=Pieris|caitlin=Percila|marshal=Kunz|alder=Goyah|iris=Iris'],
    ['bad', 'n=N|ghetsis=Ghetis|colress=Nikolaï'],
  ]],
] as [string, [keyof typeof ROLES, string][]][]).map(([region, roles]) => [region, roles.map(([role, list]) => [ROLES[role], list.split('|').map(x => { const [slug, fr] = x.split('='); return [slug, trainerName(slug, fr)] as Trainer; })])]);
const KNOWN = REGIONS.flatMap(([, roles]) => roles.flatMap(([, list]) => list));
// Other sprites of the same characters, kept only when they come from a generation I to V game.
const OLD_VARIANT = /^(gen[1-5]\w*|frlg|rs|rse|e|pokeathlon|pokestar\d*|pwt|wonderlauncher)$/;
// Sprites go through serve.py so html-to-image may draw them.
const avatarURL = (slug: string) => `trainer/${slug}.png`;
const fold = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

interface Card { name: string; showTokens: boolean; auto: boolean; picks: string[]; avatar: string; frame: string; no: string }
const CARD_KEY = 'poketokenbar-card-v1';
function loadCard(): Card {
  let c: Partial<Card> = {};
  try { c = JSON.parse(localStorage.getItem(CARD_KEY) || 'null') || {}; } catch {}
  const card = {name: '', showTokens: true, auto: true, picks: [], avatar: 'red', frame: 'rouge', ...c} as Card;
  if (!/^\d{5}$/.test(card.no)) card.no = String(10000 + Math.floor(Math.random() * 90000));
  if (!Array.isArray(card.picks)) card.picks = [];
  return card;
}

interface Cand { id: string; sp: number; name: string; rarity: Rarity; shiny: boolean; at: number; form: string | null }
// Graduated Pokémon still in the collection, the only ones that can join the team.
function candidates(st: State): Cand[] {
  return st.dex.filter(d => d.id && !d.releasedAt).map(d => {
    const sp = d.chain.filter(id => id <= 649).pop() || d.finalID;
    return {id: d.id!, sp, name: withForm(NAMES[sp - 1], sp, d.unownForm), rarity: d.rarity, shiny: d.isShiny, at: d.caughtAt || 0, form: d.unownForm};
  });
}
const autoTeam = (cands: Cand[]) => cands.slice().sort((a, b) => (+b.shiny - +a.shiny) || (RANK[b.rarity] - RANK[a.rarity]) || (b.at - a.at)).slice(0, 6);
// Picks that still exist, once each, six at most: released or unknown ids drop out.
function picked(card: Card, cands: Cand[]) {
  const byId = new Map(cands.map(x => [x.id, x]));
  return [...new Set(card.picks)].map(id => byId.get(id)).filter((x): x is Cand => !!x).slice(0, 6);
}
const SORTS: Record<string, (a: Cand, b: Cand) => number> = {
  recent: (a, b) => b.at - a.at,
  old: (a, b) => a.at - b.at,
  rarity: (a, b) => (RANK[b.rarity] - RANK[a.rarity]) || (+b.shiny - +a.shiny) || (b.at - a.at),
  name: (a, b) => a.name.localeCompare(b.name, LANG) || (b.at - a.at),
  dex: (a, b) => (a.sp - b.sp) || (b.at - a.at),
};
const fmtDate = (at: number) => new Date(at).toLocaleDateString(LOCALE, {day: 'numeric', month: 'short', year: 'numeric'});

/* Sharing: both sides drawn into one PNG by html-to-image, loaded on the first click only. */
async function cardImage(faces: HTMLElement[]) {
  const {toCanvas} = await import('html-to-image');
  const ratio = 2, gap = 24 * ratio, canvases: HTMLCanvasElement[] = [];
  for (const el of faces) canvases.push(await toCanvas(el, {pixelRatio: ratio, style: {transform: 'none'},
    imagePlaceholder: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='}));
  const out = document.createElement('canvas');
  out.width = Math.max(...canvases.map(c => c.width));
  out.height = canvases.reduce((h, c) => h + c.height, 0) + gap;
  canvases.reduce((y, c) => { out.getContext('2d')!.drawImage(c, 0, y); return y + c.height + gap; }, 0);
  return new Promise<Blob>((ok, ko) => out.toBlob(b => b ? ok(b) : ko(new Error('toBlob')), 'image/png'));
}
const NO_IMAGE = tr('Impossible de créer l\'image (connexion internet ?).', 'Could not create the image (internet connection?).');
const canShare = !!(navigator.canShare && navigator.canShare({files: [new File([''], 'carte.png', {type: 'image/png'})]}));

function Front({st, card}: {st: State; card: Card}) {
  const got = new Set<number>();
  for (const d of st.dex) for (const id of d.chain) if (id <= 649) got.add(id);
  const kept = st.dex.filter(d => !d.releasedAt && d.caughtAt).sort((a, b) => a.caughtAt! - b.caughtAt!), seen = new Set<number | string>();
  let dupes = 0;
  for (const d of kept) { if (d.chain.every(id => seen.has(spriteID(id, d.unownForm)))) dupes++; d.chain.forEach(id => seen.add(spriteID(id, d.unownForm))); }
  const first = kept[0] && kept[0].caughtAt;
  const rows: [string, string | number][] = [
    ...(card.showTokens ? [['Tokens', tok(st.usedSinceInstall)] as [string, string]] : []),
    ['Pokédex', `${got.size} / 649`],
    ['Shiny', kept.filter(d => d.isShiny).length],
    ['Graduations', kept.length],
    [tr('Doublons', 'Duplicates'), dupes],
    [tr('Première capture', 'First catch'), first ? fmtDate(first) : '—'],
  ];
  const order: Rarity[] = ['legendary', 'rare', 'uncommon', 'common'], n = (r: Rarity) => kept.filter(d => d.rarity === r).length;
  const present = order.filter(n);
  return <>
    <div class="front">
      <dl class="rows">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      <div class="hero"><div class="medal"><img alt="" src={avatarURL(card.avatar)} /></div><b>{card.name || tr('Dresseur', 'Trainer')}</b></div>
    </div>
    <div class="rbar">{present.map(r => <i key={r} style={`--c:var(--r-${r}); flex:${n(r)}`} title={RPLURAL[r]}></i>)}</div>
    <div class="foot"><span>{present.map(r => `${n(r)} ${(n(r) > 1 ? RPLURAL : RLABEL)[r]}`).join(' · ') || tr('Aucune graduation', 'No graduations')}</span><b>PokeTokenBar</b></div>
  </>;
}

function Avatars({avatar, onPick}: {avatar: string; onPick: (slug: string) => void}) {
  const [query, setQuery] = useState('');
  const all = useServed<{trainers: string[]}>('trainers.json');
  const allTrainers = all && Array.isArray(all.trainers) ? all.trainers : [];
  const button = ([slug, name]: Trainer) => (
    <button type="button" class="av" aria-pressed={slug === avatar} title={name} aria-label={name} onClick={() => onPick(slug)}>
      <img alt="" loading="lazy" src={avatarURL(slug)} />
    </button>
  );
  const q = fold(query.trim());
  const hits = q && KNOWN.filter(([slug, name]) => fold(name).split(/[\s-]+/).some(w => w.startsWith(q)) || baseOf(slug).startsWith(q)).flatMap(([slug, name]) => {
    const base = baseOf(slug);
    const variants = allTrainers.filter(t => t !== slug && t.startsWith(base + '-') && OLD_VARIANT.test(t.slice(base.length + 1)));
    return [[slug, name] as Trainer, ...variants.map(t => [t, `${name} (${t.slice(base.length + 1)})`] as Trainer)];
  });
  return <>
    <input type="search" class="avq" placeholder={tr('Chercher : Cynthia, Pierre, red…', 'Search: Cynthia, Brock, red…')} autocomplete="off"
      aria-label={tr('Chercher un dresseur', 'Search for a trainer')} value={query} onInput={e => setQuery(e.currentTarget.value)} />
    <div class="avwrap">
      {!hits ? REGIONS.map(([region, roles]) => (
        <div key={region} class="avg">
          <h3>{region}</h3>
          <div class="avroles">
            {roles.map(([role, list]) => <div key={role} class="avr"><h4>{role}</h4><div class="avs">{list.map(button)}</div></div>)}
          </div>
        </div>
      )) : hits.length ? <div class="avs">{hits.map(button)}</div> : <p class="avnone">{tr('Aucun dresseur trouvé.', 'No trainer found.')}</p>}
    </div>
  </>;
}

function TeamBar({team, newcomer, onMove, onReplace}: {team: Cand[]; newcomer: Cand | null; onMove: (from: number, to: number) => void; onReplace: (at: number) => void}) {
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const bar = useRef<HTMLDivElement>(null), refocusId = useRef('');
  useEffect(() => {
    const at = team.findIndex(x => x.id === refocusId.current);
    refocusId.current = '';
    if (at >= 0) (bar.current!.children[at] as HTMLElement).focus();
  });
  const endDrag = () => { setDrag(null); setOver(null); };
  return <>
    <p class={newcomer ? 'tbar-say asking' : 'tbar-say'}>
      <span role="status">{newcomer ? tr(`Remplacer qui par ${newcomer.name} ? Choisis une place, ou Échap pour annuler.`, `Replace whom with ${newcomer.name}? Pick a slot, or press Escape to cancel.`) : ''}</span>
      {!newcomer && team.length > 1 && tr('Glisse un Pokémon pour changer l\'ordre, ou prends les flèches gauche et droite.', 'Drag a Pokémon to change the order, or use the left and right arrows.')}
    </p>
    <div class={newcomer ? 'tbar asking' : 'tbar'} ref={bar}>
      {Array.from({length: 6}, (_, i) => {
        const x = team[i], cls = (x ? 'tslot' : 'tslot empty') + (drag === i ? ' dragging' : '') + (over === i ? ' over' : '');
        const drop = {
          onDragOver: (e: DragEvent) => { if (drag === null) return; e.preventDefault(); setOver(i === drag ? null : i); },
          onDragLeave: () => setOver(o => o === i ? null : o),
          onDrop: (e: DragEvent) => { e.preventDefault(); if (drag !== null && drag !== Math.min(i, team.length - 1)) onMove(drag, i); endDrag(); },
        };
        if (!x) return <div key={i} class={cls} {...drop}>{tr('Libre', 'Empty')}</div>;
        return (
          <div key={i} class={cls} role="button" tabindex={0} draggable aria-label={`${x.name}, ${tr('place', 'slot')} ${i + 1}${i === 0 ? tr(', chef', ', lead') : ''}`}
            onDragStart={e => { e.dataTransfer!.setData('text/plain', x.id); e.dataTransfer!.effectAllowed = 'move'; setDrag(i); }} onDragEnd={endDrag} {...drop}
            onClick={() => { if (newcomer) onReplace(i); }}
            onKeyDown={e => {
              if (newcomer && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); return onReplace(i); }
              const to = e.key === 'ArrowLeft' ? i - 1 : e.key === 'ArrowRight' ? i + 1 : -1;
              if (to < 0 || to >= team.length) return;
              e.preventDefault(); refocusId.current = x.id; onMove(i, to);
            }}>
            {i === 0 && <span class="lead">{tr('Chef', 'Lead')}</span>}
            <img alt="" src={bwSprite(spriteID(x.sp, x.form), {shiny: x.shiny})} /><span>{x.name}{x.shiny && <> <i class="sh">✦</i></>}</span>
          </div>
        );
      })}
    </div>
  </>;
}

function Picks({cands, team, newcomer, onToggle, onLead, onMove, onReplace}: {cands: Cand[]; team: Cand[]; newcomer: Cand | null;
  onToggle: (id: string) => void; onLead: (id: string) => void; onMove: (from: number, to: number) => void; onReplace: (at: number) => void}) {
  const [q, setQ] = useState('');
  const [rar, setRar] = useState(() => new Set(Object.keys(RANK) as Rarity[]));
  const [shiny, setShiny] = useState(false);
  const [mine, setMine] = useState(false);
  const [sort, setSort] = useState('recent');
  const pos = new Map(team.map((x, i) => [x.id, i + 1]));
  const query = fold(q.trim());
  const list = cands.filter(x => rar.has(x.rarity) && (!shiny || x.shiny) && (!mine || pos.has(x.id)) && (!query || fold(x.name).includes(query))).sort(SORTS[sort]);
  const toggleRar = (r: Rarity) => setRar(prev => { const next = new Set(prev); next.has(r) ? next.delete(r) : next.add(r); return next; });
  return <>
    <div class="panel-head"><h2>{tr('Ton équipe', 'Your team')}</h2><p>{tr('Clique sur un Pokémon pour l\'ajouter ou le retirer ; équipe pleine, choisis qui il remplace. ★ en fait le chef de ton équipe.', 'Click a Pokémon to add or remove it; with a full team, pick whom it replaces. ★ makes it your team\'s lead.')}</p></div>
    <TeamBar team={team} newcomer={newcomer} onMove={onMove} onReplace={onReplace} />
    <div class="filters picktools">
      <input type="search" placeholder={tr('Chercher un Pokémon', 'Search for a Pokémon')} aria-label={tr('Chercher un Pokémon', 'Search for a Pokémon')} autocomplete="off"
        value={q} onInput={e => setQ(e.currentTarget.value)} />
      <span>
        {(Object.keys(RANK) as Rarity[]).reverse().map((r, i) => <>
          {i > 0 && ' '}
          <button type="button" class={rar.has(r) ? 'chip on' : 'chip'} style={`--c:var(--r-${r})`} aria-pressed={rar.has(r)} onClick={() => toggleRar(r)}>{RLABEL[r]}</button>
        </>)}
      </span>
      <label class="check"><input type="checkbox" checked={shiny} onChange={e => setShiny(e.currentTarget.checked)} /> Shiny</label>
      <label class="check"><input type="checkbox" checked={mine} onChange={e => setMine(e.currentTarget.checked)} /> <span>{tr('Mon équipe', 'My team')}</span></label>
      <select aria-label={tr('Trier', 'Sort')} value={sort} onChange={e => setSort(e.currentTarget.value)}>
        <option value="recent">{tr('Plus récents', 'Newest')}</option>
        <option value="old">{tr('Plus anciens', 'Oldest')}</option>
        <option value="rarity">{tr('Plus rares', 'Rarest')}</option>
        <option value="name">{tr('Nom', 'Name')}</option>
        <option value="dex">{tr('N° Pokédex', 'Pokédex No.')}</option>
      </select>
      <span class="pickcount">{`${list.length} ${tr('sur', 'of')} ${cands.length}`}</span>
    </div>
    <div class="picks">
      {list.map(x => {
        const at = pos.get(x.id);
        return (
          <div key={x.id} class={at ? 'pick on' : x === newcomer ? 'pick asking' : 'pick'}>
            <button type="button" class="pick-main" aria-pressed={!!at} title={`${x.name}${x.at ? tr(', capturé le ', ', caught on ') + fmtDate(x.at) : ''}`} onClick={() => onToggle(x.id)}>
              <img alt="" src={bwSprite(spriteID(x.sp, x.form), {shiny: x.shiny})} /><span>{x.name}{x.shiny && <> <i class="sh">✦</i></>}</span><em>{at || ''}</em>
            </button>
            {at && (
              <button type="button" class="pick-lead" aria-pressed={at === 1} aria-label={`${x.name} ${tr('en chef', 'as lead')}`}
                title={at === 1 ? tr('Chef de l\'équipe', 'Team lead') : tr('Mettre en chef', 'Make lead')} onClick={() => { if (at !== 1) onLead(x.id); }}>★</button>
            )}
          </div>
        );
      })}
    </div>
    {!list.length && <p class="avnone">{tr('Aucun Pokémon ne correspond.', 'No Pokémon matches.')}</p>}
  </>;
}

function TrainerCard({st}: {st: State}) {
  const [card, setCard] = useState(loadCard);
  const [flipped, setFlipped] = useState(false);
  const [newcomerId, setNewcomerId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const msgTimer = useRef(0);
  const front = useRef<HTMLElement>(null), back = useRef<HTMLElement>(null);
  useEffect(() => { try { localStorage.setItem(CARD_KEY, JSON.stringify(card)); } catch {} }, [card]);
  const cands = useMemo(() => candidates(st), [st]);
  const team = card.auto ? autoTeam(cands) : picked(card, cands);
  const update = (patch: Partial<Card>) => setCard(c => ({...c, ...patch}));
  const frame = FRAMES.find(x => x[0] === card.frame) || FRAMES[0];
  const no = `${tr('N° ID', 'ID No.')} ${card.no}`;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setNewcomerId(null); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
  // The first edit starts from what the card shows, never from an empty team.
  const ids = team.map(x => x.id);
  const newcomer = newcomerId && toggle(ids, newcomerId) === null ? cands.find(x => x.id === newcomerId) || null : null;
  const edit = (picks: string[]) => { update({auto: false, picks}); setFlipped(true); };
  const pick = (id: string) => {
    const next = toggle(ids, id);
    if (!next) return setNewcomerId(newcomerId === id ? null : id);
    setNewcomerId(null);
    edit(next);
  };
  const replaceAt = (at: number) => { edit(replace(ids, at, newcomer!.id)); setNewcomerId(null); };
  const say = (text: string) => { setMsg(text); clearTimeout(msgTimer.current); if (text) msgTimer.current = setTimeout(() => setMsg(''), 5000); };
  const image = () => cardImage([front.current!, back.current!]);
  const fileName = `${tr('carte-dresseur', 'trainer-card')}-${card.no}.png`;
  const download = (blob: Blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = fileName; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10e3);
  };
  const run = async (task: () => Promise<void>) => {
    setBusy(true); say(tr('Préparation de l\'image…', 'Preparing the image…'));
    try { await task(); } finally { setBusy(false); }
  };
  // The image itself on the clipboard. The share sheet's own Copy puts a file reference plus its path instead,
  // which some apps paste as two attachments.
  const copy = () => run(async () => {
    try {
      await navigator.clipboard.write([new ClipboardItem({'image/png': image()})]);
      say(tr('Image copiée : colle-la où tu veux.', 'Image copied: paste it anywhere.'));
    } catch {
      try { download(await image()); say(tr('Copie refusée par le navigateur : image téléchargée.', 'Copy blocked by the browser: image downloaded.')); } catch { say(NO_IMAGE); }
    }
  });
  const share = () => run(async () => {
    let blob: Blob;
    try { blob = await image(); } catch { return say(NO_IMAGE); }
    try {
      await navigator.share({files: [new File([blob], fileName, {type: 'image/png'})]});
      say('');
    } catch (e) {
      say((e as Error).name === 'AbortError' ? '' : tr('Partage impossible : utilise « Copier l\'image ».', 'Sharing failed: use “Copy image”.'));
    }
  });
  return <>
    <div class="cards">
      <div class={flipped ? 'flip flipped' : 'flip'} role="button" tabindex={0} style={`--frame:${frame[2]};--accent:${frame[3]}`}
        aria-label={tr('Carte de dresseur : clique pour la retourner', 'Trainer card: click to flip it')} title={tr('Clique pour retourner la carte', 'Click to flip the card')}
        onClick={() => setFlipped(!flipped)} onKeyDown={e => { if (e.key !== 'Enter' && e.key !== ' ') return; e.preventDefault(); setFlipped(!flipped); }}>
        <div class="flip-in">
          <article class="tcard face" ref={front} inert={flipped} aria-label={tr('Carte de dresseur, recto', 'Trainer card, front')}>
            <div class="in">
              <div class="top"><h2>{tr('Carte de dresseur', 'Trainer Card')}</h2><span class="no">{no}</span></div>
              <Front st={st} card={card} />
            </div>
          </article>
          <article class="tcard face back-face" ref={back} inert={!flipped} aria-label={tr('Carte de dresseur, équipe', 'Trainer card, team')}>
            <div class="in">
              <div class="top"><h2>{tr('Équipe', 'Team')} <span class="badge">{card.auto ? 'Auto' : tr('Perso', 'Custom')}</span></h2><span class="no">{no}</span></div>
              <div class="team">
                {Array.from({length: 6}, (_, i) => {
                  const x = team[i];
                  if (!x) return <div key={i} class="slot empty">{tr('Libre', 'Empty')}</div>;
                  return (
                    <div key={i} class="slot" style={`--c:var(--r-${x.rarity})`}>
                      {i === 0 && <span class="lead">{tr('Chef', 'Lead')}</span>}{x.shiny && <span class="spark" aria-hidden="true">✦</span>}
                      <img alt="" src={bwSprite(spriteID(x.sp, x.form), {shiny: x.shiny, animated: true})} /><b>{x.name}</b><small>{RLABEL[x.rarity]}</small>
                    </div>
                  );
                })}
              </div>
            </div>
          </article>
        </div>
      </div>
      <div class="share">
        <div class="share-row">
          <button type="button" class="btn" disabled={busy} onClick={copy}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>
            <span>{tr('Copier l\'image', 'Copy image')}</span>
          </button>
          {canShare && (
            <button type="button" class="btn" disabled={busy} onClick={share}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /></svg>
              <span>{tr('Partager', 'Share')}</span>
            </button>
          )}
        </div>
        <span class="share-msg" role="status">{msg}</span>
      </div>
    </div>
    <details class="panel cardset">
      <summary><h2>{tr('Personnaliser la carte', 'Customize the card')}</h2><span>{tr('Nom, avatar, contour, équipe', 'Name, avatar, frame, team')}</span></summary>
      <div class="cardctl">
        <label><span>{tr('Nom', 'Name')}</span> <input type="text" maxlength={16} placeholder={tr('Ton nom', 'Your name')} autocomplete="off" defaultValue={card.name}
          onInput={e => update({name: e.currentTarget.value.trim().slice(0, 16)})} /></label>
        <label><input type="checkbox" checked={card.showTokens} onChange={e => update({showTokens: e.currentTarget.checked})} /> <span>{tr('Afficher les tokens', 'Show tokens')}</span></label>
        <label><input type="checkbox" checked={card.auto} onChange={e => {
          const auto = e.currentTarget.checked;
          update(!auto && !picked(card, cands).length ? {auto, picks: autoTeam(cands).map(x => x.id)} : {auto});
        }} /> <span>{tr('Équipe automatique', 'Automatic team')}</span></label>
      </div>
      <div class="panel-head"><h2>{tr('Contour', 'Frame')}</h2><p>{frame[1]}</p></div>
      <div class="frames">
        {FRAME_GROUPS.map(([title, list]) => (
          <div key={title} class="frg">
            <h4>{title}</h4>
            <div class="frs">
              {list.map(([k, label, bg]) => <button key={k} type="button" class="fr" aria-label={tr(`Contour ${label}`, `${label} frame`)} title={label} style={`--sw:${bg}`}
                aria-pressed={k === frame[0]} onClick={() => update({frame: k})}></button>)}
            </div>
          </div>
        ))}
      </div>
      <div class="panel-head"><h2>Avatar</h2><p>{tr('Les dresseurs des générations I à V, comme les Pokémon de l\'app. Sprites : Pokémon Showdown.', 'Trainers from generations I to V, like the app\'s Pokémon. Sprites: Pokémon Showdown.')}</p></div>
      <Avatars avatar={card.avatar} onPick={slug => { update({avatar: slug}); setFlipped(false); }} />
      <Picks cands={cands} team={team} newcomer={newcomer} onToggle={pick} onLead={id => edit(lead(ids, id))} onMove={(from, to) => edit(move(ids, from, to))} onReplace={replaceAt} />
    </details>
  </>;
}

function App() {
  const {save} = useSave();
  return (
    <div class="wrap">
      <Header eyebrow={saveEyebrow(save)} title={tr('Carte de dresseur', 'Trainer Card')} save={save}
        lede={tr('Ta carte de dresseur, tirée de ta sauvegarde, avec une équipe de six au dos : clique sur la carte pour la retourner. L\'équipe se remplit toute seule, ou tu la choisis plus bas.', 'Your trainer card, drawn from your save, with a team of six on the back: click the card to flip it. The team fills itself, or you pick it below.')} />
      {save ? <TrainerCard st={save.st} /> : <section class="panel"><NoSave /></section>}
      <footer>
        <p>{tr('Pokédex : espèces obtenues jusqu\'au #649, relâchés compris, comme sur l\'accueil. Shiny, graduations et doublons ne comptent que les Pokémon encore là ; un doublon est une graduation dont toutes les espèces de la ligne étaient déjà dans le Pokédex. L\'équipe automatique prend les shiny d\'abord, puis les plus rares, puis les plus récents. Dès que tu touches à l\'équipe, elle passe en perso ; ton choix est gardé de côté quand tu repasses en automatique. Nom, numéro et équipe restent dans ce navigateur.',
          'Pokédex: species caught up to #649, released ones included, like on the home page. Shiny, graduations and duplicates only count the Pokémon still there; a duplicate is a graduation whose whole line was already in the Pokédex. The automatic team takes shinies first, then the rarest, then the most recent. As soon as you touch the team it becomes custom; your pick is kept aside when you switch back to automatic. Name, number and team stay in this browser.')}</p>
      </footer>
    </div>
  );
}

mount(tr('Carte de dresseur', 'Trainer Card'), App);
