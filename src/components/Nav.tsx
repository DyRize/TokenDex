import {setLang, tr} from '../lib/i18n';
import './nav.css';

const PAGES = [
  ['index.html', 'Pokédex'],
  ['encours.html', tr('En cours', 'Growing')],
  ['journal.html', 'Journal'],
  ['carte.html', tr('Carte', 'Card')],
  ['boutique.html', tr('Boutique', 'Shop')],
  ['prochains-pokemon.html', tr('Prochains', 'Next')],
  ['chance-tirage.html', tr('Chance', 'Luck')],
  ['chrono-pokedex.html', 'Chrono'],
];

export function Nav() {
  const here = decodeURIComponent(location.pathname.split('/').pop() || '') || 'index.html';
  return (
    <nav class="ptb-nav" aria-label="TokenDex">
      <div class="in">
        <a class="brand" href="index.html"><span>TokenDex</span></a>
        <div class="tabs">
          {PAGES.map(([href, label]) => <a href={href} aria-current={href === here ? 'page' : undefined}>{label}</a>)}
        </div>
        <button type="button" class="lang" lang={tr('en', 'fr')} title={tr('English', 'Français')} onClick={() => setLang(tr('en', 'fr'))}>
          {tr('EN', 'FR')}
        </button>
      </div>
    </nav>
  );
}
