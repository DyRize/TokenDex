import type {ComponentChildren} from 'preact';
import {render} from 'preact';
import {fmtSaveDate} from '../lib/format';
import {tr} from '../lib/i18n';
import type {Save} from '../lib/save';
import {EGG_SPRITE, bwSprite, spriteID} from '../lib/sprites';
import {Nav} from './Nav';

/** Mounts a page: the menu, then the page itself in the centered column. */
export function mount(title: string, App: () => ComponentChildren) {
  document.title = `${title} · TokenDex`;
  render(<><Nav /><App /></>, document.getElementById('root')!);
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
        <div class={cls ? `tile ${cls}` : 'tile'}>
          <span class="k">{k}</span><span class="v">{v}</span>{s !== undefined && <span class="s">{s}</span>}
        </div>
      ))}
    </div>
  );
}
