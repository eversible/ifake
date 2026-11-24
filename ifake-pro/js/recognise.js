// recognise.js — name a chord from notes pressed on the piano, and the reverse (which keys show a chord).
// Any voicing works: notes can be in any order, spread over octaves or doubled. When the lowest note isn't
// the root the chord is an inversion and is written as a slash chord (E A C → A-/E).
import { parseChord, chordIntervals, chordNotes, ivlSemis, notePC, noteName, preferredNote } from './chords.js';
import { keyAccidental } from './melody.js';

// Naming works backwards from the chord-symbol grammar (chords.js, the port of the Julia engine): every
// symbol the grammar writes from a core chord (triad, 6 or 7th chord) plus any set of tensions is written out
// by the usual rules, played through the parser, and filed under the notes it gives. So a name is only ever
// one the parser reads back as exactly those notes, and any core + tensions the grammar can write gets a name.
//
// The rules for writing a symbol (jazz chart style):
//  - on a 7th chord the number is the highest natural extension stacked on it (9, 11, 13 — a 13 leaves the 11
//    out); an altered 9th stands in for the 9th underneath (13(♭9)); anything else goes in brackets: altered
//    tensions, and a natural 11 or 13 with no 9th (7(13), Δ7(11))
//  - on a triad, added notes say "add" (C(add9)); a triad with a 13th is a 6 chord (6/9 with the 9th)
//  - an altered note goes in by itself when its natural note is there too (add♭9 beside the 9)
// Each name has a cost (how unusual it is). Every note is tried as the root and the cheapest name wins, with
// 100 added when the root isn't the lowest note (an inversion, written as a slash chord). Rare chord shapes
// cost more than 100, so a common chord over another bass (C/G) beats an odd one in root position (G6(sus4)).

// tensions in the order they're written: semitones above the root, and the natural note an alteration replaces
const TENSIONS = [
  { k: '♭9', pc: 1, nat: '9' }, { k: '9', pc: 2 }, { k: '♯9', pc: 3, nat: '9' }, { k: '11', pc: 5 },
  { k: '♯11', pc: 6, nat: '11' }, { k: '♭13', pc: 8, nat: '13' }, { k: '13', pc: 9 },
];
// the core chords: pre = what goes before the number, items = bracketed notes that belong to the core,
// usual = the tensions commonly put on it (any other one costs as much as an inversion)
const ALL = ['♭9', '9', '♯9', '11', '♯11', '♭13', '13'];
const USUAL = {
  '7': ALL, 'Δ7': ['9', '♯11', '13'], '-7': ['9', '11', '13'], 'ø7': ['9', '11', '♭13'], '-Δ7': ['9', '11', '13'],
  '+7': ['♭9', '9', '♯9', '♯11'], '7(sus4)': ['♭9', '9', '13'], '7(♭5)': ['♭9', '9', '♯9', '♭13', '13'],
  'Δ7(♯5)': ['9', '♯11'], '6': ['9', '♯11'], '-6': ['9', '11'], '': ['9', '11'], '-': ['9', '11'],
};
const CORES = [
  { kind: 'triad', pre: '', cost: 0 }, { kind: 'triad', pre: '-', cost: 1 },
  { kind: 'seventh', pre: '', cost: 2 }, { kind: 'seventh', pre: '-', cost: 3 }, { kind: 'seventh', pre: 'Δ', cost: 4 },
  { kind: 'seventh', pre: 'ø', cost: 5 }, { kind: 'dim7', pre: 'o7', cost: 6 },
  { kind: 'triad', pre: 'o', cost: 7 }, { kind: 'triad', pre: '+', cost: 8 }, { kind: 'triad', pre: '5', cost: 9 },
  { kind: 'triad', pre: '', items: ['sus4'], cost: 10 }, { kind: 'triad', pre: '', items: ['sus2'], cost: 11 },
  { kind: 'six', pre: '', cost: 12 }, { kind: 'six', pre: '-', cost: 13 },
  { kind: 'seventh', pre: '-Δ', cost: 14 }, { kind: 'seventh', pre: '+', cost: 15, tension: '♭13' },
  { kind: 'seventh', pre: '', items: ['sus4'], cost: 16 },
  { kind: 'seventh', pre: '', items: ['♭5'], cost: 25, tension: '♯11' },
  { kind: 'seventh', pre: 'Δ', items: ['♯5'], cost: 30, tension: '♭13' },
  { kind: 'seventh', pre: 'Δ', items: ['♭5'], cost: 70, tension: '♯11' },   // CΔ7(♯11) without its 5th reads better
  { kind: 'seventh', pre: '', items: ['sus2'], cost: 45 }, { kind: 'seventh', pre: 'Δ', items: ['sus4'], cost: 45 },
  { kind: 'seventh', pre: '', items: ['omit3'], cost: 60 }, { kind: 'seventh', pre: 'Δ', items: ['omit3'], cost: 70 },
  // rare shapes: dearer than an inversion of something common
  { kind: 'seventh', pre: '-', items: ['♯5'], cost: 120 }, { kind: 'seventh', pre: 'oΔ', cost: 120 },
  { kind: 'triad', pre: '', items: ['♭5'], cost: 120 }, { kind: 'triad', pre: '-', items: ['♯5'], cost: 130 },
  { kind: 'six', pre: '', items: ['sus4'], cost: 120 }, { kind: 'six', pre: '', items: ['sus2'], cost: 125 },
  { kind: 'seventh', pre: '-Δ', items: ['♯5'], cost: 130 }, { kind: 'seventh', pre: '+Δ', items: ['sus4'], cost: 140 },
];
// the C7alt shorthand, for its full set of notes
const EXTRA = [{ text: '7alt', cost: 30 }];

