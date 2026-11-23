# Chord Pad

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
