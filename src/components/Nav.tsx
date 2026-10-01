import {version} from '../../package.json';
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
// "alpha" in 0.1.0-alpha.1, nothing once released.
const STAGE = version.split('-')[1]?.split('.')[0];

export function Nav() {
  const here = decodeURIComponent(location.pathname.split('/').pop() || '') || 'index.html';
  return (
    <nav class="ptb-nav" aria-label="TokenDex">
      <div class="in">
        <a class="brand" href="index.html"><span>TokenDex</span></a>
        {STAGE && <span class="stage" title={`Version ${version}`}>{STAGE}</span>}
        <div class="tabs">
          {PAGES.map(([href, label]) => <a key={href} href={href} aria-current={href === here ? 'page' : undefined}>{label}</a>)}
        </div>
        <button type="button" class="lang" lang={tr('en', 'fr')} title={tr('English', 'Français')} onClick={() => setLang(tr('en', 'fr'))}>
          {tr('EN', 'FR')}
        </button>
      </div>
    </nav>
  );
}
