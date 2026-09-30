# TokenDex

Des pages web autour de ta sauvegarde [PokeTokenBar](https://github.com/chattymin/PokeTokenBar) :

- **Pokédex** (accueil) : les 649 espèces, en silhouette tant que tu ne les as pas, avec un « Quel est ce Pokémon ? » à chaque nouvelle capture.
- **En cours** : ton Pokémon actuel, et l'heure estimée de sa prochaine évolution et de sa graduation d'après ton rythme habituel.
- **Journal** : toutes tes graduations, jour par jour, avec le temps et les tokens qu'a demandés chacune.
- **Carte** : ta carte de dresseur (avatar, contour, équipe de six au dos) à copier ou partager en image.
- **Boutique** : quoi acheter avec ton solde, et quand donner tes bonbons sans en perdre.
- **Prochains** : les chances de chaque ligne au prochain œuf.
- **Chance** : si tu as eu de la chance ou pas sur tes tirages.
- **Chrono** : le temps qu'il te reste pour compléter le Pokédex, en partant de ta collection et à ton rythme réel, avec les dates de tes prochains paliers.

Il faut un Mac avec PokeTokenBar installé, et une connexion internet pour les sprites.

L'interface existe en français et en anglais : bouton FR/EN dans le menu, sinon c'est la langue du navigateur qui décide.

## Lancer le serveur (recommandé)

Double-clique sur `Lancer.command` : une fenêtre Terminal démarre le serveur et ouvre le Pokédex dans ton navigateur. Ferme la fenêtre (ou `Ctrl+C`) pour l'arrêter. Rien ne s'installe et rien ne démarre tout seul.

Tant qu'il tourne, il relit la sauvegarde de l'app à chaque ouverture de page : pas d'export à faire, tout est à jour quand tu recharges.

Au premier double-clic, macOS bloque le fichier parce qu'il vient d'internet. Va dans Réglages Système > Confidentialité et sécurité, clique sur « Ouvrir quand même » en bas, puis relance-le. Si macOS propose d'installer les outils de développement, accepte : c'est ce qui fournit Python.

Depuis un terminal, c'est pareil avec `python3 serve.py` dans le dossier, puis http://127.0.0.1:8649.

## Sans serveur

Ouvre `index.html` directement dans le navigateur. Dans PokeTokenBar, fais Réglages > Exporter la sauvegarde, puis glisse le fichier sur la page d'accueil. Toutes les pages s'en servent ensuite, mais il faut refaire l'export pour voir tes nouvelles captures. Sans serveur, pas d'heure estimée sur En cours ni de tokens dans le Journal : ils viennent de l'historique de l'app, que seul le serveur lit.

## Ce que le serveur lit

Il n'écoute que sur ta machine (`127.0.0.1`), ne répond qu'aux adresses `127.0.0.1:8649` et `localhost:8649` (un site web ne peut donc pas passer par lui pour lire tes données), et ne fait que lire : il n'écrit jamais dans les fichiers de l'app :

- `~/Library/Application Support/PokeTokenBar/companion-state.json` : ta sauvegarde.
- `~/Library/Application Support/PokeTokenBar/usage-cache.json` : l'historique de tokens, dont il ne garde que le total par heure (ni prompts, ni projets).
- Les curseurs Croissance et Boutique des réglages de l'app, rien d'autre.

Aucune de tes données ne quitte ton Mac. Le navigateur télécharge les sprites de Pokémon depuis GitHub (PokeAPI), et le serveur ceux des dresseurs de la page Carte depuis Pokémon Showdown, qu'il garde en cache dans `~/Library/Caches/TokenDex`.
