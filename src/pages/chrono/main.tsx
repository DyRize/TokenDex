import './chrono.css';
import '../../styles/theme.css';
import {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'preact/hooks';
import {Header, Tiles, mount, saveEyebrow} from '../../components/Page';
import {toGraduation} from '../../lib/balance';
import {tok} from '../../lib/format';
import {useSave} from '../../lib/hooks';
import {LANG, LOCALE, tr} from '../../lib/i18n';
import {appSettings, fetchServedJSON, type Save, type Settings} from '../../lib/save';
import {hourProfile, type Hours} from '../../lib/usage';
import {COST_N, COST_S48, COST_S64, DUPPCT, HATCH_N, HATCH_S48, HATCH_S64} from './model';
import type {SimInit, StratResult} from './sim';

const RATES = [50, 100, 200, 350, 500];
const NS = [100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 625, 649];
const RROWS = [50, 100, 150, 200, 250, 300, 350, 400, 450, 500];
const STEPS = [10, 25, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 625, 649];
const NMIN = 100, NMAX = 649;
type Mode = 'n' | 's64' | 's48';
const MODES: Record<Mode, {cost: readonly number[]; hatch: readonly number[]; denom: number; label: string; goal: string}> = {
  n: {cost: COST_N, hatch: HATCH_N, denom: 0, label: tr('espèces', 'species'), goal: tr('649 espèces', '649 species')},
  s64: {cost: COST_S64, hatch: HATCH_S64, denom: 64, label: tr('espèces shiny', 'shiny species'), goal: tr('649 espèces shiny', '649 shiny species')},
  s48: {cost: COST_S48, hatch: HATCH_S48, denom: 48, label: tr('espèces shiny', 'shiny species'), goal: tr('649 espèces shiny', '649 shiny species')},
};
const STRATS = [
  {name: tr('Sans boutique', 'No shop'), sub: tr('bonbons gratuits seulement', 'free Rare Candies only')},
  {name: tr('Bonbons', 'Rare Candies'), sub: tr('tout le solde en bonbons', 'whole balance in Rare Candies')},
  {name: tr('Rare+ sur doublon', 'Rare+ on duplicates'), sub: tr('bonbons + œuf Rare+', 'Rare Candies + Rare+ Egg')},
  {name: tr('Rare+ en fin de partie', 'Rare+ in the endgame'), sub: tr('bonbons, puis œuf Rare+', 'Rare Candies, then Rare+ Egg')},
];
const FONT = '-apple-system, system-ui, sans-serif';
const nf = new Intl.NumberFormat(LOCALE);
const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
// The translated sentences carry their emphasis as <b> tags.
const bold = (s: string) => s.split(/<b>(.*?)<\/b>/).map((x, i) => i % 2 ? <b>{x}</b> : x);

function whenTxt(y: number) {
  if (y * 365 < 1) return tr('aujourd\'hui', 'today');
  const d = new Date(Date.now() + y * 365.25 * 864e5), yr = d.getFullYear();
  if (y < 0.8) return tr('vers le ', 'around ') + d.toLocaleDateString(LOCALE, {day: 'numeric', month: 'short'});
  if (y < 30) return tr('vers ', 'around ') + d.toLocaleDateString(LOCALE, {month: 'short', year: 'numeric'});
  return tr('vers ', 'around ') + (yr < 10000 ? yr : nf.format(yr));
}
// v and u for the big readout, s is the short unit of the tables.
function dur(y: number) {
  const d = y * 365, yrs = {u: tr('ans', 'years'), s: tr('ans', 'yrs')};
  if (d < 1) return {v: Math.max(y > 0 ? 1 : 0, Math.round(d * 24)), u: tr('heures', 'hours'), s: 'h'};
  if (d < 365) return {v: Math.round(d), u: d < 2 ? tr('jour', 'day') : tr('jours', 'days'), s: tr('j', 'd')};
  if (y < 9.95) return {v: y.toLocaleString(LOCALE, {minimumFractionDigits: 1, maximumFractionDigits: 1}), ...yrs};
  return {v: nf.format(Math.round(y)), ...yrs};
}
const durTxt = (y: number) => { const o = dur(y); return o.v + ' ' + o.s; };
const fix1 = (x: number, d: number) => x.toLocaleString(LOCALE, {minimumFractionDigits: d, maximumFractionDigits: d});
function tokTxt(b: number) {
  if (b >= 1e6) return fix1(b / 1e6, 1) + ' Q';
  if (b >= 1000) return fix1(b / 1000, b >= 10000 ? 0 : 1) + ' T';
  return Math.round(b) + tr(' Md', ' B');
}

function mineFrom(v: Save) {
  const st = v.st, dex = new Set<number>(), shiny = new Set<number>();
  for (const d of st.dex) for (const id of d.chain) if (id <= 649) { dex.add(id); if (d.isShiny) shiny.add(id); }
  const caught = st.dex.map(d => d.caughtAt).filter((t): t is number => !!t);
  return {at: v.at, dex: dex.size, shiny: shiny.size, dexIds: [...dex], hatches: st.dex.length,
    finals: st.collectedFinals.map(k => k.split(':').map(Number)),
    since: caught.length ? Math.min(...caught) : null, used: st.usedSinceInstall,
    wallet: Math.max(0, st.usedSinceInstall - st.spentTokens), candies: st.inventory.rareCandy || 0,
    charm: (st.inventory.shinyCharm || 0) > 0, active: st.active};
}
type Mine = ReturnType<typeof mineFrom>;
const simInit = (m: Mine | null, G: number): SimInit | null => m && {dex: m.dexIds, finals: m.finals, wallet: m.wallet, candies: m.candies,
  active: m.active && {left: toGraduation(m.active, G), path: m.active.planned.length ? m.active.planned : [m.active.baseID], base: m.active.baseID}};
const clampR = (v: number) => Math.min(1000, Math.max(25, Math.round(v)));

// Each viewer gets back their own slider positions; defaults are the app's.
interface Prefs { G: number; R: number; NSEL: number; S: number; F: number }
const PREFS_KEY = 'poketokenbar-chrono-v1';
const RANGES: Record<keyof Prefs, [number, number]> = {G: [10, 200], R: [25, 1000], NSEL: [NMIN, NMAX], S: [10, 200], F: [0, 20]};
function loadPrefs() {
  const p: Prefs = {G: 100, R: 253, NSEL: 649, S: 100, F: 0};
  try {
    const v = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    for (const k of Object.keys(p) as (keyof Prefs)[]) { const x = +v[k]; if (Number.isFinite(x) && x >= RANGES[k][0] && x <= RANGES[k][1]) p[k] = x; }
  } catch {}
  return p;
}

type ByRate = Record<number, Float64Array[]>;
type Years = (n: number, rateM: number, g: number) => number;
/* Years to reach n species. Normal dex: the simulated strategy (per rate when free candies make it depend on the rate),
   else the no-shop median, in billions of tokens at growth 100 %, counted from what the save already holds. */
function yearsFn(mode: Mode, base: number, res: StratResult[] | null, cur: number, F: number, R: number, byRate: ByRate | null): Years {
  const cost = MODES[mode].cost, have = base > 0 ? cost[Math.min(base, NMAX) - 1] : 0;
  if (!res) return (n, rateM, g) => Math.max(0, cost[n - 1] - have) * 1e9 * g / (rateM * 1e6 * 365);
  return (n, rateM) => { const t = F && rateM !== R && byRate && byRate[rateM]; return (t ? t[cur] : res[cur].tokens)[n] / (rateM * 1e6 * 365); };
}
const stratYears = (res: StratResult[], i: number, nSel: number, R: number) => res[i].tokens[nSel] / (R * 1e6 * 365);
const bestStrat = (res: StratResult[], nSel: number, R: number) => [0, 1, 2, 3].reduce((a, i) => stratYears(res, i, nSel, R) < stratYears(res, a, nSel, R) ? i : a, 0);

/* ---------- chart 1: the beam ---------- */
const L = {l: 56, r: 82, t: 16, b: 44}, W = 900, H = 420;
const PW = W - L.l - L.r, PH = H - L.t - L.b;
const xOf = (n: number) => L.l + (n - NMIN) / (NMAX - NMIN) * PW;
const nOfX = (x: number) => Math.round(NMIN + (x - L.l) / PW * (NMAX - NMIN));
function tickLabel(v: number) {
  if (v < 1) { const d = v * 365; return d < 1 ? Math.round(d * 24) + ' h' : Math.round(d) + tr(' j', ' d'); }
  return nf.format(v) + (v === 1 ? tr(' an', ' year') : tr(' ans', ' years'));
}

function Beam({years, g, rate, nSel, startN, base, label}: {years: Years; g: number; rate: number; nSel: number; startN: number; base: number; label: string}) {
  const svgRef = useRef<SVGSVGElement>(null), tipRef = useRef<HTMLDivElement>(null);
  const [hov, setHov] = useState<{n: number; on: boolean} | null>(null);
  useLayoutEffect(() => {
    if (!hov) return;
    const tip = tipRef.current!, box = svgRef.current!.getBoundingClientRect();
    tip.style.opacity = hov.on ? '1' : '0';
    if (!hov.on) return;
    const x = xOf(hov.n) / W * box.width;
    if (hov.n < startN) { tip.style.left = Math.max(0, x + 14) + 'px'; tip.style.top = '10px'; return; }
    let lx = x + 14; if (lx + tip.offsetWidth > box.width) lx = x - tip.offsetWidth - 14;
    tip.style.left = Math.max(0, lx) + 'px';
    tip.style.top = Math.min(box.height - tip.offsetHeight, 10) + 'px';
  });
  const onMove = (ev: PointerEvent) => {
    const box = svgRef.current!.getBoundingClientRect(), px = (ev.clientX - box.left) / box.width * W;
    if (px < L.l - 6 || px > L.l + PW + 6) return setHov(h => h && {...h, on: false});
    setHov({n: Math.min(NMAX, Math.max(NMIN, nOfX(px))), on: true});
  };
  const title = <title id="linesTitle">{tr('Durée pour atteindre N espèces, une courbe par débit quotidien', 'Time to reach N species, one curve per daily rate')}</title>;
  let plot = null, legend = null;
  if (startN <= NMAX) {
    // First objective more than an hour away: bonbons in stock and the shop balance make the next few species nearly free.
    const firstPaid = (r: number) => { let n = startN; while (n < NMAX && years(n, r, g) < 1 / 8760) n++; return n; };
    let lo = Infinity, hi = -Infinity;
    for (const r of RATES.concat([rate])) { lo = Math.min(lo, years(firstPaid(r), r, g)); hi = Math.max(hi, years(NMAX, r, g)); }
    lo = Math.max(lo, 1 / 8760);
    const dom = [Math.pow(10, Math.floor(Math.log10(lo))), Math.pow(10, Math.ceil(Math.log10(hi)))];
    const yOf = (y: number) => { const a = Math.log10(dom[0]), b = Math.log10(dom[1]); return L.t + PH - (Math.log10(Math.max(y, dom[0])) - a) / (b - a) * PH; };
    const path = (r: number) => {
      const a = firstPaid(r);
      let d = '';
      for (let n = a; n <= NMAX; n++) d += (n === a ? 'M' : 'L') + xOf(n).toFixed(1) + ' ' + yOf(years(n, r, g)).toFixed(1);
      return d;
    };
    const yTicks = [];
    for (let e = Math.log10(dom[0]); e <= Math.log10(dom[1]) + 1e-9; e++) yTicks.push(Math.pow(10, e));
    const wx = xOf(600), hx = xOf(Math.min(base, NMAX));
    // Direct labels at the end of each curve, pushed apart.
    const ends = RATES.map((r, i) => ({y: yOf(years(NMAX, r, g)), c: `var(--s${i + 1})`, t: r + tr(' M/j', ' M/d'), bold: false}));
    ends.push({y: yOf(years(NMAX, rate, g)), c: 'var(--ink)', t: tr('toi', 'you'), bold: true});
    ends.sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
    const mx = xOf(nSel).toFixed(1);
    plot = <>
      {yTicks.map(v => <>
        <line x1={L.l} y1={yOf(v).toFixed(1)} x2={L.l + PW} y2={yOf(v).toFixed(1)} stroke="var(--line-soft)" stroke-width="1" />
        <text x={L.l - 10} y={(yOf(v) + 4).toFixed(1)} text-anchor="end" fill="var(--ink-3)" font-size="11.5" font-family={FONT}>{tickLabel(v)}</text>
      </>)}
      {[100, 200, 300, 400, 500, 600, 649].map(n => <>
        <line x1={xOf(n).toFixed(1)} y1={L.t + PH} x2={xOf(n).toFixed(1)} y2={L.t + PH + 5} stroke="var(--ink-3)" stroke-width="1" />
        <text x={xOf(n).toFixed(1)} y={L.t + PH + 21} text-anchor="middle" fill="var(--ink-3)" font-size="11.5" font-family={FONT}>{n}</text>
      </>)}
      <text x={L.l + PW / 2} y={H - 4} text-anchor="middle" fill="var(--ink-3)" font-size="11" font-family={FONT} letter-spacing="1.2">{tr('ESPÈCES AU POKÉDEX', 'SPECIES IN THE POKÉDEX')}</text>
      <rect x={wx.toFixed(1)} y={L.t} width={(L.l + PW - wx).toFixed(1)} height={PH} fill="var(--hot)" opacity="0.07" />
      <text x={(wx + 8).toFixed(1)} y={L.t + 15} fill="var(--hot)" font-size="11" font-family={FONT} letter-spacing=".8">{tr('LE MUR', 'THE WALL')}</text>
      {base >= NMIN && <>
        <rect x={L.l} y={L.t} width={(hx - L.l).toFixed(1)} height={PH} fill="var(--ink)" opacity="0.06" />
        {hx - L.l > 70 && <text x={L.l + 8} y={L.t + 15} fill="var(--ink-3)" font-size="11" font-family={FONT} letter-spacing=".8">{tr('DÉJÀ À TOI', 'ALREADY YOURS')}</text>}
      </>}
      {RATES.map((r, i) => <path d={path(r)} fill="none" stroke={`var(--s${i + 1})`} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />)}
      <path d={path(rate)} fill="none" stroke="var(--ink)" stroke-width="2.5" stroke-dasharray="1 5" stroke-linecap="round" />
      {ends.map(e => <text x={L.l + PW + 8} y={(e.y + 4).toFixed(1)} fill={e.c} font-size="11.5" font-weight={e.bold ? 700 : 400} font-family={FONT}>{e.t}</text>)}
      {nSel >= startN && <>
        <line x1={mx} y1={L.t} x2={mx} y2={L.t + PH} stroke="var(--ink-2)" stroke-width="1" stroke-dasharray="3 4" />
        <circle cx={mx} cy={yOf(years(nSel, rate, g)).toFixed(1)} r="6" fill="var(--ink)" stroke="var(--surface)" stroke-width="2" />
      </>}
    </>;
    legend = <>
      {RATES.map((r, i) => <span class="lg"><i style={`background:var(--s${i + 1})`}></i>{`${r} ${tr('M/jour', 'M/day')}`}</span>)}
      <span class="lg on"><i style="background:var(--ink)"></i>{`${tr('ton débit', 'your rate')} · ${rate} ${tr('M/jour', 'M/day')}`}</span>
    </>;
  }
  const n = hov && hov.n;
  return <>
    <div class="chart-box">
      <svg ref={svgRef} viewBox="0 0 900 420" role="img" aria-labelledby="linesTitle"
        onPointerMove={onMove} onPointerLeave={() => setHov(h => h && {...h, on: false})}>{title}{plot}</svg>
      <div class="tip" ref={tipRef}>
        {n != null && <div class="th">{`${n} ${label}`}</div>}
        {n != null && (n < startN ? tr('Déjà à toi.', 'Already yours.') : <table><tbody>
          {RATES.map((r, i) => <tr><td><span class="sw" style={`background:var(--s${i + 1})`}></span>{r + tr(' M/j', ' M/d')}</td><td>{durTxt(years(n, r, g))}</td></tr>)}
          <tr><td><span class="sw" style="background:var(--ink)"></span>{tr('toi', 'you')}</td><td>{durTxt(years(n, rate, g))}</td></tr>
        </tbody></table>)}
      </div>
    </div>
    <div class="legend">{legend}</div>
  </>;
}

/* ---------- heatmap ---------- */
function lum(hex: string) {
  const c = hex.replace('#', '');
  const v = [0, 2, 4].map(i => { const x = parseInt(c.slice(i, i + 2), 16) / 255; return x <= .03928 ? x / 12.92 : Math.pow((x + .055) / 1.055, 2.4); });
  return .2126 * v[0] + .7152 * v[1] + .0722 * v[2];
}
function Heat({years, g, base, label}: {years: Years; g: number; base: number; label: string}) {
  // The cell inks follow the ramp's luminance, which changes with the colour scheme.
  const [, setScheme] = useState(0);
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)'), on = () => setScheme(x => x + 1);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const ramp = [1, 2, 3, 4, 5, 6, 7].map(i => css('--h' + i));
  const inks = ramp.map(c => lum(c) > 0.32 ? '#0e1117' : '#ffffff');
  const vals: number[] = [];
  for (const r of RROWS) for (const n of NS) if (n > base) vals.push(years(n, r, g));
  const lo = Math.log10(Math.min(...vals)), hi = Math.log10(Math.max(...vals));
  const bucket = (y: number) => Math.min(6, Math.max(0, Math.floor((Math.log10(y) - lo) / (hi - lo + 1e-9) * 7)));
  return (
    <table class="grid">
      <caption>{tr('Lecture : ligne = tokens par jour, colonne = nombre d\'espèces visé.', 'How to read it: row = tokens per day, column = number of species aimed for.')}</caption>
      <thead><tr><th></th>{NS.map(n => <th scope="col">{n}</th>)}</tr></thead>
      <tbody>
        {RROWS.map(r => (
          <tr>
            <th scope="row" class="row">{r + tr(' M/j', ' M/d')}</th>
            {NS.map(n => {
              if (n <= base) return <td class="done" title={`${n} ${label}${tr(' : déjà à toi', ': already yours')}`}>✓</td>;
              const y = years(n, r, g), b = bucket(y);
              return <td style={`background:${ramp[b]};color:${inks[b]}`} title={tr(`${n} espèces à ${r} M/jour`, `${n} species at ${r} M/day`)}>{durTxt(y)}</td>;
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ---------- small charts ---------- */
interface SmallOpts {
  label: string; valueAt: (n: number) => number; left: number; log: boolean; dom: [number, number]; ticks: number[];
  fmt: (v: number) => string; color: string; mark: {n: number; v: number; label: string} | null;
}
function SmallChart({label, valueAt, left, log, dom, ticks, fmt, color, mark}: SmallOpts) {
  const m = {l: left, r: 14, t: 12, b: 34}, w = 420, hh = 260;
  const pw = w - m.l - m.r, ph = hh - m.t - m.b;
  const X = (n: number) => m.l + (n - NMIN) / (NMAX - NMIN) * pw;
  const Y = log
    ? (v: number) => m.t + ph - (Math.log10(Math.max(v, dom[0])) - Math.log10(dom[0])) / (Math.log10(dom[1]) - Math.log10(dom[0])) * ph
    : (v: number) => m.t + ph - (v - dom[0]) / (dom[1] - dom[0]) * ph;
  const col = `var(${color})`;
  let d = '';
  for (let n = NMIN; n <= NMAX; n++) d += (n === NMIN ? 'M' : 'L') + X(n).toFixed(1) + ' ' + Y(valueAt(n)).toFixed(1);
  const area = d + `L${X(NMAX).toFixed(1)} ${(m.t + ph).toFixed(1)}L${X(NMIN).toFixed(1)} ${(m.t + ph).toFixed(1)}Z`;
  const mk = mark && mark.n >= NMIN && mark.n <= NMAX ? {...mark, x: X(mark.n), y: Y(mark.v), right: X(mark.n) < m.l + pw * 0.7} : null;
  return (
    <svg viewBox="0 0 420 260" role="img" aria-label={label}>
      {ticks.map(t => <>
        <line x1={m.l} y1={Y(t).toFixed(1)} x2={m.l + pw} y2={Y(t).toFixed(1)} stroke="var(--line-soft)" stroke-width="1" />
        <text x={m.l - 8} y={(Y(t) + 4).toFixed(1)} text-anchor="end" fill="var(--ink-3)" font-size="10.5" font-family={FONT}>{fmt(t)}</text>
      </>)}
      <path d={area} fill={col} opacity="0.1" />
      <path d={d} fill="none" stroke={col} stroke-width="2" stroke-linejoin="round" />
      <circle cx={X(NMAX).toFixed(1)} cy={Y(valueAt(NMAX)).toFixed(1)} r="4" fill={col} />
      {mk && <>
        <circle cx={mk.x.toFixed(1)} cy={mk.y.toFixed(1)} r="5" fill="var(--ink)" stroke="var(--surface)" stroke-width="2" />
        <text x={(mk.right ? mk.x + 10 : mk.x - 10).toFixed(1)} y={(mk.y - 8).toFixed(1)} text-anchor={mk.right ? 'start' : 'end'} fill="var(--ink)" font-size="11" font-weight="700" font-family={FONT}>{mk.label}</text>
      </>}
      {[100, 300, 500, 649].map(n => <text x={X(n).toFixed(1)} y={m.t + ph + 20} text-anchor="middle" fill="var(--ink-3)" font-size="10.5" font-family={FONT}>{n}</text>)}
      <text x={m.l + pw / 2} y={hh - 3} text-anchor="middle" fill="var(--ink-3)" font-size="10" font-family={FONT} letter-spacing="1">{tr('ESPÈCES', 'SPECIES')}</text>
    </svg>
  );
}

type SimReply = {res: StratResult[]} | {byRate: ByRate};

function App() {
  const {save} = useSave();
  const mine = useMemo(() => save && mineFrom(save), [save]);
  const [mode, setMode] = useState<Mode>('n');
  const [p, setP] = useState(loadPrefs);
  const [strat, setStrat] = useState<number | null>(null);
  const [sim, setSim] = useState<{res: StratResult[] | null; byRate: ByRate | null; busy: boolean}>({res: null, byRate: null, busy: false});
  const [boot, setBoot] = useState<{set: Settings; rate: number | null} | null>(null);
  const update = (patch: Partial<Prefs>) => {
    const next = {...p, ...patch};
    setP(next);
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch {}
  };

  // Values read from the app: sliders, and the daily rate from usage.json or the save.
  const saveRate = useMemo(() => {
    const days = mine && mine.since ? (Date.now() - mine.since) / 864e5 : 0;
    return mine && days >= 3 ? clampR(mine.used / days / 1e6) : null;
  }, [mine]);
  const fromApp = boot && (boot.set.live || mine) ? boot.set : null;
  const my = {G: fromApp && fromApp.g, S: fromApp && fromApp.s, R: boot && boot.rate != null ? clampR(boot.rate) : saveRate};
  const rFrom = boot && boot.rate != null ? tr('Ta moyenne sur 14 jours, lue dans tes logs', 'Your 14-day average, read from your logs') : tr('Ta moyenne depuis ta première capture', 'Your average since your first catch');
  const applyMine = () => update({G: my.G ?? p.G, R: my.R ?? p.R, S: my.S ?? p.S});
  useEffect(() => {
    Promise.all([appSettings(), fetchServedJSON<{hours: Hours}>('usage.json')]).then(([set, usage]) =>
      setBoot({set, rate: usage && hourProfile(usage.hours, Date.now()).reduce((a, b) => a + b, 0) / 1e6}));
  }, []);
  useEffect(() => { if (boot && (boot.set.live || boot.rate != null || mine)) applyMine(); }, [boot]);

  // Strategies are simulated in a worker, again whenever an input of the simulation settles.
  const simKey = [p.G, p.S, p.F, p.F ? p.R : 0, mine ? mine.at : 0].join('|');
  const simmed = useRef(false);
  useEffect(() => {
    let w: Worker | undefined, alive = true;
    const t = setTimeout(() => {
      setSim(s => ({...s, busy: true, byRate: null}));
      w = new Worker(new URL('./sim.worker.ts', import.meta.url), {type: 'module'});
      w.onmessage = (e: MessageEvent<SimReply>) => {
        if (!alive) return;
        const r = e.data;
        setSim(s => 'byRate' in r ? {...s, byRate: r.byRate} : {res: r.res, byRate: s.byRate, busy: false});
      };
      w.postMessage({params: {g: p.G / 100, s: p.S / 100, rate: p.R, freeWeek: p.F, init: simInit(mine, p.G)}, rates: RROWS});
    }, simmed.current ? 250 : 0);
    simmed.current = true;
    return () => { alive = false; clearTimeout(t); w?.terminate(); };
  }, [simKey]);

  const {G, R, NSEL, S, F} = p, g = G / 100, on = mode === 'n', lab = MODES[mode].label;
  const res = on ? sim.res : null;
  const best = res ? bestStrat(res, NSEL, R) : 0, cur = strat ?? best;
  const base = mine ? (on ? mine.dex : mine.shiny) : 0, done = NSEL <= base;
  const years = yearsFn(mode, base, res, cur, F, R, sim.byRate);
  const startN = Math.max(NMIN, base + 1);
  const howTxt = res ? tr(`stratégie « ${STRATS[cur].name} »`, `with the “${STRATS[cur].name}” strategy`) : tr('sans boutique', 'without the shop');
  const y = years(NSEL, R, g), o = dur(y);

  const how = LANG === 'fr' ? ` à <b>${R} M de tokens par jour</b>, croissance à <b>${G} %</b>` + (res ? `, stratégie « <b>${STRATS[cur].name}</b> »` : '')
    : ` at <b>${R} M tokens a day</b>, growth at <b>${G}%</b>` + (res ? `, “<b>${STRATS[cur].name}</b>” strategy` : '');
  const sentence = LANG === 'fr' ? (done ? `Tu as déjà <b>${base} ${lab}</b> : l'objectif de ${NSEL} est atteint.`
    : mine ? `Il te manque <b>${NSEL - base} ${lab}</b> pour arriver à ${NSEL} (tu en as ${base}),${how}. Arrivée <b>${whenTxt(y)}</b>.`
    : `Pour tenir <b>${NSEL} des ${MODES[mode].goal}</b>${how}. Arrivée <b>${whenTxt(y)}</b>.`)
    : done ? `You already have <b>${base} ${lab}</b>: the goal of ${NSEL} is reached.`
    : mine ? `You need <b>${NSEL - base} more ${lab}</b> to reach ${NSEL} (you have ${base}),${how}. Arrival <b>${whenTxt(y)}</b>.`
    : `To get <b>${NSEL} of the ${MODES[mode].goal}</b>${how}. Arrival <b>${whenTxt(y)}</b>.`;

  let tiles: [string, string][];
  const kHatch = mine ? tr('Éclosions à venir', 'Hatches to come') : tr('Éclosions', 'Hatches');
  if (res) tiles = [[kHatch, nf.format(Math.round(res[cur].hatches[NSEL]))], [tr('Bonbons utilisés', 'Rare Candies used'), nf.format(Math.round(res[cur].candies[NSEL]))], [tr('Œufs Rare+', 'Rare+ Eggs'), nf.format(Math.round(res[cur].eggs[NSEL]))]];
  else {
    const hatch = MODES[mode].hatch, hv = Math.max(0, hatch[NSEL - 1] - (base ? hatch[Math.min(base, NMAX) - 1] : 0));
    const cost = MODES[mode].cost, have = base > 0 ? cost[Math.min(base, NMAX) - 1] : 0;
    tiles = [[kHatch, nf.format(hv)],
      on ? [tr('Doublons', 'Duplicates'), DUPPCT[NSEL - 1].toFixed(0) + tr(' %', '%')] : [tr('Shiny éclos', 'Shinies hatched'), nf.format(Math.round(hv / MODES[mode].denom))],
      [mine ? tr('Tokens à brûler', 'Tokens to burn') : tr('Tokens brûlés', 'Tokens burnt'), tokTxt((cost[NSEL - 1] - have) * g)]];
  }
  if (done) tiles = tiles.map(([k]) => [k, '–']);

  let steps = STEPS.filter(n => n > base);
  if (steps.length > 12) steps = steps.slice(0, 11).concat(649);
  let exp = 0; while (mine && exp < NMAX && HATCH_N[exp] <= mine.hatches) exp++;
  const ahead = mine ? mine.dex - exp : 0;
  const days = mine && mine.since ? Math.max(1, Math.round((Date.now() - mine.since) / 864e5)) : 0;
  const first = mine && mine.since ? new Date(mine.since).toLocaleDateString(LOCALE, {day: 'numeric', month: 'long'}) : '';

  const slider = (id: string, k: keyof Prefs, label: string, out: string, hint: string) => (
    <div class="ctl">
      <div class="ctl-top"><label for={id}>{label}</label><output for={id}>{out}</output></div>
      <input type="range" id={id} min={RANGES[k][0]} max={RANGES[k][1]} step="1" value={p[k]} onInput={e => update({[k]: +e.currentTarget.value})} />
      <span class="hint">{hint}</span>
    </div>
  );

  return (
    <div class="wrap">
      <Header save={save} title={tr('Le chrono du Pokédex', 'Pokédex chrono')}
        eyebrow={save ? saveEyebrow(save) : tr('TokenDex · simulation Monte-Carlo, 120 à 200 parties', 'TokenDex · Monte Carlo simulation, 120 to 200 games')}
        lede={tr('Combien de temps il te reste pour remplir le Pokédex de PokeTokenBar, en partant de ta collection, selon ce que tu brûles par jour et où tu places le curseur de croissance. Les 600 premières espèces sont une promenade. Les 49 dernières sont un autre jeu, et le dex shiny en est encore un autre.', 'How long you have left to fill PokeTokenBar\'s Pokédex, starting from your collection, depending on what you burn per day and where you put the growth slider. The first 600 species are a walk in the park. The last 49 are another game, and the shiny dex is yet another.')} />

      <section class="panel mine" aria-label={tr('Ta partie', 'Your game')}>
        <div class="panel-head"><h2>{tr('Ta partie', 'Your game')}</h2><p>{mine && mine.since ? tr(`Première capture le ${first}, il y a ${days} jour${days > 1 ? 's' : ''}.`, `First catch on ${first}, ${days} day${days > 1 ? 's' : ''} ago.`) : ''}</p></div>
        {mine && <div class="tiles mine-tiles">
          {[['Pokédex', `${mine.dex} / 649`], [tr('Espèces shiny', 'Shiny species'), mine.shiny], [tr('Éclosions', 'Hatches'), nf.format(mine.hatches) + (mine.active ? ' + 1' : '')],
            [tr('Bonbons', 'Rare Candies'), mine.candies], [tr('Solde boutique', 'Shop balance'), tok(mine.wallet)]].map(([k, v]) => <div class="tile"><span class="k">{k}</span><span class="v">{v}</span></div>)}
        </div>}
        <p class="sentence">{!mine ? tr(<>Aucune sauvegarde chargée : tout part de zéro. Charge-la depuis <a href="index.html" style="color:var(--s3)">l'accueil</a>.</>, <>No save loaded: everything starts from zero. Load it from <a href="index.html" style="color:var(--s3)">the home page</a>.</>)
          : !mine.hatches ? '' : bold(LANG === 'fr' ? `Pour <b>${mine.hatches} éclosions</b>, le modèle attend <b>${exp} espèces</b> en médiane. Tu en as ${mine.dex} : `
            + (Math.abs(ahead) <= 2 ? 'pile dans la moyenne.' : ahead > 0 ? `<b>${ahead} d'avance</b>, la chance est avec toi.` : `<b>${-ahead} de retard</b>, pas de chance pour l'instant.`)
            : `For <b>${mine.hatches} hatches</b>, the model expects <b>${exp} species</b> at the median. You have ${mine.dex}: `
            + (Math.abs(ahead) <= 2 ? 'right on average.' : ahead > 0 ? `<b>${ahead} ahead</b>, luck is on your side.` : `<b>${-ahead} behind</b>, no luck so far.`))}</p>
      </section>

      <section class="panel" aria-label={tr('Objectif de collection', 'Collection goal')}>
        <div class="modes" role="radiogroup" aria-label={tr('Type de Pokédex', 'Pokédex type')}>
          {([['n', tr('Dex normal', 'Normal dex'), tr('649 espèces', '649 species')], ['s64', tr('Dex shiny', 'Shiny dex'), tr('sans charme · 1/64', 'no charm · 1/64')],
            ['s48', tr('Dex shiny', 'Shiny dex'), tr('avec charme · 1/48', 'with charm · 1/48') + (mine && mine.charm ? tr(' · tu l\'as', ' · you have it') : '')]] as const).map(([m, name, sub]) =>
            <button type="button" class={m === mode ? 'mode on' : 'mode'} onClick={() => setMode(m)}>{name}<em>{sub}</em></button>)}
        </div>
      </section>

      <section class="panel controls" aria-label={tr('Réglages', 'Settings')}>
        {slider('g', 'G', tr('Croissance', 'Growth'), G + tr(' %', '%'), my.G != null ? tr(`Réglages → seuils de croissance. Dans ton app : ${my.G} %.`, `Settings → growth thresholds. In your app: ${my.G}%.`) : tr('Réglages → seuils de croissance. 100 % = valeurs par défaut.', 'Settings → growth thresholds. 100% = defaults.'))}
        {slider('r', 'R', tr('Tokens / jour', 'Tokens / day'), R + ' M', my.R != null ? tr(`${rFrom} : ${my.R} M. L'app est calibrée sur 253 M.`, `${rFrom}: ${my.R} M. The app is calibrated on 253 M.`) : tr('Total quotidien lu dans tes logs, tous outils confondus. 253 M = la moyenne sur laquelle l\'app est calibrée.', 'Daily total read from your logs, all tools combined. 253 M = the average the app is calibrated on.'))}
        {slider('n', 'NSEL', tr('Objectif', 'Goal'), NSEL + ' ' + lab, tr('Le dex va de Bulbizarre #1 à Genesect #649.', 'The dex runs from Bulbasaur #1 to Genesect #649.'))}
        {slider('s', 'S', tr('Boutique', 'Shop'), S + tr(' %', '%'), my.S != null ? tr(`Réglages → prix de la boutique. Dans ton app : ${my.S} %.`, `Settings → shop prices. In your app: ${my.S}%.`) : tr('Réglages → prix de la boutique. Un bonbon coûte 500 M × ce taux.', 'Settings → shop prices. A Rare Candy costs 500 M × this rate.'))}
        {slider('f', 'F', tr('Bonbons gratuits / semaine', 'Free Rare Candies / week'), String(F), tr('Gagnés en atteignant tes limites : 5 à 100 % de l\'hebdo, 1 par session.', 'Earned by hitting your limits: 5 to 100 % of the weekly one, 1 per session.'))}
        {(['G', 'R', 'S'] as const).some(k => my[k] != null && my[k] !== p[k]) && <div class="mine-reset"><button type="button" class="linkbtn" onClick={applyMine}>{tr('Reprendre mes valeurs', 'Use my values')}</button></div>}
      </section>

      <section class="panel" aria-label={tr('Stratégie boutique', 'Shop strategy')}>
        <div class="panel-head"><h2>{tr('Stratégie boutique', 'Shop strategy')}</h2><p>{!on ? tr('Simulé pour le dex normal seulement.', 'Simulated for the normal dex only.')
          : done ? tr(`Tu as déjà ${NSEL} espèces.`, `You already have ${NSEL} species.`)
          : sim.busy || !res ? tr('Calcul en cours…', 'Computing…')
          : tr(`Pour ${NSEL} espèces, « ${STRATS[best].name} » est la plus rapide${strat === null ? ' (sélectionnée d\'office)' : ''}.`, `For ${NSEL} species, “${STRATS[best].name}” is the fastest${strat === null ? ' (picked by default)' : ''}.`)}</p></div>
        <div class="modes" role="radiogroup" aria-label={tr('Stratégie', 'Strategy')}>
          {STRATS.map((st, i) => {
            const t = on && done ? tr('déjà fait', 'already done') : res ? durTxt(stratYears(res, i, NSEL, R)) + (i === best ? tr(' · le plus rapide', ' · fastest') : '') : on ? tr('calcul…', 'computing…') : st.sub;
            const sel = !!res && i === cur;
            return <button type="button" class={sel ? 'mode on' : 'mode'} role="radio" aria-checked={sel} disabled={!on} onClick={() => setStrat(i)}>{st.name}<em>{t}</em></button>;
          })}
        </div>
        <p class="hint" style="margin-top:12px">{tr(
          <><b>Sans boutique</b> : seuls les bonbons gratuits servent, et seulement s'il reste au moins 100&nbsp;M à faire. <b>Bonbons</b> : tout le solde part en bonbons, utilisés dès qu'ils arrivent même si une partie de l'XP est perdue à la graduation. <b>Rare+ sur doublon</b> : on garde de quoi payer un œuf Rare+ et on l'achète dès qu'un œuf sort une ligne déjà complète, le surplus part en bonbons. <b>Rare+ en fin de partie</b> : pareil, mais seulement une fois toutes les lignes non rares complètes. Médiane de 30 parties par stratégie, <span>{mine ? 'en partant de ta sauvegarde' : 'en partant de zéro'}</span>. Les paliers, le faisceau et la grille suivent la stratégie choisie. Les deux petits graphiques comptent les éclosions sans boutique.</>,
          <><b>No shop</b>: only free Rare Candies are used, and only when at least 100&nbsp;M is left to go. <b>Rare Candies</b>: the whole balance goes into Rare Candies, used as soon as they arrive even if some XP is lost at graduation. <b>Rare+ on duplicates</b>: keep enough for a Rare+ Egg and buy one as soon as an egg draws an already complete line; the surplus goes into Rare Candies. <b>Rare+ in the endgame</b>: the same, but only once every non-rare line is complete. Median of 30 games per strategy, <span>{mine ? 'starting from your save' : 'starting from zero'}</span>. The milestones, the beam and the grid follow the chosen strategy. The two small charts count hatches without the shop.</>,
        )}</p>
      </section>

      <section class="panel readout" aria-label={tr('Résultat', 'Result')}>
        <div>
          <span class="eyebrow">{mine ? tr('Temps restant', 'Time left') : tr('Temps estimé', 'Estimated time')}</span>
          <div class="big">{done ? tr('C\'est fait', 'Done') : <>{`${o.v} `}<small>{o.u}</small></>}</div>
          <p class="sentence">{bold(sentence)}</p>
        </div>
        <Tiles items={tiles} />
      </section>

      {mine && <section class="panel" aria-label={tr('Tes prochains paliers', 'Your next milestones')}>
        <div class="panel-head"><h2>{tr('Tes prochains paliers', 'Your next milestones')}</h2><p>{tr('Temps restant et date d\'arrivée à ton rythme, avec la stratégie choisie.', 'Time left and arrival date at your pace, with the chosen strategy.')}</p></div>
        <div class="steps">
          {steps.length ? steps.map(n => {
            const y = years(n, R, g);
            return <div class={n === NSEL ? 'step sel' : 'step'}><b>{n + (on ? '' : ' ✦')}</b><span>{`${tr('dans', 'in')} ${durTxt(y)}`}</span><span>{whenTxt(y)}</span></div>;
          }) : <p class="hint">{tr('Plus rien à viser dans ce dex.', 'Nothing left to aim for in this dex.')}</p>}
        </div>
      </section>}

      <figure class="panel">
        <div class="panel-head">
          <h2>{tr('Temps par objectif', 'Time per goal')}</h2>
          <p>{tr('Échelle logarithmique : chaque repère vaut dix fois le précédent.', 'Log scale: each mark is worth ten times the previous one.')}<span>{` ${tr('Courbes', 'Curves')} ${howTxt}.`}</span><span>{mine && base >= NMIN ? tr(' La zone grisée, c\'est ce que tu as déjà.', ' The grey area is what you already have.') : ''}</span></p>
        </div>
        <Beam years={years} g={g} rate={R} nSel={NSEL} startN={startN} base={base} label={lab} />
      </figure>

      <figure class="panel">
        <div class="panel-head">
          <h2>{tr('La grille complète', 'The full grid')}</h2>
          <p>{tr('Durée pour chaque couple objectif / débit, au réglage de croissance choisi', 'Time for each goal / rate pair, at the chosen growth setting')}<span>{`, ${howTxt}`}</span>{tr('. Plus la case est sombre, plus c\'est long.', '. The darker the cell, the longer.')}</p>
        </div>
        <div class="scroller"><Heat years={years} g={g} base={base} label={lab} /></div>
      </figure>

      <div class="split">
        <figure class="panel">
          <div class="panel-head"><h2>{tr('Pourquoi ça bloque', 'Why it stalls')}</h2></div>
          <p class="hint" style="margin-top:-6px">{tr(<>Éclosions cumulées nécessaires pour le <b>dex normal</b> (log). Une éclosion coûte le même prix qu'elle t'apporte une espèce ou non.</>, <>Cumulative hatches needed for the <b>normal dex</b> (log). A hatch costs the same whether it brings you a species or not.</>)}</p>
          <div class="chart-box">
            <SmallChart label={tr('Éclosions cumulées en fonction du nombre d\'espèces obtenues', 'Cumulative hatches by number of species caught')} valueAt={n => HATCH_N[n - 1]}
              left={44} log dom={[10, 100000]} ticks={[10, 100, 1000, 10000, 100000]} fmt={v => v >= 1000 ? nf.format(v / 1000) + 'k' : String(v)} color="--s3"
              mark={mine && {n: mine.dex, v: Math.max(10, mine.hatches), label: `${tr('toi', 'you')} · ${mine.hatches}`}} />
          </div>
        </figure>
        <figure class="panel">
          <div class="panel-head"><h2>{tr('Part de doublons', 'Share of duplicates')}</h2></div>
          <p class="hint" style="margin-top:-6px">{tr(<>Proportion des éclosions du <b>dex normal</b> qui retombent sur une ligne déjà graduée. En chasse shiny elle sature à 100 %.</>, <>Share of <b>normal dex</b> hatches that land on an already graduated line. In a shiny hunt it saturates at 100&nbsp;%.</>)}</p>
          <div class="chart-box">
            <SmallChart label={tr('Pourcentage d\'éclosions en doublon selon le nombre d\'espèces obtenues', 'Share of duplicate hatches by number of species caught')} valueAt={n => Math.max(DUPPCT[n - 1], 0.5)}
              left={36} log={false} dom={[0, 100]} ticks={[0, 25, 50, 75, 100]} fmt={v => v + tr(' %', '%')} color="--hot"
              mark={mine && mine.dex >= 1 ? {n: mine.dex, v: Math.max(DUPPCT[Math.min(mine.dex, NMAX) - 1], 0.5), label: `${tr('toi', 'you')} · ${DUPPCT[Math.min(mine.dex, NMAX) - 1].toFixed(0)}${tr(' %', '%')}`} : null} />
          </div>
        </figure>
      </div>

      <div class="note">{tr(
        <><b>Le curseur ne change jamais le nombre d'éclosions.</b> Il ne touche que le prix d'une graduation, donc sans boutique tout est proportionnel : passer de 20 % à 100 % multiplie chaque durée par exactement 5. Ce qui bloque, ce sont les 48 lignes légendaires, tirées à un poids de 3 sur 43&nbsp;767.</>,
        <><b>The slider never changes the number of hatches.</b> It only touches the price of a graduation, so without the shop everything is proportional: going from 20% to 100% multiplies every duration by exactly 5. What blocks you is the 48 legendary lines, drawn at a weight of 3 out of 43,767.</>,
      )}</div>
      {!on && <div class="note">{tr(
        <><b>Le Charme Chroma ne règle rien.</b> Il fait passer le dénominateur de 1/64 à 1/48, soit 25 % d'éclosions en moins, et il coûte 3&nbsp;Md au prix boutique, une paille à cette échelle. Le vrai problème est que le bonus anti-doublon est déjà consommé : une fois toutes les lignes graduées, leur poids de tirage est figé à <code>capture_rate / 2</code>, et le plancher <code>max(1, …)</code> fait tomber les légendaires de 3 à 1 au lieu de 1,5. Ils deviennent donc <b>1,5× plus rares</b> en chasse shiny que pendant le dex normal.</>,
        <><b>The Shiny Charm fixes nothing.</b> It moves the odds from 1/64 to 1/48, 25% fewer hatches, and costs 3&nbsp;B at shop price, peanuts at this scale. The real problem is that the anti-duplicate bonus is already spent: once every line has graduated, its draw weight is stuck at <code>capture_rate / 2</code>, and the <code>max(1, …)</code> floor drops legendaries from 3 to 1 instead of 1.5. So they become <b>1.5× rarer</b> in a shiny hunt than during the normal dex.</>,
      )}</div>}

      <footer>
        <span>{tr(
          <>Modèle : 328 lignes de base tirables (Gen&nbsp;1&ndash;5, arbres élagués à l'id 649 comme le fait <code>EvoLine.init</code>), pondération par le <code>capture_rate</code> officiel, poids divisé par deux et croissance ×2 sur une ligne déjà graduée. Graduation = 750&nbsp;M / 1,875&nbsp;Md / 3&nbsp;Md / 6&nbsp;Md tokens selon la rareté, plus 5&nbsp;M par œuf.</>,
          <>Model: 328 drawable base lines (Gen&nbsp;1 to 5, trees pruned at id 649 like <code>EvoLine.init</code> does), weighted by the official <code>capture_rate</code>, weight halved and growth ×2 on an already graduated line. Graduation = 750&nbsp;M / 1.875&nbsp;B / 3&nbsp;B / 6&nbsp;B tokens depending on rarity, plus 5&nbsp;M per egg.</>,
        )}</span>
        {mine && <span>{tr('Départ : ta sauvegarde. Les lignes déjà graduées gardent leur poids réduit, le Pokémon en cours finit sa croissance, tes bonbons et ton solde boutique sont repris. Les courbes et la grille retranchent la médiane du modèle à ton nombre d\'espèces.', 'Start: your save. Lines already graduated keep their reduced weight, the growing Pokémon finishes growing, your Rare Candies and shop balance carry over. The curves and the grid subtract the model\'s median at your species count.')}</span>}
        <span>{tr('Médiane de 200 parties simulées. À 649 espèces la dispersion est large (p25 13,4 T, p75 18,4 T) : lis les valeurs extrêmes à ±20 %.', 'Median of 200 simulated games. At 649 species the spread is wide (p25 13.4 T, p75 18.4 T): read extreme values at ±20%.')}</span>
      </footer>
    </div>
  );
}

mount(tr('Le chrono du Pokédex', 'Pokédex chrono'), App);
