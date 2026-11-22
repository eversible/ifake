// recognise.js — name a chord from notes pressed on the piano, and the reverse (which keys show a chord).
// Any voicing works: notes can be in any order, spread over octaves or doubled. When the lowest note isn't
// the root the chord is an inversion and is written as a slash chord (E A C → A-/E).
import { parseChord, chordIntervals, chordNotes, ivlSemis, notePC, noteName, preferredNote } from './chords.js';
import { keyAccidental } from './melody.js';

// chord types to recognise, most likely first (the first type with a given set of notes wins)
const TYPES = ['', '-', '7', '-7', 'Δ7', 'ø7', 'o7', 'o', '+', '5', '(sus4)', '(sus2)', '6', '-6', '-Δ7', '+7', '7(sus4)',
  '6/9', '-6/9', '(add9)', '-(add9)', '9', 'Δ9', '-9', '7(♭9)', '7(♯9)', '7(♯11)', '7(♭13)', '7(♭5)', 'Δ7(♯11)', 'Δ7(♯5)',
  '-11', '11', '13', 'Δ13', '-13', '9(sus4)', '13(sus4)', '7(♭9, ♯11)', '7(♭9, ♭13)', '7(♯9, ♭13)', '7(♯9, ♯11)', '7alt',
  '9(♯11)', '13(♭9)', '13(♯11)'];

const mod12 = (n) => ((n % 12) + 12) % 12;
const pcsOf = (c) => [...new Set(chordIntervals(c).map((i) => mod12(ivlSemis(i))))].sort((a, b) => a - b);
// interval set (relative to the root, sorted) → { t: type, rank: lower = more likely }
let TABLE = null;
function table() {
  if (TABLE) return TABLE;
  TABLE = new Map();
  const add = (k, t, rank) => { if (!TABLE.has(k)) TABLE.set(k, { t, rank }); };
  TYPES.forEach((t, i) => add(pcsOf(parseChord('C' + t)).join(','), t, i));
  // voicings often leave out the 5th of a 7th chord (or bigger): a little less likely. Only chords with a 7th —
  // a "6 chord without its 5th" (C E A) is really a minor triad over its 3rd (A-/C)
  TYPES.forEach((t, i) => {
    const pcs = pcsOf(parseChord('C' + t));
    if (pcs.includes(7) && pcs.length >= 4 && (pcs.includes(10) || pcs.includes(11))) add(pcs.filter((p) => p !== 7).join(','), t, i + 50);
  });
  return TABLE;
}

// MIDI notes → chord (or null when the notes don't make a chord we know). Every note is tried as the root;
// root position (the lowest note is the root) wins, then the more common chord type.
export function nameChord(midis, fifths = 0) {
  if (midis.length < 2) return null;
  const notes = [...midis].sort((a, b) => a - b), bass = mod12(notes[0]);
  const pcs = [...new Set(notes.map(mod12))];
  let best = null;
  for (const r of pcs) {
    const hit = table().get(pcs.map((p) => mod12(p - r)).sort((a, b) => a - b).join(','));
    if (!hit) continue;
    const score = hit.rank + (r === bass ? 0 : 100);
    if (!best || score < best.score) best = { score, r, t: hit.t };
  }
  if (!best) return null;
  const midiOfRoot = notes.find((m) => mod12(m) === best.r);
  const c = parseChord(rootName(midiOfRoot, fifths) + best.t);
  if (best.r !== bass) {
    // the bass is one of the chord's own notes: spell it as the chord does (A♭7/C, not A♭7/B♯)
    c.bass = chordNotes(c).find((n) => notePC(n) === bass) || preferredNote(bass);
  }
  return c;
}
// spell a root: as in the key if it's in the key, else a natural, else ♭ in flat keys and ♯ in sharp keys
const NAT = [0, 2, 4, 5, 7, 9, 11];
function rootName(midi, fifths) {
  const pc = mod12(midi);
  let l = NAT.findIndex((n, j) => mod12(n + keyAccidental(fifths, j)) === pc);
  if (l >= 0) return 'CDEFGAB'[l] + accText(keyAccidental(fifths, l));
  if ((l = NAT.indexOf(pc)) >= 0) return 'CDEFGAB'[l];
  return fifths < 0 ? 'CDEFGAB'[NAT.indexOf(mod12(pc + 1))] + '♭' : 'CDEFGAB'[NAT.indexOf(mod12(pc - 1))] + '♯';
}
const accText = (a) => (a > 0 ? '♯'.repeat(a) : '♭'.repeat(-a));

// the keys that show a chord: its lowest note (the root, or the bass of a slash chord) in the piano's lowest
// octave, the other notes close above it
export function chordKeys(c, base) {
  if (!c || c.nc || !c.root) return [];
  const rootPC = notePC(c.root), low = c.bass ? notePC(c.bass) : rootPC, start = base + mod12(low - base);
  const pcs = new Set(chordIntervals(c).map((i) => mod12(rootPC + ivlSemis(i))));
  pcs.add(low);
  return [...pcs].map((p) => start + mod12(p - low)).sort((a, b) => a - b);
}
