# Chord Pad — TODO

## ⭐ Important
- [ ] **Full backing band** — drums plus genre styles (swing, bossa, ballad, funk, Latin), like iReal Pro's styles.
      Plan: GM drum kit rendered from GeneralUser GS (bank 128) into a sample pack; a style = comp pattern + bass pattern
      + drum pattern + default tempo/swing; style picker on the top bar; per-part mixer (mute/volume per instrument).

## From the UI review (proposed, not yet chosen) — mockups in the review folder
- [ ] Two-tier chord symbols for crowded cells (root/quality over extensions) + faint beat ticks.
- [ ] Paged keyboard (Chord / Extensions / Edit), 8 columns with bigger keys, fixed bottom row.
- [ ] Typing mode: symbol row (♭ ♯ – Δ ø o + 7 | %) above the iOS keyboard; blue preview of typed chords in the grid.
- [ ] "Loop this bar" key.

## Needs a real iPhone to confirm
- [ ] Audio unlock timing, silent switch (`audioSession`), interrupted audio after a phone call, iOS keyboard behaviour,
      Home Screen safe areas, real output latency, memory with several instruments.

## Next
- [ ] Move to GitHub Pages (Home Screen app, offline). `sw.js` and `manifest.webmanifest` are ready and switch on there.
- [x] Repeats `{ }` with play counts, 1st/2nd/3rd endings (done, round 4).
- [ ] Chart symbols: rehearsal marks (A, B), time-signature changes, segno/coda/D.C./Fine.
- [ ] Practice mode from the Julia project: hide the chord tones and reveal them on tap / quiz on chord spellings.
- [ ] Practice automation: tempo ramp each loop, auto-transpose each loop (round the cycle of fifths).
- [ ] Rootless (A/B) jazz voicings; drop-2; voicing range control.
- [ ] Velocity layers for the grand piano (velocity 4/8/12 packs exist on npm).
- [ ] Export: MIDI file of the backing; iReal Pro URL import/export.
- [ ] Chord-symbol display option: iReal style (`^7`, `h7`, `7b9`) vs this notation.
- [ ] Key-aware spelling when transposing (sharps in sharp keys).

## Sister app
- The melody editor lives in a separate app, `../ifake-pro/` (iFake Pro). It reuses `chords.js`, `voicing.js`, `audio.js`,
  `store.js` and `form.js`; fixes to those files should be copied across (or both apps moved into one repo with a shared folder).
