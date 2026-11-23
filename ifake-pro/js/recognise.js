// recognise.js — name a chord from notes pressed on the piano, and the reverse (which keys show a chord).
// Any voicing works: notes can be in any order, spread over octaves or doubled. When the lowest note isn't
// the root the chord is an inversion and is written as a slash chord (E A C → A-/E).
import { parseChord, chordIntervals, chordNotes, ivlSemis, notePC, noteName, preferredNote } from './chords.js';
import { keyAccidental } from './melody.js';

// chord types to recognise, most likely first (the first type with a given set of notes wins)
const TYPES = ['', '-', '7', '-7', 'Δ7', 'ø7', 'o7', 'o', '+', '5', '(sus4)', '(sus2)', '6', '-6', '-Δ7', '+7', '7(sus4)',
  '6/9', '-6/9', '(add9)', '-(add9)', '9', 'Δ9', '-9', '7(♭9)', '7(♯9)', '7(♯11)', '7(♭13)', '7(♭5)', 'Δ7(♯11)', 'Δ7(♯5)',
  '-11', '11', '13', 'Δ13', '-13', '9(sus4)', '13(sus4)', '7(♭9, ♯11)', '7(♭9, ♭13)', '7(♯9, ♭13)', '7(♯9, ♯11)', '7alt',
  '9(♯11)', '13(♭9)', '13(♯11)', '-Δ9', 'ø9', '(add11)', '-(add11)', 'Δ9(♯11)', '+9', '9(♭13)', 'ø11', '13(♭9, ♯11)'];

const mod12 = (n) => ((n % 12) + 12) % 12;
const pcsOf = (c) => [...new Set(chordIntervals(c).map((i) => mod12(ivlSemis(i))))].sort((a, b) => a - b);
// interval set (relative to the root, sorted) → { t: type, rank: lower = more likely }
let TABLE = null;
function table() {
  if (TABLE) return TABLE;
  TABLE = new Map();
  const add = (pcs, t, rank) => {
    if (pcs.length < 3) return;
    const k = pcs.join(','), had = TABLE.get(k);
    if (!had || had.rank > rank) TABLE.set(k, { t, rank });
  };
  TYPES.forEach((t, i) => add(pcsOf(parseChord('C' + t)), t, i));
  // voicings leave notes out, which makes a name a little less likely:
  //  - the 5th of a chord with a 7th, or of a 6/9 (a "6 chord without its 5th", C E A, is really A-/C)
  //  - the 9th under a 13th (C E B♭ A is C13) or under a minor 11th (C E♭ B♭ F is C-11)
  TYPES.forEach((t, i) => {
    const p = pcsOf(parseChord('C' + t)), has = (x) => p.includes(x), seventh = has(10) || has(11);
    const no5 = has(7) && p.length >= 4 && (seventh || (has(9) && has(2)));
    const no9 = has(2) && seventh && (has(9) || (has(5) && has(3)));
    const without = (...xs) => p.filter((x) => !xs.includes(x));
    if (no5) add(without(7), t, i + 50);
    if (no9) add(without(2), t, i + 60);
    if (no5 && no9) add(without(7, 2), t, i + 70);
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
  // one key can be ♭5 or ♯11 (♯5 or ♭13): voiced above the 7th it's the tension
  let t = best.t;
  const lowest = (iv) => notes.find((m) => mod12(m - best.r) === iv);
  const sev = lowest(10) ?? lowest(11);
  if (sev !== undefined && t === '7(♭5)' && lowest(6) > sev) t = '7(♯11)';
  if (sev !== undefined && t === '+7' && lowest(8) > sev) t = '7(♭13)';
  const midiOfRoot = notes.find((m) => mod12(m) === best.r);
  const c = parseChord(rootName(midiOfRoot, fifths) + t);
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
