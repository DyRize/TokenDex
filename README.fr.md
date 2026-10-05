# TokenDex

[English](README.md) · **Français**

Des pages web autour de ta sauvegarde [PokeTokenBar](https://github.com/chattymin/PokeTokenBar) :

- **Pokédex** (accueil) : les 649 espèces, en silhouette tant que tu ne les as pas, avec un « Quel est ce Pokémon ? » à chaque nouvelle capture.
- **En cours** : ton Pokémon actuel, et l'heure estimée de sa prochaine évolution et de sa graduation d'après ton rythme habituel.
- **Journal** : toutes tes graduations, jour par jour, avec le temps et les tokens qu'a demandés chacune.
- **Carte** : ta carte de dresseur (avatar, contour, équipe de six au dos) à copier ou partager en image.
- **Boutique** : quoi acheter avec ton solde, et quand donner tes bonbons sans en perdre.
- **Prochains** : les chances de chaque ligne au prochain œuf.
- **Chance** : si tu as eu de la chance ou pas sur tes tirages.
- **Chrono** : le temps qu'il te reste pour compléter le Pokédex, en partant de ta collection et à ton rythme réel, avec les dates de tes prochains paliers.

Il faut un Mac avec PokeTokenBar installé, et une connexion internet la première fois qu'un sprite s'affiche.

L'interface existe en français et en anglais : bouton FR/EN dans le menu, sinon c'est la langue du navigateur qui décide.

## Lancer le serveur

Avec [Homebrew](https://brew.sh), déjà là si tu as installé PokeTokenBar avec :

```sh
brew install DyRize/tap/tokendex
tokendex
```

`tokendex` sert les pages sur http://127.0.0.1:8649 et les ouvre dans ton navigateur. `Ctrl+C` arrête le serveur. Rien ne démarre tout seul, pas même à l'ouverture de session.

Pour le garder en fond sans terminal, jusqu'à ce que tu l'arrêtes ou que tu redémarres le Mac :

```sh
brew services run tokendex    # tokendex ne fait alors plus qu'ouvrir la page
brew services stop tokendex
```

`brew upgrade tokendex` installe une nouvelle version ; s'il tourne en fond, fais `stop` puis `run` à nouveau.

Tant qu'il tourne, il relit la sauvegarde de l'app à chaque ouverture de page : pas d'export à faire, tout est à jour quand tu recharges.

Un bug, une idée ? La bulle dans le menu ouvre [une issue](https://github.com/DyRize/TokenDex/issues/new/choose), dans la langue que tu veux.

## Développement

Les pages sont en Preact + TypeScript, construites par Vite : une entrée HTML par page à la racine, le code dans `src/pages/<page>/`, le reste partagé dans `src/lib` et `src/components`.

Pour le lancer depuis les sources, il faut Node (`brew install node`). Dans le dossier :

```sh
npm install && npm run build
python3 serve.py --open
```

Après un `git pull`, relance `npm install && npm run build`. Si macOS propose d'installer les outils de développement, accepte : c'est ce qui fournit Python.

`npm run dev` sert les pages sur http://127.0.0.1:5173 et les recharge à chaque modification. Laisse `serve.py` tourner à côté : c'est lui qui fournit la sauvegarde et l'historique, le serveur de dev les lui demande. `npm run typecheck` vérifie les types, `npm run build` refait `dist/`.

Pour développer, il faut Node 24 (`nvm use` le prend dans `.nvmrc`) : `npm test` lance les tests (Vitest, puis ceux de `serve.py`), `npm run lint` le lint (Oxlint, avec les règles qui ont besoin des types via tsgo). Pour seulement lancer l'app, Node 20.19 suffit.

La version est dans `package.json` ; tant qu'elle porte un suffixe (`0.1.0-alpha.1`), le menu affiche un badge « alpha ».

## Ce que le serveur lit

Il n'écoute que sur ta machine (`127.0.0.1`), ne répond qu'aux adresses `127.0.0.1:8649` et `localhost:8649` (un site web ne peut donc pas passer par lui pour lire tes données), et ne fait que lire : il n'écrit jamais dans les fichiers de l'app ni dans ceux de tes outils.

- `~/Library/Application Support/PokeTokenBar/companion-state.json` : ta sauvegarde.
- Ton historique de tokens, là où l'app le prend : ses propres caches dans ce même dossier (Claude Code, Codex, Gemini, Grok, Pi, OMP, et l'usage de Cursor par son API), et les fichiers locaux d'Antigravity, OpenCode, Hermes, Cursor, Copilot, Kiro et Aside, à leurs emplacements par défaut et dans les dossiers ajoutés dans les réglages de l'app. Il n'en garde que le total par heure : ni prompts, ni projets, ni noms de modèles. Si un outil que l'app compte n'est pas lisible, les pages le signalent.
- Dans les réglages de l'app : les curseurs Croissance et Boutique et ces dossiers ajoutés, rien d'autre.

Aucune de tes données ne quitte ton Mac. Le serveur télécharge les sprites de Pokémon depuis GitHub (PokeAPI) et ceux des dresseurs de la page Carte depuis Pokémon Showdown, une seule fois : il les garde en cache dans `~/Library/Caches/TokenDex`.
