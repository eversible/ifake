// voicing.js — turn chords into MIDI notes (bass + upper structure).
import { chordIntervals, ivlSemis, notePC } from './chords.js';

const mod = (a, n) => ((a % n) + n) % n;

export const VOICINGS = [
  { id: 'smooth', label: 'Smooth (voice-led)' },
  { id: 'close', label: 'Close, root position' },
  { id: 'spread', label: 'Bass + chord above' },
  { id: 'shell', label: 'Shell (3rd, 7th + 1 ext)' },
];

function placeAscending(pcs, low) {
  const out = [];
  let floor = low;
  for (const pc of pcs) {
    let m = floor + mod(pc - floor, 12);
    out.push(m);
    floor = m + 1;
  }
  return out;
}

function upperPCs(chord, ivs) {
  const rootPC = notePC(chord.root);
  const tones = ivs.map((i) => ({ i, semis: ivlSemis(i), pc: mod(rootPC + ivlSemis(i), 12) }));
  // drop the root from 4+ note chords (the bass covers it); keep it in triads and slash chords
  const dropRoot = !chord.bass && tones.length >= 4;
  const seen = new Set();
  const pcs = [];
  for (const t of tones.sort((a, b) => a.semis - b.semis)) {
    if (dropRoot && t.pc === rootPC) continue;
    if (!seen.has(t.pc)) { seen.add(t.pc); pcs.push(t.pc); }
  }
  return pcs;
}

function distance(a, b) {
  // sum over notes of distance to the nearest note in the other voicing (handles different sizes)
  const near = (x, ys) => Math.min(...ys.map((y) => Math.abs(x - y)));
  return a.reduce((s, x) => s + near(x, b), 0) + b.reduce((s, y) => s + near(y, a), 0);
}

export function voiceChord(chord, mode, prevUpper = null) {
  if (!chord || chord.nc) return null;
  const ivs = chordIntervals(chord);
  const rootPC = notePC(chord.root);
  const bassPC = chord.bass ? notePC(chord.bass) : rootPC;
  const bass = 36 + bassPC;                       // C2..B2
  if (!ivs.length) return { bass, upper: [] };    // e.g. every note omitted
  let upper;
  if (mode === 'close') {
    const rootMidi = 48 + rootPC;                 // C3..B3
    upper = ivs.map((i) => rootMidi + ivlSemis(i));
    return { bass: chord.bass && bassPC !== rootPC ? bass : rootMidi - 12, upper };
  }
  const pcs = upperPCs(chord, ivs);
  if (mode === 'shell') {
    const find = (pred) => ivs.find(pred);
    const third = find((i) => i.deg === 3) || find((i) => i.deg === 4 || i.deg === 2);
    const seventh = find((i) => i.deg === 7) || find((i) => i.deg === 6);
    const ext = ivs.filter((i) => i.deg >= 9 || (i.deg === 5 && i.acc !== 0)).slice(-1)[0];
    // triads have no 7th/6th: use 3rd + 5th instead so the shell is still two notes
    const fifth = find((i) => i.deg === 5);
    const sel = [third, seventh || fifth].filter(Boolean).map((i) => mod(rootPC + ivlSemis(i), 12));
    const base = placeAscending(sel.length >= 2 ? sel : pcs.slice(0, 2), 52);
    if (!base.length) return { bass, upper: placeAscending(pcs, 55) };
    if (ext) base.push(...placeAscending([mod(rootPC + ivlSemis(ext), 12)], Math.max(...base) + 1));
    return { bass, upper: base };
  }
  if (mode === 'spread' || !prevUpper) {
    upper = placeAscending(pcs, 55);
    if (mode === 'spread') return { bass, upper };
  }
  // smooth: try every inversion in a few registers, keep the one closest to the previous chord
  let best = upper, bestD = Infinity;
  for (let r = 0; r < pcs.length; r++) {
    const rot = pcs.slice(r).concat(pcs.slice(0, r));
    for (const low of [50, 53, 56, 59, 62]) {
      const cand = placeAscending(rot, low);
      if (cand[0] < 50 || cand[cand.length - 1] > 82) continue;
      const d = prevUpper ? distance(cand, prevUpper) : Math.abs(cand[0] - 57);
      if (d < bestD) { bestD = d; best = cand; }
    }
  }
  return { bass, upper: best };
}
