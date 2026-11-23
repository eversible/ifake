# Lead Sheet: TODO

## ⭐ Important
- [ ] **Full backing band** (shared with Chord Pad): drums plus styles such as swing, bossa and ballad.

## Needs Mez
- [ ] Publish as a claude.ai artifact (built and tested locally; waiting for the go-ahead).
- [ ] Try it on a real iPhone: audio unlock, silent switch, piano-strip latency, tap accuracy on small notes, landscape.

## iPhone Duo (split layout — draft)
- [x] Laptop pose: chart on the upright half, big piano + keys on the flat half (auto from the Viewport Segments API,
      or Settings → Split On). Piano builds chords: lowest note = root, name written into the selected slot.
- [ ] Try on a real Duo: inside the Claude app (Split → On), and in Safari with the Device Posture / Viewport Segments flags.
- [ ] Book pose (side-by-side halves): chart left, keys right, aligned to the fold.
- [ ] Piano during playback: follow the playing chord more prominently; sustain pedal; velocity by touch position.

## Notation
- [ ] Time-signature and key changes mid-song.
- [ ] Rehearsal marks (A, B), segno/coda, D.C./D.S. al Fine.
- [ ] Grace notes, articulations (staccato, accent), fermatas, dynamics.
- [ ] Lyrics line.
- [x] Chord symbols at sub-beat positions: beats split in 2/3/4 and quarter-note triplets (done).
- [ ] Bass clef, and transposing views (B♭, E♭ instruments).
- [ ] A second voice in the same staff.
- [ ] Slurs (as distinct from ties).

## Editing
- [ ] Copy/paste of a range of notes (not only whole bars).
- [ ] Drag a note up or down to change its pitch.
- [ ] Insert mode as an option (shift later notes rather than overwrite).
- [ ] Input by playing or singing (MIDI keyboard via Web MIDI; pitch detection).

## Import / export
- [ ] MusicXML export and import (MuseScore, Sibelius, iReal Pro).
- [ ] MIDI file export.
- [ ] Print / PDF layout (page size, title block).

## Housekeeping
- [ ] Shared engine files with Chord Pad (`chords.js`, `voicing.js`, `audio.js`, `store.js`, `form.js`): move both
      apps into one repo with a shared folder when going to GitHub Pages. (`audio.js` now also plays chord changes
      inside a beat; Chord Pad has the same file but its live copy predates this, with no difference in behaviour.)
