# Chord Pad — design decisions

Decisions made with Mez (9 Nov 2026) are marked **[agreed]**. Smaller calls made during the build are listed with the
alternatives, so they can be revisited.

## Agreed
- **[agreed] Platform:** web app in Safari (works on iPhone, iPad, Mac). Native SwiftUI rejected for now.
- **[agreed] Hosting:** claude.ai-hosted page for now; move to GitHub Pages (eversible/Chords or a new repo) later for a
  standalone Home Screen app that works offline. The code is plain static files so the move is a push.
- **[agreed] Playback scope:** chords + rhythm patterns + bass line + click. Full backing band (drums, styles) is the top TODO.
- **[agreed] Editing:** toggle keys for chord features plus a text field for typing symbols.
- **[agreed] Layout:** iReal Pro-style grid, 16 cells per line by default, configurable.
- **[agreed] Chord rules carried over from the Julia engine:** 6 and m6 supported; 13 chords omit the 11; dim/o detected
  before minor.
- **[agreed, review round 1]** Transport strip above the keyboard (loop chip, tempo with hold-repeat and tap tempo,
  Play/Stop), loop bracket with drag handles, bar numbers, loop follows the selection at the next bar line.
- **[agreed]** The Δ key gives Δ7 when no number is set (like ø and alt). Typed `CΔ` still means a triad, as in Julia.
- **[agreed, round 3]** Loop on with no range selected loops the whole song (starting from the selected bar, no bracket).
  Selecting a range loops just that part (bracketed); tapping a single cell goes back to the whole song without jumping.
  Loop off plays from the selected bar to the end.
- **[agreed]** Sideways drag selects immediately; hold 0.25 s to drag across lines. (Hold-to-extend-from-last-selection removed.)
- **[agreed]** No stand-in synth while samples load: the first chord/Play waits for the instrument; a soft sine is used only if loading fails.
- **[agreed]** Tapping the chord strip above the keyboard plays the selected chord.
- **[agreed]** Repeats and endings in the chart (needed by the Lead Sheet app too).
- **[agreed]** A 7 added by Δ, ø or alt is *implied*: drawn in a lighter shade, and removed again when the last of those
  keys is turned off. Tapping an implied 7 makes it explicit; tapping it again returns it to implied (it never vanishes
  while Δ/ø/alt is on).
- **[agreed]** Fix every bug from the review. Not taken (for now): two-tier chord text, paged keyboard, typing mode.

