---
name: sample-save
description: Opens a TokenDex page in agent-browser on a made-up save from samples/. Use when checking a change in the running app, or taking a screenshot for a PR.
---

Run the dev server (`npm run dev`, http://127.0.0.1:5173) and `serve.py` first: the page still takes its sprites and history from `serve.py`, while the script routes `save.json` to the sample and `egg-purchases.json` to `samples/<sample>.purchases.json` (none if missing), so neither the real save nor the app's log reaches the page or a screenshot.

```sh
.claude/skills/sample-save/open.sh <page> <sample> [fr|en] ['{"<localStorage key>": <value>}']
agent-browser wait <a selector the page draws from the save>
```

`<page>` is the HTML file without `.html` (`index`, `journal`, `carte`…), `<sample>` a file of `samples/` without `.json`. The script clears localStorage, then sets the language and each given entry, stored as JSON. Run it again before each check: the route lives as long as the browser, and agent-browser can relaunch the browser between two commands.

Read what the page shows with `eval`, one command per call, so the JavaScript keeps its quotes (`batch` splits on them):

```sh
agent-browser eval "JSON.stringify([...document.querySelectorAll('.tbar .tslot')].map(s => s.textContent))"
```

Open a `<details>` with `eval "document.querySelector('.cardset').open = true"`: a click on its `summary` does not always take.
