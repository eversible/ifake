# Music apps (ifake)

Two personal web apps, hosted on GitHub Pages:

- [`lead-sheet/`](lead-sheet/): a small MuseScore-like editor with a melody layer and a chord layer, plus a split view with a full-width piano for foldables.
- [`chord-pad/`](chord-pad/): an iReal Pro-style chord chart player.

Each app is self-contained (its own `README.md`, `DECISIONS.md`, `TODO.md`, tests and samples). The root `index.html` just links to both.

## Updating

1. Change the app's files.
2. Run `python3 <app>/tools/stamp.py`. It versions every CSS/JS URL in `index.html` and refreshes the offline file list in `sw.js`, so phones pick up the new build on the next launch.
3. Commit and push to `main`. GitHub Pages redeploys within a minute or two.

On iPhone, a Home Screen app that's still open in the background keeps the old build until it's reopened: swipe it away in the app switcher, then launch it again.

## Data

Songs are saved in the browser (localStorage) on each device and each site. The claude.ai copy syncs through the claude.ai account, but this hosted copy does not. To move songs between them, use Export / Import in the songs menu.

## Licences

The code is for personal use. Bundled third-party material:

- VexFlow 4.2.5 (MIT), in `lead-sheet/lib/`.
- Grand piano: Salamander Grand Piano V3 (Alexander Holm, CC-BY 3.0).
- Other instruments: rendered from GeneralUser GS v1.471 (S. Christian Collins).

The full credits are in each app's README.