const mod12 = (n) => ((n % 12) + 12) % 12;
const pcsOf = (c) => [...new Set(chordIntervals(c).map((i) => mod12(ivlSemis(i))))].sort((a, b) => a - b);

// write the symbol (without the root) for a core plus a set of tension names; null if this core can't carry them
function writeSymbol(core, tens) {
  const has = (k) => tens.includes(k), alt9 = has('♭9') || has('♯9'), deg9 = has('9') || alt9;
  const items = [...(core.items || [])], adds = [];
  let cost = core.cost, head = core.pre;
  const name = core.pre + (core.kind === 'seventh' ? '7' : core.kind === 'six' ? '6' : '') + (items.length ? `(${items.join(', ')})` : '');
  const usual = USUAL[name] || [];
  cost += 100 * tens.filter((k) => !usual.includes(k)).length;
  if (core.kind === 'seventh') {
    const num = has('13') && deg9 ? 13 : has('11') && deg9 ? 11 : has('9') ? 9 : 7;
    const implied = num === 13 ? ['9', '13'] : num === 11 ? ['9', '11'] : num === 9 ? ['9'] : [];
    head += num; cost += { 7: 0, 9: 6, 11: 12, 13: 12 }[num];
    for (const t of TENSIONS) {
      if (!has(t.k) || implied.includes(t.k)) continue;
      adds.push((t.nat && has(t.nat) ? 'add' : '') + t.k);
      cost += t.nat ? 8 : deg9 ? 8 : 14;             // a natural 11 / 13 with no 9th under it is less usual
    }
  } else if (core.kind === 'six') {
    head += has('9') ? '6/9' : '6'; if (has('9')) cost += 6;
    for (const t of TENSIONS) {
      if (!has(t.k) || t.k === '9') continue;
      adds.push((t.nat && has(t.nat) ? 'add' : '') + t.k); cost += 8;
    }
  } else if (core.kind === 'dim7') {
    for (const t of TENSIONS) if (has(t.k)) adds.push(t.k);
  } else {
    for (const t of TENSIONS) {
      if (!has(t.k)) continue;
      if (t.k === '13') return null;                  // a triad with a 13th is a 6 chord
      adds.push('add' + t.k); cost += t.k === '9' ? 8 : 12;
    }
  }
  const all = [...items, ...adds];
  if (all.length > 2) cost += 6 * (all.length - 2);    // long bracket lists are rarer
  return { text: head + (all.length ? `(${all.join(', ')})` : ''), cost };
}

// interval set (relative to the root, sorted) → { t: symbol, rank: cost, alt: the same notes with the altered
// 5th read as a tension (7(♭5) ↔ 7(♯11)), used when that note sits above the 7th }
let TABLE = null;
function subsets(list) { return list.reduce((acc, x) => acc.concat(acc.map((s) => [...s, x])), [[]]); }
function table() {
  if (TABLE) return TABLE;
  TABLE = new Map();
  const add = (pcs, t, rank, alt) => {
    if (pcs.length < 3 && t !== '5') return;          // two notes only name a power chord
    const k = pcs.join(','), had = TABLE.get(k);
    if (!had || had.rank > rank) TABLE.set(k, { t, rank, alt });
  };
  const parsePcs = (t) => { try { return pcsOf(parseChord('C' + t)); } catch (e) { return null; } };
  const allTens = subsets(TENSIONS.map((x) => x.k));
  for (const core of CORES) {
    const corePcs = parsePcs(writeSymbol(core, []).text);
    if (!corePcs) continue;
    for (const tens of allTens) {
      // a tension on a note the core already has is the same note (♯9 on a minor 3rd): skip
      if (tens.some((k) => corePcs.includes(TENSIONS.find((x) => x.k === k).pc))) continue;
      const w = writeSymbol(core, tens); if (!w) continue;
      const pcs = parsePcs(w.text); if (!pcs) continue;
      // the altered-5th cores also read the other way: 7(♭5) is 7(♯11) without its 5th
      let alt = null;
      if (core.tension) {
        const plain = CORES.find((c) => c.kind === 'seventh' && !c.items && c.pre === core.pre.replace('+', ''));
        const a = plain && writeSymbol(plain, [...tens, core.tension]);
        const ap = a && parsePcs(a.text);
        if (ap && ap.filter((x) => x !== 7).join() === pcs.join()) alt = a.text;
      }
      add(pcs, w.text, w.cost, alt);
      // voicings leave the 5th out of a 7th chord or a 6/9 (but a 6 chord without its 5th, C E A, is A-/C)
      const has = (x) => pcs.includes(x), seventh = has(10) || has(11);
      if (has(7) && pcs.length >= 4 && (seventh || (has(9) && has(2)))) add(pcs.filter((x) => x !== 7), w.text, w.cost + 50, alt);
    }
  }
  for (const e of EXTRA) { const pcs = parsePcs(e.text); if (pcs) add(pcs, e.text, e.cost, null); }
  return TABLE;
}
export const nameTable = () => table();

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
    if (!best || score < best.score) best = { score, r, t: hit.t, alt: hit.alt };
  }
  if (!best) return null;
  // one key can be ♭5 or ♯11 (♯5 or ♭13): voiced above the 7th it's the tension
  let t = best.t;
  const lowest = (iv) => notes.find((m) => mod12(m - best.r) === iv);
  const sev = lowest(10) ?? lowest(11);
  if (best.alt && sev !== undefined && (lowest(6) > sev || lowest(8) > sev)) t = best.alt;
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
  // outside the key: chord roots read as flats (B♭7, E♭, A♭, D♭), except F♯ in keys without flats
  return pc === 6 && fifths >= 0 ? 'F♯' : 'CDEFGAB'[NAT.indexOf(mod12(pc + 1))] + '♭';
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
