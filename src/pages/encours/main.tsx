import '../../styles/base.css';
import './encours.css';
import '../../styles/theme.css';
import type {ComponentChildren} from 'preact';
import {useState} from 'preact/hooks';
import {Header, NoSave, Tiles, mount, saveEyebrow, type TileData} from '../../components/Page';
import {RarityTag} from '../../components/Rarity';
import {NAMES} from '../../data/species';
import {CANDY_XP, EGG_COST, scaled, stageCosts, toGraduation} from '../../lib/balance';
import {tok} from '../../lib/format';
import {useSave, useServed, useSettings} from '../../lib/hooks';
import {LANG, LOCALE, tr} from '../../lib/i18n';
import type {State} from '../../lib/save';
import {EGG_SPRITE, bwSprite, spriteID, withForm} from '../../lib/sprites';
import {hourKey, hourProfile, type Hours} from '../../lib/usage';

// Walks forward hour by hour, spending the usual amount for that hour, until `need` tokens are burnt.
function projectEta(need: number, prof: number[], now: Date) {
  if (need <= 0) return now;
  if (prof.every(x => x === 0)) return null;
  const t = new Date(now);
  let left = need, frac = 1 - t.getMinutes() / 60;
  for (let i = 0; i < 24 * 90; i++) {
    const burn = prof[t.getHours()] * frac;
    if (burn >= left) return new Date(t.getTime() + (left / prof[t.getHours()]) * 3600e3);
    left -= burn; frac = 1;
    t.setMinutes(0, 0, 0); t.setHours(t.getHours() + 1);
  }
  return null;
}
const fmtEta = (d: Date, now: Date) => {
  const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 864e5);
  const hh = LANG === 'fr' ? d.toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'}).replace(':', '\u00a0h\u00a0')
    : d.toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'});
  if (days === 0) return tr(`aujourd'hui vers\u00a0${hh}`, `today around ${hh}`);
  if (days === 1) return tr(`demain vers\u00a0${hh}`, `tomorrow around ${hh}`);
  if (days < 7) return `${d.toLocaleDateString(LOCALE, {weekday: 'long'})} ${tr('vers', 'around')} ${hh}`;
  return `${tr('vers le', 'around')} ${d.toLocaleDateString(LOCALE, {day: 'numeric', month: 'long'})}`;
};
const hourLabel = (d: Date) => tr(`${d.getHours()} h`, `${d.getHours()}:00`);

function Rate({hours, prof, now}: {hours: Hours; prof: number[]; now: Date}) {
  const [tip, setTip] = useState<{i: number; left: number; top: number; on: boolean} | null>(null);
  const W = 900, H = 220, L = 46, R = 8, T = 10, B = 26, n = 24, bw = (W - L - R) / n;
  const pts = Array.from({length: n}, (_, i) => { const d = new Date(now); d.setMinutes(0, 0, 0); d.setHours(d.getHours() - (n - 1 - i)); return {d, v: hours[hourKey(d)] || 0, avg: prof[d.getHours()]}; });
  const max = Math.max(1, ...pts.map(p => Math.max(p.v, p.avg))) * 1.1;
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const onMove = (e: MouseEvent & {currentTarget: SVGSVGElement}) => {
    const hit = (e.target as Element).closest<SVGElement>('.hit');
    if (!hit) return setTip(t => t && {...t, on: false});
    const box = e.currentTarget.getBoundingClientRect();
    setTip({i: +hit.dataset.i!, on: true, left: Math.min(box.width - 170, e.clientX - box.left + 12), top: e.clientY - box.top - 40});
  };
  const p = tip && pts[tip.i];
  return (
    <div class="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={tr('Tokens par heure sur 24 heures', 'Tokens per hour over 24 hours')}
        onMouseMove={onMove} onMouseLeave={() => setTip(t => t && {...t, on: false})}>
        {[0, max / 2, max].map(v => <>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line-soft)" />
          <text x={L - 6} y={y(v) + 4} text-anchor="end" font-size="11" fill="var(--ink-3)">{tok(v)}</text>
        </>)}
        {pts.map((p, i) => {
          const x = L + i * bw + 1, h = Math.max(0, H - B - y(p.v));
          return <>
            <rect x={x} y={H - B - h} width={bw - 2} height={h} rx="3" fill="var(--s3)" />
            {(i % 3 === 0 || i === n - 1) && <text x={x + bw / 2 - 1} y={H - 8} text-anchor="middle" font-size="11" fill="var(--ink-3)">{hourLabel(p.d)}</text>}
            <rect class="hit" data-i={i} x={L + i * bw} y={T} width={bw} height={H - T - B} fill="transparent" />
          </>;
        })}
        <path d={pts.map((p, i) => `${i ? 'L' : 'M'}${L + i * bw + bw / 2},${y(p.avg)}`).join('')} fill="none" stroke="var(--brand)" stroke-width="2" stroke-linejoin="round" />
      </svg>
      <div class="tip" style={tip ? {opacity: tip.on ? 1 : 0, left: tip.left, top: tip.top} : undefined}>
        {p && <><b>{`${p.d.toLocaleDateString(LOCALE, {weekday: 'short'})} ${hourLabel(p.d)}`}</b>{`${tok(p.v)} · ${tr('moyenne', 'average')} ${tok(p.avg)}`}</>}
      </div>
    </div>
  );
}

