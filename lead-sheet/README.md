# iFake Pro (formerly Lead Sheet)

A small MuseScore-style lead-sheet editor for iPhone, iPad and Mac. It has two layers on one staff: the **melody**
(notes, rests, dots, tuplets and ties) and the **chords** (Chord Pad's chord engine), with repeats and endings. You can
play back any bar range on a loop, with a melody instrument, comping and a bass line.

Chord Pad (`../chord-pad`) remains a separate app. This app reuses Chord Pad's engine files unchanged.

## Files
- `index.html`, `css/app.css`: the page (the CSS is Chord Pad's, plus the score and editor styles)
- `js/melody.js`: the melody model. Ticks (10080 per quarter), MuseScore-style note entry that keeps every bar full,
  tuplets, ties, spelling in the key, and a text format
- `js/song.js`: the song (bars = chords + melody, key, time, pickup, repeats), play order, and text import/export
- `js/grid.js`: the even chord grid (chord charts, and the Chords tab's Even view)
- `js/recognise.js`: names a chord from piano notes (inversions → slash chords)
- `js/score.js`: score rendering with VexFlow (line breaking, beaming, tuplets, ties, voltas, chord symbols) and hit-testing
- `js/app.js`: the UI (layers, panels, piano strip, score gestures, transport, settings, songs)
- `js/demo.js`: the test chart (see below)
- `js/chords.js`, `voicing.js`, `audio.js`, `store.js`, `form.js`: shared with Chord Pad, kept identical
- `lib/vexflow.js`: VexFlow 4.2.5 (MIT, see `lib/VEXFLOW-LICENSE`)
- `samples/`: 25 instruments as base64 MP3 JSON (Chord Pad's 19, plus alto/tenor sax, trumpet, flute, clarinet and violin)
- `sw.js`, `manifest.webmanifest`, `icons/`: offline and Home Screen support for a GitHub Pages build
- `tests/`: model tests (`node tests/melody.mjs`, `node tests/song.mjs`) and the browser test scripts

## Test chart
"Stella changes · test melody" uses the standard chord changes of *Stella by Starlight* (Victor Young) in B♭: a pickup,
then bars 1–30, a 1st ending and a 2nd ending. The melody is **not** the song's melody. It is an original test line
written to exercise every rhythm feature: whole notes to 64ths, every rest, dots and double dots, 8th and quarter
triplets, 5-, 6- and 7-tuplets, ties within and across bar lines, and naturals, sharps and flats. Add it again from
Songs → "Add test chart".

## Text format (⌨ and Songs → Export/Import)
```
Title: My tune
Key: Bb
Time: 4/4
Pickup: 1
Tempo: 132
Chords:
| . | { Eø7 . . . | A7(♭9) . . . | N1 C-7 . . . }x2 N2 F7 . . . |
Melody:
4:F4 | 4.:G4 8:Bb4 3[8:D5 8:E5 8:G5] 4:Bb5~ | 8:Bb5 8:A5 2.:G5 | 1:r | 1:C5 |
```
- Durations: `1` `2` `4` `8` `16` `32` `64`, with `.` or `..` for dots. `r` is a rest.
- Pitches: letter + accidental (`b`, `#`, `bb`, `##`) + octave, and always absolute: `Bb4` is B♭ and `E5` is E natural in
  any key (`En5` is also accepted). The key signature only affects how notes are drawn and spelled.
- `~` ties to the next note. `3[ … ]` is a triplet; `5[ … ]`, `6[ … ]` and `7[ … ]` work the same way.
- Chords: one cell per beat, with `.` to hold. `{` `}` `}x3` `N1`–`N3` mark repeats. Chord Pad exports can be pasted in
  directly.
- Divided beats: `[C F]` splits a beat in two, `[C D E]` is an 8th-note triplet, `[C . F .]` is four 16ths, and `2[C D E]`
  is a quarter-note triplet over two beats. (Chord Pad can't read these.)

## Songs from GitHub
`songs/*.txt` (the Export text format) appear in the song list, tagged GitHub, the next time the app opens or comes
back to the front. See `songs/README.md` for how updates, local edits and deletions are handled.
`tools/stamp.py` writes `songs/index.json`.

## Publishing an update
Run `python3 tools/stamp.py` first. It adds `?v=<content hash>` to every script and stylesheet URL in
`index.html`, plus an import map for the modules, so phones always load the changed files instead of a cached copy.
It also refreshes `BUILD` and the offline file list in `sw.js`. The same app is hosted on GitHub Pages from the
`ifake` repo (eversible.github.io/ifake) (see the README there).

## Run locally
Run any static server, for example `python3 -m http.server` in this folder, then open http://localhost:8000.

## Credits
- Notation: VexFlow 4.2.5 (MIT)
- Grand piano: Salamander Grand Piano V3 (Alexander Holm, CC-BY 3.0), via `@audio-samples/piano-mp3-velocity8`
- Nylon guitar, harp: tonejs-instruments (Nicholaus Brosowsky; MIT package)
- Other instruments, including the melody instruments: rendered from GeneralUser GS v1.471 by S. Christian Collins (free
  to use; see its licence)
