# iFake

Two personal web apps, hosted on GitHub Pages:

- **iFake** (this folder): an iReal Pro-style chord chart player. https://eversible.github.io/ifake/
- **iFake Pro** ([`pro/`](pro/)): a small MuseScore-like editor with a melody layer and a chord layer, plus a split
  view with a full-width piano for foldables. https://eversible.github.io/ifake/pro/

The old addresses (`lead-sheet/`, `chord-pad/`) redirect to these.

## Updating

1. Change the app's files.
2. Run `python3 tools/stamp.py` (iFake) or `python3 pro/tools/stamp.py` (iFake Pro). It versions every CSS/JS URL in `index.html` and refreshes the offline file list in `sw.js`, so phones pick up the new build on the next launch.
3. Commit and push to `main`. GitHub Pages redeploys within a minute or two.

On iPhone, a Home Screen app that's still open in the background keeps the old build until it's reopened: swipe it away in the app switcher, then launch it again.

## Data

Songs are saved in the browser (localStorage) on each device and each site. The claude.ai copy syncs through the claude.ai account, but this hosted copy does not. To move songs between them, use Export / Import in the songs menu.

## Licences

The code is for personal use. Bundled third-party material:

- VexFlow 4.2.5 (MIT), in `pro/lib/`.
- Grand piano: Salamander Grand Piano V3 (Alexander Holm, CC-BY 3.0).
- Other instruments: rendered from GeneralUser GS v1.471 (S. Christian Collins).

The full credits are in each app's README.

---

# iFake (the chord app)

A chord-chart sketchpad for iPhone, iPad and Mac: type or tap chords into an iReal Pro-style grid, hear them instantly,
and loop any section while you change it. Chord spelling comes from a JavaScript port of the Julia
*Chord Memorisation* engine.

## Files
- `index.html`, `css/app.css` — the page
- `js/chords.js` — chord engine (parse, spell, edit, transpose)
- `js/voicing.js` — voicings (smooth, close, spread, shell)
- `js/audio.js` — synths, sampler, rhythm/bass patterns, look-ahead sequencer
- `js/form.js` — repeats and endings → play order
- `js/store.js` — saving (browser + optional claude.ai account store)
- `js/app.js` — UI
- `samples/` — one JSON file per instrument (base64 MP3 samples) + `index.json`
- `sw.js`, `manifest.webmanifest`, `icons/` — offline/Home Screen support for the GitHub Pages build
- `tests/` — engine tests (Julia oracle comparison, unit tests)

## Publishing an update
Run `python3 tools/stamp.py` first. It versions the script and stylesheet URLs in `index.html` (with an import map
for the modules) and refreshes `BUILD` and the offline file list in `sw.js`, so phones load the new files at once.

## Run locally
Any static server, e.g. `python3 -m http.server` in this folder, then open http://localhost:8000.

## Sample credits
- Grand piano: Salamander Grand Piano V3 (Alexander Holm, CC-BY 3.0), via `@audio-samples/piano-mp3-velocity8`
- Nylon guitar, harp: tonejs-instruments (Nicholaus Brosowsky; MIT package), via npm
- Other instruments: rendered from GeneralUser GS v1.471 by S. Christian Collins (free to use, see its licence)
