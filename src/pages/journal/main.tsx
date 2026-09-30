import './page.css';
import {useState} from 'preact/hooks';
import {Header, NoSave, Tiles, mount, saveEyebrow, type TileData} from '../../components/Page';
import {RarityTag} from '../../components/Rarity';
import {NAMES} from '../../data/species';
import {tok} from '../../lib/format';
import {useSave, useServed} from '../../lib/hooks';
import {LOCALE, tr} from '../../lib/i18n';
import type {DexEntry} from '../../lib/save';
import {bwSprite, spriteID, withForm} from '../../lib/sprites';
import {hourKey, type Hours} from '../../lib/usage';

const dayKey = (t: number) => hourKey(new Date(t)).slice(0, 10);
const fmtDur = (ms: number) => {
  const m = Math.round(ms / 60e3);
  return m < 1 ? '< 1 min' : m < 60 ? `${m} min`
    : m < 2880 ? tr(`${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`, `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`)
    : `${Math.round(m / 1440)} ${tr('jours', 'days')}`;
};
const fmtDayLong = (t: number) => new Date(t).toLocaleDateString(LOCALE, {weekday: 'long', day: 'numeric', month: 'long'});
const fmtDayShort = (t: number) => new Date(t).toLocaleDateString(LOCALE, {day: 'numeric', month: 'short'});
const noon = (k: string) => Date.parse(k + 'T12:00');

// Tokens burnt between two instants, spreading each hour's total evenly over the hour.
function tokensBetween(hours: Hours, t0: number, t1: number) {
  let sum = 0;
  const h = new Date(t0); h.setMinutes(0, 0, 0);
  for (; h.getTime() < t1; h.setHours(h.getHours() + 1)) {
    const a = Math.max(t0, h.getTime()), b = Math.min(t1, h.getTime() + 3600e3);
    if (b > a) sum += (hours[hourKey(h)] || 0) * (b - a) / 3600e3;
  }
  return sum;
}

interface Capture { d: DexEntry; finalId: number; name: string; at: number; dupe: boolean; dur: number | null; tokens: number | null }
function captures(dex: DexEntry[], hours: Hours | null): Capture[] {
  const list = dex.filter((d): d is DexEntry & {caughtAt: number} => !!d.caughtAt && !d.releasedAt).sort((a, b) => a.caughtAt - b.caughtAt);
  const seen = new Set<number | string>();
  return list.map((d, i) => {
    const prev = i ? list[i - 1].caughtAt : null, finalId = d.chain.filter(id => id <= 649).pop() || d.finalID;
    const c = {d, finalId, name: withForm(NAMES[finalId - 1], finalId, d.unownForm), at: d.caughtAt,
      dupe: d.chain.every(id => seen.has(spriteID(id, d.unownForm))),
      dur: prev ? d.caughtAt - prev : null, tokens: prev && hours ? tokensBetween(hours, prev, d.caughtAt) : null};
    d.chain.forEach(id => seen.add(spriteID(id, d.unownForm)));
    return c;
  });
}