## Build-time calls (revisit freely)
| Topic | Chosen | Alternatives considered |
|---|---|---|
| Chord engine | Port of the Julia engine to JS, verified identical on 16,198 symbols | Rewrite from scratch |
| Quality parsing | Longest-match tokenizer; repeated qualities (`C77`, `C--7`) and two numbers (`C96`) are errors | Julia's substring search (accepted `C77`) |
| Extra notation | iReal shorthands accepted: `^`/`^7` = maj7, `h`/`h7` = ø7, `m7b5`, inline `7b9#11`, `7sus`, `69`, `add9`, `C5` (power chord), `C2` (sus2), en dash and minus sign as minor. Unbracketed `sus` only takes 2 or 4, so `7susb9` = 7sus + ♭9 | Only the Julia notation |
| Display | Your notation: Δ, –, ø, o, +, extensions in brackets (shown as superscript in the grid) | iReal-style `^7`, `h7` |
| `C^` / `Ch` (no number) | Mean maj7 / ø7, as in iReal | Triad, as `CΔ` / `Cø` mean in the Julia engine (kept for those symbols) |
| Toggling Δ, ø or alt | Adds a 7 if no number is set | Leave as a triad |
| alt chord | 1 3 ♭5 ♭7 ♭9 ♯9 ♭13 (no 5) | Spelling with ♯11 / ♯5 |
| Exclusive toggles | One number (6, 6/9, 7, 9, 11, 13) at a time; ø/o replace – and +; ♭5/♯5 replace each other; sus2/sus4 replace each other | Allow any combination (still possible by typing) |
| Rhythm in the chart | One cell = one beat; a chord lasts until the next chord; empty cells sustain | iReal's exact spacing rules |
| Typed input | One chord replaces the cell (`.` clears it). Tokens containing `.` fill beats from the selected cell. Several chords without `|` = one per bar. With `|`, chords spread evenly over each bar, `.` holds a beat, empty bars are kept, `%` repeats the previous bar (including the bar before the start); too many chords for a bar is an error. Brackets may contain spaces | One chord per cell |
| Range selection | Sideways drag selects at once; hold 0.25 s then drag to cross lines (scrolling paused during the drag); double-tap selects a bar; drag the loop handles | Hold-to-extend from the previous selection (removed in round 3) |
| Transpose keys | Range selected → range; single cell → whole chart; flat spellings (D♭, E♭, G♭, A♭, B♭) | Key-aware spelling |
| Count-in default | None (fastest repetition) | 1 bar |
| Voicing default | Smooth (voice-led), bass in octave 2 | Close root position |
| Sounds | 19 sampled instruments (Salamander grand, tonejs nylon guitar and harp, the rest rendered from the free GeneralUser GS soundfont) + 6 built-in synths | Load soundfonts from a CDN (blocked on claude.ai pages) |
| Sample format | Mono MP3, 64 kb/s, every minor third, one base64 JSON file per instrument (15.9 MB, compressed in transit; claude.ai refuses custom binary files); leading silence trimmed at load | WAV/OGG; per-note files; binary packs |
| Latency | Web Audio, look-ahead scheduler (120 ms ahead, 16th-note steps); edits during a loop are heard within ~0.1 s | Scheduling whole bars ahead |
| Saving | Instantly to the browser; also to a private per-person store in your Claude account when hosted on claude.ai | Browser only |
| Silent switch | `navigator.audioSession.type = "playback"` so the iPhone's silent switch doesn't mute it (Safari 17+) | — |
| Respelling (⇄) | Only sharps/flats are respelled; naturals stay (no B♯ for C) | Allow B♯/C𝄪 |
| Crowded chords | Shrink to 10 px minimum; below that, bracketed extensions hide behind "…" (full symbol in the info strip and tooltip) | Two-tier layout (proposed, not taken yet) |
| Lines vs bars | Cells per line must be whole bars (3/4 → 6, 9, 12, 15 … cells) | Allow bars to split across lines |
| Stop | Cuts every scheduled or ringing note (≈30 ms fade) | Let notes ring out |
| Late scheduling | After a stall (backgrounded tab, busy CPU) missed steps are skipped rather than played late in a bunch | Catch up |
| Bass lines on slash chords | First beat plays the slash bass; other tones are built from the chord root | Build from the bass note |
| Memory | At most 3 sampled instruments stay decoded (current chord + bass + most recent) | Keep everything loaded |
| Saving model | Per-chart edit times; copies from other tabs/devices are merged chart by chart; deletions remembered; save immediately when the page is hidden | Whole-library last-writer-wins |
| Fast keys | Act on touch-down; a click with no touch-down (VoiceOver, keyboard) also works, never twice. ⌨ opens on tap release so iOS shows its keyboard; the chord keyboard hides while typing | Click only |
| Playhead | Lags the scheduler by the output latency (Bluetooth) | Ignore latency |
| Repeat marks | Stored per bar: repeat start, repeat end with a play count (`:|` = ×2; `×N` cycles ×2→×3→×4), ending number 1–3. Playback unrolls them into a play order (e.g. bars 1 2 1 3 4); the loop and playhead follow that order | Copy the repeated bars out in full |
| Repeat keys | New "form" key row: `|:` `:|` `×2` `1.` `2.` `3.` act on the selected bar(s) and toggle off when already set; ending keys on a range mark every bar in it | A separate form editor |
| Repeats in text | `{` start, `}` end, `}x3` play three times, `N1`/`N2`/`N3` endings; exported and re-imported the same way | iReal's own codes |
| Bar tools | Act on the selected bar: `+bar` inserts an empty bar before it, `−bar` deletes it, `Dup` copies it after itself, `%` copies the previous bar into it; repeat marks shift with the bars. (Lead Sheet's `+bar` inserts *after*, see its DECISIONS) | Insert after |
| Saving implied 7s | A trailing `~` on the cell text marks an implied 7 (e.g. `CΔ7~`); older charts without it load as explicit 7s | A separate flag field |
| Keyboard pages | Page 1: chord entry; page 2 (Form ›): repeats, endings, bars, transpose, + line / − line; the move / cell / undo / hear row is on both | All 60 keys at once; line buttons under the chart |
| Chart size & symbols | Rows grow to fill the chart area; symbols sized to the cell; crowded ones go onto two lines (extensions and bass underneath), the bass never hidden; the selected / playing bar faintly tinted | 17 px cap; hide extensions and bass behind … |
| Charts sheet & backups | List first; text export, import and whole-library backup folded under one row; the save status moved here | Export/Import always open |
| Beats per bar | Changing it re-lays the chart bar by bar (marks stay on their bars); chords past the new last beat are dropped with a toast (Undo restores them) | Reflowing the flat cell list |
| Repeat signs | One-bar (%), half-bar and two-bar repeat signs, kept as signs (marks[bar].sim = 'bar' / 'half' / 'two'): drawn like iReal Pro's, played as the bar, half bar or two bars just before (a sign after a held chord restrikes it). The % key now puts the sign in instead of copying the bar; ½ % and 2 % keys beside it. Writing a chord under a sign takes it off. Typing: "%" alone in a bar, "%%" for two bars, "C7 %" for a half bar; the text format writes the same |
| Beat slashes, not a half-bar sign | "/" is one beat of the chord before, played again (iReal-style slash), and replaces the half-bar % sign: a half bar is written C7 / /. Typed without ".", a slash takes one beat and the chords share the rest ("C7 / /" in 4/4: C7 for two beats, two slashes). A slash cell holds a copy of the chord before it that follows that chord after every edit; one changed by hand becomes an ordinary chord. Saved and exported as "/" |
| Sound after leaving the app | iOS can leave a web app's audio stuck (silent, or never resuming) after it's been in the background. Leaving the app now pauses (iFake: stops) playback, and the first tap after coming back starts a fresh audio context; the loaded samples carry over |
| Late sound after coming back | iOS can bring a web app's audio back running far behind (sound comes late). Coming back now starts a fresh audio context straight away (and any tap wakes it), not only after a long absence; an interruption (call, another app taking the sound) counts too. Playback stops first, since its timing is on the old clock |