function Growing({st, g, hours}: {st: State; g: number; hours: Hours | null}) {
  const a = st.active, now = new Date(), prof = hours && hourProfile(hours, now);
  const candies = st.inventory.rareCandy || 0;
  const id = a ? a.path[a.stage] || a.baseID : 0, costs = a ? stageCosts(a, g) : [], names = a ? a.planned.map(id => NAMES[id - 1]) : [];
  const total = costs.reduce((x, y) => x + y, 0);
  const need = a ? toGraduation(a, g) : Math.max(0, scaled(EGG_COST, g) - st.eggUsage);
  const nextNeed = a && a.stage < costs.length - 1 ? costs[a.stage] - a.used : null;
  let tiles: TileData[];
  if (!a) tiles = [[tr('Avant éclosion', 'Until hatch'), tok(need), `${tr('sur', 'of')} ${tok(scaled(EGG_COST, g))}`]];
  else {
    const free = Math.min(candies, Math.floor(need / CANDY_XP));
    tiles = [
      [tr('Avant graduation', 'Until graduation'), tok(need), `${tr('sur', 'of')} ${tok(total)}${a.boost ? tr(', ligne déjà graduée', ', line already graduated') : ''}`],
      [tr('Prochaine évolution', 'Next evolution'), nextNeed == null ? tr('Forme finale', 'Final form') : tok(nextNeed), nextNeed == null ? tr('reste la graduation', 'graduation left') : `${tr('vers', 'into')} ${names[a.stage + 1] || '?'}`],
      [tr('Tes bonbons', 'Your Rare Candies'), String(candies), !candies ? tr('aucun en stock', 'none in stock') : free ? tr(`${free} utilisable${free > 1 ? 's' : ''} sans perte`, `${free} usable without waste`) : tr('aucun sans perte, garde-les', 'none without waste, keep them')],
    ];
  }
  if (hours && prof) {
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    let sum = 0; for (let h = 0; h <= now.getHours(); h++) { today.setHours(h); sum += hours[hourKey(today)] || 0; }
    const avg = tok(prof.reduce((x, y) => x + y, 0));
    tiles.push([tr('Aujourd\'hui', 'Today'), tok(sum), tr(`ta moyenne : ${avg} / jour`, `your average: ${avg} / day`)]);
  }
  const what = a ? 'Graduation' : tr('Éclosion', 'Hatch');
  const eta = prof && projectEta(need, prof, now);
  let sentence: ComponentChildren;
  if (!prof) sentence = tr('Lance le serveur local pour avoir l\'heure estimée : il faut l\'historique de tokens de l\'app.', 'Start the local server to get an estimated time: it needs the app\'s token history.');
  else {
    const parts: ComponentChildren[] = [];
    if (a && nextNeed != null) { const ev = projectEta(nextNeed, prof, now); if (ev) parts.push(tr(`Évolution ${fmtEta(ev, now)}, encore ${tok(nextNeed)}.`, `Evolution ${fmtEta(ev, now)}, ${tok(nextNeed)} to go.`)); }
    if (eta) {
      parts.push(tr(<>Il reste <b>{tok(need)}</b>{` avant ${a ? 'la graduation' : 'l\'éclosion'}.`}</>, <><b>{tok(need)}</b>{` left until ${a ? 'graduation' : 'it hatches'}.`}</>));
      if (eta.toDateString() !== now.toDateString()) {
        const tonight = tok(prof.slice(now.getHours()).reduce((x, y) => x + y, 0) - prof[now.getHours()] * now.getMinutes() / 60);
        const rest = fmtEta(eta, now).split(tr(' vers', ' around'))[0];
        parts.push(tr(<>D'habitude tu consommes <b>{tonight}</b>{` d'ici minuit, le reste ${rest}.`}</>, <>You usually burn <b>{tonight}</b>{` before midnight, the rest ${rest}.`}</>));
      }
    }
    if (a && candies) {
      const use = Math.min(candies, Math.floor(need / CANDY_XP)), withC = use ? projectEta(need - use * CANDY_XP, prof, now) : null;
      if (withC) parts.push(tr(`Avec ${use} bonbon${use > 1 ? 's' : ''} : ${fmtEta(withC, now)}.`, `With ${use} Rare Cand${use > 1 ? 'ies' : 'y'}: ${fmtEta(withC, now)}.`));
    }
    sentence = parts.length ? parts.map((p, i) => <>{i > 0 && ' '}{p}</>) : tr('Pas assez d\'historique pour estimer.', 'Not enough history to estimate.');
  }
  const at = now.toLocaleTimeString(LOCALE, {hour: '2-digit', minute: '2-digit'});
  return <>
    <section class="panel" aria-label={tr('Pokémon en cours', 'Growing Pokémon')}>
      <div class="hero">
        <div class={a ? 'stage-sprite' : 'stage-sprite egg'}>
          <img alt="" src={a ? bwSprite(spriteID(id, a.unownForm), {shiny: a.isShiny, animated: true}) : EGG_SPRITE} />
        </div>
        <div>
          <div class="who">
            <h2>{a ? withForm(NAMES[id - 1], id, a.unownForm) + (a.isShiny ? ' ✦' : '') : tr('Œuf', 'Egg')}</h2>
            {a && <RarityTag rarity={a.rarity} />}
          </div>
          <div class="big">
            {eta ? <>{what + ' '}<small>{fmtEta(eta, now)}</small></> : <>{tok(need) + ' '}<small>{`${tr('avant', 'until')} ${what.toLowerCase()}`}</small></>}
          </div>
          <p class="sentence">{sentence}</p>
        </div>
      </div>
      <div class="stages" aria-label={tr('Progression par étape', 'Progress by stage')}>
        {a && costs.map((c, i) => {
          const fill = i < a.stage ? 100 : i > a.stage ? 0 : Math.min(100, a.used / c * 100);
          return (
            <div class={`seg ${i < a.stage ? 'done' : i === a.stage ? 'now' : ''}`} style={`flex:${c / total}`}>
              <span class="bar"><i style={`width:${fill.toFixed(1)}%`}></i></span><span class="lbl">{`${names[i] || '?'} · ${tok(c)}`}</span>
            </div>
          );
        })}
      </div>
      <Tiles items={tiles} />
      <span class="upd">{tr(`Relu à ${at}, mis à jour toutes les minutes.`, `Read at ${at}, refreshed every minute.`)}</span>
    </section>
    {hours && prof && (
      <section class="panel" aria-label={tr('Ton rythme', 'Your pace')}>
        <div class="panel-head">
          <h2>{tr('Ton rythme', 'Your pace')}</h2>
          <p>{tr('Tokens par heure sur les dernières 24 h, comparés à ta moyenne des 14 derniers jours à la même heure. C\'est ce profil qui sert à l\'estimation.', 'Tokens per hour over the last 24 h, against your average at the same hour over the last 14 days. The estimate runs on this profile.')}</p>
        </div>
        <div class="legend">
          <span><i style="background:var(--s3)"></i>{tr('Dernières 24 h', 'Last 24 h')}</span>
          <span><i class="line" style="background:var(--brand)"></i>{tr('Moyenne à cette heure', 'Average at this hour')}</span>
        </div>
        <Rate hours={hours} prof={prof} now={now} />
      </section>
    )}
  </>;
}

function App() {
  const {save} = useSave(60e3);
  const [settings] = useSettings(60e3);
  const usage = useServed<{hours: Hours}>('usage.json', 60e3);
  return (
    <div class="wrap">
      <Header eyebrow={saveEyebrow(save)} title={tr('En cours', 'Growing')} save={save}
        lede={tr('Où en est ton Pokémon, ce qu\'il lui reste avant d\'évoluer et de graduer, et quand ça devrait tomber à ton rythme habituel.', 'Where your Pokémon stands, what it still needs to evolve and graduate, and when that should happen at your usual pace.')} />
      {save ? <Growing st={save.st} g={settings.g} hours={usage && usage.hours} /> : <section class="panel"><NoSave /></section>}
      <footer>
        {tr(<>
          <p>Coûts repris de <code>PokemonBalance.phaseThreshold</code> : une ligne à k formes coûte T·i / (k(k+1)/2) pour la i-ème forme, T = 750 M, 1,875 Md, 3 Md ou 6 Md selon la rareté, divisé par deux sur une ligne déjà graduée, puis multiplié par ton curseur de croissance. Un bonbon vaut 100 M ; l'excédent passe à la forme suivante, mais il est perdu à la graduation.</p>
          <p>L'estimation avance heure par heure en retirant ce que tu brûles d'habitude à cette heure-là (moyenne des 14 derniers jours). Elle demande le serveur local, qui lit l'historique de tokens de l'app.</p>
        </>, <>
          <p>Costs taken from <code>PokemonBalance.phaseThreshold</code>: a line with k forms costs T·i / (k(k+1)/2) for its i-th form, with T = 750 M, 1.875 B, 3 B or 6 B depending on rarity, halved on a line that already graduated, then multiplied by your growth slider. A Rare Candy is worth 100 M; the surplus carries over to the next form, but is lost at graduation.</p>
          <p>The estimate moves forward hour by hour, taking off what you usually burn at that hour (average of the last 14 days). It needs the local server, which reads the app's token history.</p>
        </>)}
      </footer>
    </div>
  );
}

mount(tr('En cours', 'Growing'), App);