function Daily({byDay, dayTokens, first}: {byDay: Map<string, Capture[]>; dayTokens: Record<string, number>; first: number}) {
  const [tip, setTip] = useState<{k: string; left: number; top: number; on: boolean} | null>(null);
  const days: string[] = [];
  const d = new Date(Math.max(first, Date.now() - 45 * 864e5)); d.setHours(12, 0, 0, 0);
  for (; d.getTime() <= Date.now() + 36e5; d.setDate(d.getDate() + 1)) days.push(hourKey(d).slice(0, 10));
  const W = 900, H = 240, L = 50, R = 8, T = 26, B = 26, n = days.length, bw = (W - L - R) / n;
  const max = Math.max(1, ...days.map(k => dayTokens[k] || 0)) * 1.08;
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const onMove = (e: MouseEvent & {currentTarget: SVGSVGElement}) => {
    const hit = (e.target as Element).closest<SVGElement>('.hit');
    if (!hit) return setTip(t => t && {...t, on: false});
    const box = e.currentTarget.getBoundingClientRect();
    setTip({k: hit.dataset.k!, on: true, left: Math.min(box.width - 260, Math.max(0, e.clientX - box.left + 12)), top: e.clientY - box.top - 50});
  };
  const tipList = tip ? byDay.get(tip.k) || [] : [];
  return (
    <div class="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={tr('Tokens et graduations par jour', 'Tokens and graduations per day')}
        onMouseMove={onMove} onMouseLeave={() => setTip(t => t && {...t, on: false})}>
        {[0, max / 2, max].map(v => <>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line-soft)" />
          <text x={L - 6} y={y(v) + 4} text-anchor="end" font-size="11" fill="var(--ink-3)">{tok(v)}</text>
        </>)}
        {days.map((k, i) => {
          const x = L + i * bw, h = Math.max(0, H - B - y(dayTokens[k] || 0)), count = (byDay.get(k) || []).length, cy = H - B - h - 11;
          return <>
            <rect x={x + 1} y={H - B - h} width={Math.max(1, bw - 2)} height={h} rx={Math.min(3, bw / 3)} fill="var(--s3)" />
            {count > 0 && <circle cx={x + bw / 2} cy={cy} r={Math.min(9, 5 + count)} fill="var(--brand)" stroke="var(--surface)" stroke-width="2" />}
            {count > 1 && <text x={x + bw / 2} y={cy + 3.5} text-anchor="middle" font-size="10" font-weight="700" fill="#fff">{count}</text>}
            {i % Math.ceil(n / 8) === 0 && <text x={x + bw / 2} y={H - 8} text-anchor="middle" font-size="11" fill="var(--ink-3)">{fmtDayShort(noon(k))}</text>}
            <rect class="hit" data-k={k} x={x} y="0" width={bw} height={H - B} fill="transparent" />
          </>;
        })}
      </svg>
      <div class="tip" style={tip ? {opacity: tip.on ? 1 : 0, left: tip.left, top: tip.top} : undefined}>
        {tip && <><b>{fmtDayLong(noon(tip.k))}</b>{tok(dayTokens[tip.k] || 0)}{tipList.length > 0 && <><br />{tipList.map(c => c.name).join(', ')}</>}</>}
      </div>
    </div>
  );
}

function CaptureRow({c}: {c: Capture}) {
  const d = c.d, time = new Date(c.at).toLocaleTimeString(LOCALE, {hour: '2-digit', minute: '2-digit'});
  const meta = [c.dur != null ? `${tr('en', 'in')} ${fmtDur(c.dur)}` : tr('première', 'first'), c.tokens != null ? tok(c.tokens) : null].filter(Boolean).join(' · ');
  return (
    <div class="cap-row">
      <img loading="lazy" alt="" src={bwSprite(spriteID(c.finalId, d.unownForm), {shiny: d.isShiny})} />
      <div style="min-width:0">
        <div class="nm">
          {c.name} <RarityTag rarity={d.rarity} />
          {d.baseID === 132 && <span class="flag ditto">{NAMES[131]}</span>}
          {d.isShiny && <span class="flag shiny">Shiny ✦</span>}
          {c.dupe && <span class="flag">{tr('Doublon', 'Duplicate')}</span>}
        </div>
        <div class="chain">{d.chain.map(id => NAMES[id - 1]).join(' → ')}</div>
      </div>
      <div class="when"><b>{time}</b>{meta}</div>
    </div>
  );
}

