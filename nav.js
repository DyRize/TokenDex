// Shared top menu for TokenDex. Included right after <body> on every page.
(() => {
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
  const here = decodeURIComponent(location.pathname.split('/').pop()) || 'index.html';
  const style = document.createElement('style');
  style.textContent = `
.ptb-nav{position:sticky; top:0; z-index:40; backdrop-filter:saturate(1.6) blur(14px); -webkit-backdrop-filter:saturate(1.6) blur(14px);
  background:color-mix(in srgb, var(--ground) 78%, transparent); border-bottom:1px solid var(--line-soft);}
.ptb-nav .in{max-width:1000px; margin:0 auto; padding:8px 16px; display:flex; align-items:center; gap:16px;}
.ptb-nav .brand{display:inline-flex; align-items:center; gap:8px; font:800 15px var(--f-round); color:var(--ink); text-decoration:none; white-space:nowrap;}
.ptb-nav .brand::before{content:""; width:18px; height:18px; background:var(--brand); -webkit-mask:var(--ball) center/contain no-repeat; mask:var(--ball) center/contain no-repeat;}
.ptb-nav .tabs{display:flex; gap:2px; background:var(--surface-2); border:1px solid var(--line); border-radius:11px; padding:3px; margin-left:auto; overflow-x:auto; scrollbar-width:none;}
.ptb-nav .tabs a{font:600 13.5px var(--f-ui); color:var(--ink-2); text-decoration:none; padding:5px 14px; border-radius:8px; white-space:nowrap;}
.ptb-nav .tabs a:hover{color:var(--ink);}
.ptb-nav .tabs a[aria-current]{background:var(--surface); color:var(--ink); box-shadow:0 1px 2px rgba(0,0,0,.18);}
.ptb-nav .tabs a:focus-visible{outline:2px solid var(--s3); outline-offset:1px;}
.ptb-nav .lang{flex:none; font:700 12px var(--f-ui); color:var(--ink-2); background:none; border:1px solid var(--line); border-radius:8px; padding:5px 8px; cursor:pointer;}
.ptb-nav .lang:hover{color:var(--ink);}
.ptb-nav .lang:focus-visible{outline:2px solid var(--s3); outline-offset:1px;}
@media (max-width:560px){ .ptb-nav .brand span{display:none} .ptb-nav .tabs{flex:1} .ptb-nav .tabs a{padding:5px 10px;} }
`;
  document.head.appendChild(style);
  const nav = document.createElement('nav');
  nav.className = 'ptb-nav';
  nav.setAttribute('aria-label', 'TokenDex');
  nav.innerHTML = `<div class="in"><a class="brand" href="index.html"><span>TokenDex</span></a><div class="tabs">`
    + PAGES.map(([href, label]) => `<a href="${href}"${href === here ? ' aria-current="page"' : ''}>${label}</a>`).join('')
    + `</div><button type="button" class="lang" lang="${tr('en', 'fr')}" title="${tr('English', 'Français')}">${tr('EN', 'FR')}</button></div>`;
  nav.querySelector('.lang').addEventListener('click', () => setLang(tr('en', 'fr')));
  document.body.prepend(nav);
})();
