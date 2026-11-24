# Lead Sheet: design decisions

Decisions made with Mez (10 Nov 2026) are marked **[agreed]**. Everything else was decided during the build, mostly
while Mez was away. Each of those rows lists the alternatives so it can be revisited.

## Agreed
- **[agreed]** A new, separate app. Chord Pad stays a standalone app; Lead Sheet reuses its engine files.
- **[agreed]** Two layers, a chord layer and a melody layer, shown together on one staff. Repeats and endings work on
  both.
- **[agreed]** Minimal, but expressive enough for any rhythm, rest or note.
- **[agreed]** Note entry by choosing a duration and then tapping a piano strip (MuseScore style).
- **[agreed]** Chords view looks like Chord Pad: the melody fades to grey and the chords become Chord Pad cells laid
  over the staff (one cell per beat; selection, loop range and playhead shown on the cells).
- **[agreed]** Chord changes finer than a beat, including triplets, without cluttering the UI.
- **[agreed]** Test chart: the Stella by Starlight changes in B♭, with an *original* test melody (not the real tune,
  which is copyrighted).

## Build-time calls (revisit freely)
| Topic | Chosen | Alternatives considered |
|---|---|---|
| Notation engine | VexFlow 4.2.5 (MIT, ~1 MB, vendored so it works offline and on claude.ai) | Hand-drawn SVG; abcjs; OpenSheetMusicDisplay (much heavier) |
| Music font | Gonville (VexFlow's original). Bravura's tall down-stem flag runs up into the notehead at phone size | Bravura with longer stems; Petaluma; Leland |
| Beams | Every beamed group shares one stem direction (from the group's average pitch). A beamed tuplet's number goes on the beam side, which keeps it clear of the chord symbols | Each note choosing its own stem (broke steep runs) |
| Time model | Integer ticks, 10080 per quarter (divisible by 3, 5, 7, 9, 64 and so on), so tuplets never round | Fractions; floats |
| Entry model | MuseScore-style overwrite: every bar is always full (rests fill the gaps), and a new note overwrites whatever is under the cursor. Leftover time becomes rests aligned to the beat grid | Insert mode that shifts later notes along |
| Retiming | Tap a note, then a duration or the dot key: the note changes length in place (overwriting what follows, or leaving rests) | A separate "edit" mode |
| Dots | The dot key cycles none → dotted → double-dotted | Two separate keys |
| Tuplets | One Tuplet key cycles 3 → 5 → 6 → 7 → off. Ratios are 3:2, 5:4, 6:4 and 7:4 of the chosen duration; the next notes fill the group. Overwriting part of a tuplet removes the whole group | A tuplet dialog with any n:m (`5:4[…]` style ratios can still be typed) |
| Ties | Tie toggles the tie to the next note when it has the same pitch; otherwise it adds a tied note of the current duration. Ties across bar lines work, and a tie is drawn as two halves when it crosses a line break | Ties only within a bar |
| Long notes across beats | Shown as written (a half note on beat 2 stays a half note); only rests and bar-line splits are broken up by the beat grid | Always split at the half-bar |
| Spelling | Piano strip and ↑/↓ spell notes in the key; chromatic notes use ♯ going up and ♭ going down; ♭ ♮ ♯ set the accidental; ⇄ respells enharmonically | Always sharps |
| Text format | Pitches are absolute (`E5` is E natural in any key) so copy/paste between keys can't change notes | Key-relative letters like MuseScore's input |
| Chords in the score | Chord symbols are drawn above the staff where they start (a beat, or a slot of a divided beat). Tap the chord row to switch to the Chords layer | — |
| Chord layer | Same keys and rules as Chord Pad (including the implied 7) | Text-only chords |
| Line breaking | Bars are packed by their natural width (dense bars get more room); a fixed bars-per-line setting is also available. The staff is scaled to 0.72 on phones (0.85 on small tablets) | Fixed 4 bars per line (too cramped for 32nds and tuplets on a phone) |
| Beaming | Custom beaming per beat (and per tuplet group), so 32nds and 64ths beam correctly in 4/4 and 3/4 | VexFlow's automatic beaming (missed some 32nds) |
| Pickup | Optional pickup bar (bar 0) of 1 to (beats − 1) beats; bar numbers start after it | A partial first bar with no numbering change |
| Bar tools | `+bar` adds an empty bar **after** the selection (handy at the end of a song); `−bar`, `Dup`, `%`, Copy/Paste act on the selected bars; repeat marks shift with them | Insert before (as in Chord Pad) |
| Key and transpose | Key ♭/♯ changes only the signature (notes keep their pitch); −½/+½ transposes notes and chords and moves the key | One combined control |
| Selection and loop | As in Chord Pad: sideways drag (or hold, then drag) over the score selects bars to loop; ✕ clears it; the loop chip loops the whole song by default | Separate loop editor |
| Playback | Melody, chords and bass have their own instruments and volumes; swing applies to the melody too; repeats and endings are unrolled for both layers | Chords only |
| Melody instruments | Six new melody samples (alto and tenor sax, trumpet, flute, clarinet, violin; C3 to C7, every minor third), plus every Chord Pad instrument | Synth lead only |
| Hardware keyboard | MuseScore keys: 1–7 durations (64th to whole), A–G notes (nearest octave), 0 rest, `.` dot, `+` tie, ↑/↓ semitone, ⇧↑/⇧↓ octave, ←/→ move, ⌫ delete, Enter types, Space plays, ⌘Z/⇧⌘Z undo/redo | No hardware keys |
| Saving | Same store as Chord Pad (browser, plus the per-person claude.ai store) under its own key, `leadsheet.v1` | Shared library with Chord Pad |
| Chord cells over the staff | Each beat's cell starts just before that beat's first note, so cells line up with the melody (widths vary like the note spacing). A symbol runs on over the empty cells after it, up to two bars on the same line, then shrinks or hides its extensions behind "…" | Equal-width cells like Chord Pad (wouldn't line up with the notes) |
| Endings and bar numbers | Drawn by the app rather than VexFlow, so the chords view can hide the faded copies and show its own | VexFlow's built-in voltas |
| Chord subdivisions | Per beat: whole beat, split in 2, 8th-note triplet, split in 4, or a quarter-note triplet over this beat and the next. Chosen from one slim row of rhythm pictures at the top of the Chords panel (it shows the selected beat's division). The panel stays the Melody panel's height | Free positions at any tick; snapping chords to melody notes (MuseScore) |
| Changing a division | Chords keep their place when it still exists, otherwise move to the nearest free slot in that beat; any left over are dropped with a short notice (undo brings them back). After a split, the slot after the beat is selected, ready for the next chord | Ask before dropping |
| Room for divided beats | Bars with a divided beat get an invisible voice of ghost notes, one per slot and at least 34 px wide (unscaled), so every slot has room for a symbol even under a long note. Bars with no divided beat lay out as before | Equal-width cells (wouldn't line up with the melody) |
| Playing divided beats | Chord changes inside a beat are struck at their exact time (triplets included), cutting the previous chord; the comping pattern rests for the rest of that beat and carries on from the next beat with the new chord | Quantising to 16ths |
| Melody triplets | Already there (Tuplet key, now drawn as a triplet picture when off; tap again for 5, 6 or 7) | A separate triplet key |
| iPhone Duo split | Laptop pose (two stacked viewport segments): the chart alone on the upright half; on the flat half, from the fold down: control row, tabs, keys, and the piano along the bottom edge. Inside the Claude app (which hides the fold and the screen size from the page) the line allows for the app's 82 pt bar; Settings → Align with the fold fine-tunes it. Auto from the Viewport Segments API, or Settings → Split On/Off | Book pose first; piano filling the whole flat half |
| Big piano modes | **Draft** (default): a sketchpad — nothing goes into the song unless you tap **Write** (Chords tab: into the selected slot). **Latch** (on by default): keys stay down until tapped again, each toggle plays what's down, ▶ replays, Clear releases all; Latch off: keys sound while held, several at once, slide to glide. **Edit**, Chords tab: latched keys tied to the selected slot (its chord loads; unwritten keys stay when you move), ▶ / Clear / **Write**. **Edit**, Melody tab: taps enter notes. In both modes the chord is named live (lowest note = root) | Writing on every tap (first draft); tapping the chord name to write |
| Naming chords from the piano | Any voicing: order, octaves and doubled notes don't matter. Every note is tried as the root; root position wins (C E G A = C6, A C E G = A-7), then the more common type. A lowest note that isn't the root makes a slash chord (E A C = A-/E), its bass spelled as the chord spells it. A 7th chord may leave out its 5th; a triad or 6 chord may not (C E A = A-/C). Slash chords show on the keys with the bass lowest | Lowest note always the root |
| Even chord grid | A Chord Pad-style grid: equal bars, equal beats, divided beats split evenly, melody hidden. Turned on with **Even** in the header (Chords tab); always used for chord charts. Same cells, taps, loop and playhead as the chords-over-score view | Spacing the melody evenly too (16ths and 32nds would collide) |
| Chord charts | A song can be a chord chart (Songs → New chord chart, or Settings → Chord chart): no Melody tab, no melody playback, exported with `Type: chord chart` and no melody section. Chord Pad imports become chord charts | A separate app (Chord Pad stays separate anyway) |
| Bars, bars per line, beats | Settings → Bars sets the number of bars (adds empty bars, or removes from the end; undo restores). Bars per line: score Auto (fits the music) or exactly 1–6; chord grid 1–8 (default 4). Beats per bar: the time signature (2–12 over 2, 4 or 8) | Bars per line only as a maximum |
| Pickup in the even grid | In a left margin, before bar 1's bar line: all bars the same width and lined up in columns, bars 1, 5, 9… start the lines, the pickup's beats as wide as any other. The margin holds the bar numbers on the other lines | Pickup sharing line 1 (narrower bars on that line only); pickup on its own line; pickup as a full-width bar (shifts the 4-bar phrases) |
| Draft keys in the Chords tab | Like Edit: selecting a chord toggles its keys on (an empty slot: none), unless there are unwritten keys, which stay. Elsewhere Draft keeps a free sketchpad | Draft always independent of the selection |
| Songs from GitHub | `songs/*.txt` in the repo (the text export format) join the song list, tagged GitHub. A changed file replaces the app's copy unless it was edited in the app; then the edit is kept as "… (my edits)". Deleting one in the app keeps it deleted. One-way: changes come back via Export | Two-way sync with a GitHub token (the user chose one-way) |
| Test chart placeholder | Shown only while the library is empty, with a fixed id; unedited copies of it are collapsed to one (they piled up when an empty browser merged with the account copy) | A fresh copy whenever local storage was empty |
| Pause | ▶ / ❚❚: pausing keeps the place (playhead dimmed, keys still lit) and ▶ carries on from the start of that beat, with no count-in. Moving the selection drops the place, so ▶ starts from the selection | A separate stop button (moving the cursor already does it) |
| Melody on the piano keys | While playing, the sounding melody notes light up orange on the big piano and the melody strip; chords stay green; a key in both is orange with a green base | Melody in the same colour as the chord |
| Swing | On by default (transport toggle: Swing / Straight; amount in Settings, default 0.8 ≈ 63:37). Applies to eighths and sixteenths in quarter-note time only; triplets and other tuplets, and chord changes on them, stay as written | Swing amount only (0 = straight); swinging tuplets |
| Draft Follow | Draft + Latch starts from the selection: on by default in Chords (the selected chord's keys), off in Melody (the selected note); the Follow button in the piano bar switches it per tab. Clear lets the next selection load again; a followed note off the keyboard moves it by octaves | Always following / never following |
| Names and addresses | iFake (was Chord Pad) at /ifake/ifake/ and iFake Pro (was Lead Sheet) at /ifake/ifake-pro/; the repo root is a landing page and the old addresses redirect | Keeping the old folder names; a second repo for /ifake-pro/ |
| Split on the Duo without flags | Split: Auto also turns on for the iPhone Duo's inner screen held upright (≈669 × 951 pt, or a "folded" posture), splitting at the screen's middle; the fold APIs still win when Safari reports them | Auto only with the flagged fold APIs |
| Draft and the chord keys | In Draft with Latch (Chords tab, piano showing) the chord keys show the drafted chord and change it — the piano keys follow — and Write puts it in the slot; N.C. and delete still act on the slot. In Edit they edit the slot as before | Chord keys always editing the slot |
| Recognising extensions | Voicings may leave out the 5th (of 7th chords and 6/9s) and the 9th (under a 13th or a minor 11th); added -Δ9, ø9, ø11, (add11), Δ9(♯11), +9, 9(♭13). A ♭5/♯11 or ♯5/♭13 voiced above the 7th is named as the tension | Exact note sets only |
| Melody on/off | A Melody chip beside Swing (on by default) plays just the backing when off; on narrow phones the two stack | Only in Settings |
| Keys during playback | Playing or paused, the piano shows only what's playing (chord green, melody orange) and the bar names that chord; ▶ (and the info row) play it; Write/Clear wait. The selection shows again when playback stops | Draft keys and the playing chord mixed |
| Split line | "Split line → Move…" offsets the split from the detected fold (or the screen's middle) and Reset puts it back; the diagnostic readout is gone | "Align with the fold" |
| Piano bar (Duo) | 40 px: Edit/Draft · ‹ chord name › · ▶ · Write · ⋯; Clear, Follow and Latch live in the ⋯ menu as switches. The panel's −oct/+oct hide in split view | Every control in one 28 px row |
| Key colours | Your keys one blue (white and black alike), the chord's root darker with a dot; playing green; melody orange. Draft/Edit is a neutral segmented control | Pale blue on white keys, orange Draft/Latch |
| Chord symbols | Sized to the cell (bigger on a short chart, which also gets taller rows); a crowded one puts extensions and bass on a second line; only then do extensions hide — the bass never does. A faint tint marks the whole selected / playing bar | Shrink, then hide extensions and bass behind … |
| Songs sheet & backups | The list first; text export, import and a whole-library backup (share/save a .json, copy, restore — newest copy of each song wins) folded under one row; Delete is red and asks once | Export/Import always open; one song at a time |
| Updates | The worker fetches its files fresh at install and caches the default instruments; the sample cache is named after the sample set; a Home Screen app checks for a new build when it comes back to the front and offers “Update ready · tap to reload” | Updates only on a cold start |
| Split line on the Duo | In the Home Screen app the line is fixed to the screen (its middle plus your offset) whether the phone is folded or flat; the reported fold only switches the split on. The page fills the screen in every posture |
| Status-bar band | When the band is tall (the Duo's ~82 pt), ☰, the song title, Even and ⚙ sit in it, left of the status circle; elsewhere they stay in the control row |
| Piano key names | Setting: C only (default) or every white key; C keeps its octave number |
| Notes off the keyboard | While playing, the ‹ or › arrow lights orange (melody) or green (chord) when a sounding note is beyond that edge |
| 13ths and 11ths without the 9th | Named exactly, so the two voicings look different: F A C E D is FΔ7(13), F A C E G D is FΔ13 (a written FΔ13 playing the 9th is fine) |