function Journal({dex, hours}: {dex: DexEntry[]; hours: Hours | null}) {
  const caps = captures(dex, hours), timed = caps.filter(c => c.dur != null);
  const byDay = new Map<string, Capture[]>();
  for (const c of caps) { const k = dayKey(c.at); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k)!.push(c); }
  const dayTokens: Record<string, number> = {};
  if (hours) for (const [k, n] of Object.entries(hours)) dayTokens[k.slice(0, 10)] = (dayTokens[k.slice(0, 10)] || 0) + n;
  const bestDay = [...byDay.values()].sort((a, b) => b.length - a.length)[0];
  const fastest = timed.slice().sort((a, b) => a.dur! - b.dur!)[0];
  const bigDay = Object.entries(dayTokens).sort((a, b) => b[1] - a[1])[0];
  const withTok = timed.filter(c => c.tokens != null);
  const dupes = caps.filter(c => c.dupe).length;
  const tiles: TileData[] = [
    ['Graduations', String(caps.length), tr(`dont ${dupes} doublons`, `${dupes} of them duplicates`)],
    [tr('Record en un jour', 'Best day'), bestDay ? `${bestDay.length} graduations` : '—', bestDay ? fmtDayShort(bestDay[0].at) : ''],
    [tr('La plus rapide', 'Fastest'), fastest ? fmtDur(fastest.dur!) : '—', fastest ? fastest.name : ''],
  ];
  if (bigDay) tiles.push([tr('Record de tokens', 'Most tokens in a day'), tok(bigDay[1]), fmtDayShort(noon(bigDay[0]))]);
  if (withTok.length) tiles.push([tr('Coût moyen', 'Average cost'), tok(withTok.reduce((x, c) => x + c.tokens!, 0) / withTok.length), tr('en tokens par graduation', 'in tokens per graduation')]);
  return <>
    <section class="panel" aria-label="Records"><Tiles items={tiles} /></section>
    {hours && (
      <section class="panel" aria-label={tr('Tokens et graduations par jour', 'Tokens and graduations per day')}>
        <div class="panel-head">
          <h2>{tr('Jour après jour', 'Day by day')}</h2>
          <p>{tr('Tokens brûlés chaque jour, et le nombre de graduations au-dessus. Survole un jour pour voir qui est arrivé.', 'Tokens burnt each day, with the number of graduations on top. Hover a day to see who arrived.')}</p>
        </div>
        <div class="legend">
          <span><i style="background:var(--s3)"></i>{tr('Tokens du jour', 'Tokens that day')}</span>
          <span><i class="dot" style="background:var(--brand)"></i>Graduations</span>
        </div>
        <Daily byDay={byDay} dayTokens={dayTokens} first={caps.length ? caps[0].at : Date.now()} />
      </section>
    )}
    <section class="panel" aria-label={tr('Captures', 'Graduations')}>
      <div class="panel-head"><h2>{tr('Les graduations', 'Graduations')}</h2><p>{tr(`${caps.length} graduations, de la plus récente à la plus ancienne.`, `${caps.length} graduations, newest first.`)}</p></div>
      <div class="days">
        {[...byDay.entries()].reverse().map(([k, list]) => (
          <div class="day">
            <div class="day-head">
              <h3>{fmtDayLong(list[0].at)}</h3>
              <span>{`${list.length} graduation${list.length > 1 ? 's' : ''}${dayTokens[k] ? ' · ' + tok(dayTokens[k]) + tr(' brûlés', ' burnt') : ''}`}</span>
            </div>
            {list.slice().reverse().map(c => <CaptureRow c={c} />)}
          </div>
        ))}
      </div>
    </section>
  </>;
}

function App() {
  const {save} = useSave();
  const usage = useServed<{hours: Hours}>('usage.json');
  return (
    <div class="wrap">
      <Header eyebrow={saveEyebrow(save)} title={tr('Journal de chasse', 'Hunt journal')} save={save}
        lede={tr("Toutes tes graduations dans l'ordre, avec le temps et les tokens qu'a demandés chacune, et ta consommation de tokens jour par jour.", 'All your graduations in order, with the time and tokens each one took, and your token use day by day.')} />
      {save ? <Journal dex={save.st.dex} hours={usage && usage.hours} /> : <section class="panel"><NoSave /></section>}
      <footer>
        <p>{tr("Chaque ligne est une entrée du Pokédex de ta sauvegarde, datée à la graduation. La durée est l'écart avec la graduation précédente, œuf compris ; les tokens sont ceux brûlés dans cet intervalle, d'après l'historique heure par heure de l'app (serveur local). Une graduation en moins d'une minute, c'est presque toujours des bonbons : ils font grandir sans brûler de tokens.", "Each row is a Pokédex entry from your save, dated at graduation. The duration is the gap since the previous graduation, egg included; the tokens are the ones burnt in that gap, from the app's hour by hour history (local server). A graduation in under a minute is almost always Rare Candies: they grow a Pokémon without burning tokens.")}</p>
      </footer>
    </div>
  );
}

mount(tr('Journal de chasse', 'Hunt journal'), App);
