import type {ComponentChildren} from 'preact';
import {render} from 'preact';
import {useErrorBoundary} from 'preact/hooks';
import {fmtSaveDate} from '../lib/format';
import {feedbackURL} from '../lib/feedback';
import {LANG, tr} from '../lib/i18n';
import type {Save} from '../lib/save';
import {EGG_SPRITE, bwSprite, spriteID} from '../lib/sprites';
import {Nav, currentPage} from './Nav';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/latin-800.css';

// A page that crashes (a save shaped in a way nobody tried yet) says so instead of going blank, and the menu stays usable.
function Guard({children}: {children: ComponentChildren}) {
  const [error] = useErrorBoundary();
  if (!error) return children;
  const report = feedbackURL(currentPage(), LANG, true);
  return (
    <div class="wrap"><section class="panel">
      <p>{tr(
        <>Cette page a planté. Recharge-la ; si ça recommence, copie ce message et <a href={report} target="_blank" rel="noopener">signale-le</a> :</>,
        <>This page crashed. Reload it; if it happens again, copy this message and <a href={report} target="_blank" rel="noopener">report it</a>:</>,
      )}</p>
      <pre style="white-space:pre-wrap;font-size:12px">{String(error && (error as Error).stack || error)}</pre>
    </section></div>
  );
}

/** Mounts a page: the menu, then the page itself in the centered column. */
export function mount(title: string, App: () => ComponentChildren) {
  document.title = `${title} · TokenDex`;
  render(<><Nav /><Guard><App /></Guard></>, document.getElementById('root')!);
}

export const saveEyebrow = (save: Save | null) => save
  ? tr(`TokenDex · d'après ta sauvegarde du ${fmtSaveDate(save.at)}`, `TokenDex · from your save of ${fmtSaveDate(save.at)}`)
  : tr('TokenDex · aucune sauvegarde chargée', 'TokenDex · no save loaded');

// The medallion shows the Pokémon growing right now, or the egg between two hatches.
export function Header({eyebrow, title, lede, save}: {eyebrow: string; title: string; lede: ComponentChildren; save: Save | null}) {
  const a = save && save.st.active;
  return (
    <header>
      <div class={a ? 'mascot' : 'mascot egg'} aria-hidden="true">
        <img alt="" src={a ? bwSprite(spriteID(a.path[a.stage] || a.baseID, a.unownForm), {shiny: a.isShiny, animated: true}) : EGG_SPRITE} />
      </div>
      <span class="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p class="lede">{lede}</p>
    </header>
  );
}

export function NoSave() {
  return tr(
    <p class="empty"><b>Aucune sauvegarde chargée.</b> Charge-la depuis l'<a href="index.html">accueil</a> : elle sert ensuite à toutes les pages.</p>,
    <p class="empty"><b>No save loaded.</b> Load it from the <a href="index.html">home page</a>: every page then uses it.</p>,
  );
}

export type TileData = [k: ComponentChildren, v: ComponentChildren, s?: ComponentChildren, cls?: string];
export function Tiles({items}: {items: TileData[]}) {
  return (
    <div class="tiles">
      {items.map(([k, v, s, cls]) => (
        <div key={k} class={cls ? `tile ${cls}` : 'tile'}>
          <span class="k">{k}</span><span class="v">{v}</span>{s !== undefined && <span class="s">{s}</span>}
        </div>
      ))}
    </div>
  );
}
