# TokenDex

**English** · [Français](README.fr.md)

Web pages around your [PokeTokenBar](https://github.com/chattymin/PokeTokenBar) save:

- **Pokédex** (home): all 649 species, as silhouettes until you have them, with a "Who's that Pokémon?" for every new catch.
- **Growing**: your current Pokémon, and when it should next evolve and graduate at your usual pace.
- **Journal**: every graduation, day by day, with the time and tokens each one took.
- **Card**: your trainer card (avatar, frame, team of six on the back) to copy or share as an image.
- **Shop**: what to buy with your balance, and when to give your candies without wasting any.
- **Next**: each line's odds for the next egg.
- **Luck**: whether your draws were lucky or not.
- **Chrono**: how long until your Pokédex is complete, from your collection and at your real pace, with the dates of your next milestones.

You need a Mac with PokeTokenBar installed, and an internet connection the first time each sprite shows up.

The interface is in English and French: FR/EN button in the menu, otherwise your browser's language decides.

## Run the server

With [Homebrew](https://brew.sh), already there if you installed PokeTokenBar with it:

```sh
brew install DyRize/tap/tokendex
tokendex
```

`tokendex` serves the pages on http://127.0.0.1:8649 and opens them in your browser. `Ctrl+C` stops the server. Nothing starts on its own, not even at login.

To keep it running in the background without a terminal, until you stop it or restart your Mac:

```sh
brew services run tokendex    # tokendex then only opens the page
brew services stop tokendex
```

`brew upgrade tokendex` installs a new version; if it runs in the background, `stop` it and `run` it again.

While it runs, it reads the app's save again every time a page opens: no export needed, reload and you're up to date.

A bug, an idea? The speech bubble in the menu opens [an issue](https://github.com/DyRize/TokenDex/issues/new/choose), in any language.

## Development

The pages are Preact + TypeScript, built by Vite: one HTML entry per page at the root, each page's code in `src/pages/<page>/`, the shared parts in `src/lib` and `src/components`.

To run it from the sources, you need Node (`brew install node`). In the folder:

```sh
npm install && npm run build
python3 serve.py --open
```

After a `git pull`, run `npm install && npm run build` again. If macOS offers to install the developer tools, accept: that's what provides Python.

`npm run dev` serves the pages on http://127.0.0.1:5173 and reloads them on every change. Keep `serve.py` running alongside: it provides the save and the history, and the dev server asks it for them. `npm run typecheck` checks the types, `npm run build` rebuilds `dist/`.

Development needs Node 24 (`nvm use` picks it from `.nvmrc`): `npm test` runs the tests (Vitest, then the `serve.py` tests), `npm run lint` the linter (Oxlint, with the rules that need types through tsgo). To only run the app, Node 20.19 is enough.

The version lives in `package.json`; while it carries a suffix (`0.1.0-alpha.1`), the menu shows an "alpha" badge.

## What the server reads

It only listens on your machine (`127.0.0.1`), only answers to `127.0.0.1:8649` and `localhost:8649` (so a website can't go through it to read your data), and only reads: it never writes to the files of the app or of your tools.

- `~/Library/Application Support/PokeTokenBar/companion-state.json`: your save.
- Your token history, wherever the app gets it: its own caches in that same folder (Claude Code, Codex, Gemini, Grok, Pi, OMP, and Cursor's API usage), and the local files of Antigravity, OpenCode, Hermes, Cursor, Copilot, Kiro and Aside, in their default locations and in the folders added in the app's settings. It only keeps the total per hour: no prompts, no projects, no model names. If a tool the app counts can't be read, the pages say so.
- From the app's settings: the Growth and Shop sliders and those added folders, nothing else.

None of your data leaves your Mac. The server downloads the Pokémon sprites from GitHub (PokeAPI) and the trainer sprites of the Card page from Pokémon Showdown, once: it keeps them cached in `~/Library/Caches/TokenDex`.
