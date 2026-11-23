// chords.js — chord symbol engine for Chord Pad.
// A port of the Julia "Chord Memorisation" engine (interval_structs, chord_qualities,
// chord_extensions, chord_orderings, chord_evaluation, tonic_chords), extended with
// slash chords, N.C., iReal Pro shorthands and a structured representation for editing.

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const NAT_PC = [0, 2, 4, 5, 7, 9, 11];      // pitch class of each natural letter
const DEG_SEMI = [0, 2, 4, 5, 7, 9, 11];    // semitones of major-scale degrees 1..7

const mod = (a, n) => ((a % n) + n) % n;

// ---------- accidentals ----------
export function accStr(n) {
  if (n >= 0) return '♯'.repeat(n % 2) + '𝄪'.repeat(Math.floor(n / 2));
  const m = -n;
  return '♭'.repeat(m % 2) + '𝄫'.repeat(Math.floor(m / 2));
}
export function accCount(s) {
  let n = 0;
  for (const ch of s) {
    if (ch === '#' || ch === '♯') n += 1;
    else if (ch === '𝄪') n += 2;
    else if (ch === 'b' || ch === '♭') n -= 1;
    else if (ch === '𝄫') n -= 2;
  }
  return n;
}
const ACC_CLASS = '[#♯𝄪b♭𝄫]';

// ---------- notes ----------
export const note = (letter, acc = 0) => ({ letter, acc });
export const noteName = (n) => LETTERS[n.letter] + accStr(n.acc);
export const notePC = (n) => mod(NAT_PC[n.letter] + n.acc, 12);
export const sameNote = (a, b) => a.letter === b.letter && a.acc === b.acc;

const NOTE_RE = new RegExp(`^([A-G])(${ACC_CLASS}*)$`);
export function parseNote(s) {
  const m = NOTE_RE.exec(s.trim());
  if (!m) throw new Error(`invalid note "${s}" (expected A–G plus optional sharps/flats)`);
  return note(LETTERS.indexOf(m[1]), accCount(m[2]));
}

// ---------- intervals ----------
export const ivl = (acc, deg) => ({ acc, deg });
export const ivlSemis = (i) => i.acc + DEG_SEMI[(i.deg - 1) % 7] + 12 * Math.floor((i.deg - 1) / 7);
export const ivlName = (i) => accStr(i.acc) + i.deg;
const IVL_RE = new RegExp(`^(${ACC_CLASS}*)(\\d+)$`);
export function parseInterval(s) {
  const m = IVL_RE.exec(s);
  if (!m || +m[2] < 1) throw new Error(`invalid interval "${s}"`);
  return ivl(accCount(m[1]), +m[2]);
}
const ivlKey = (i) => `${i.deg}:${i.acc}`;
const ivlLess = (a, b) => a.deg - b.deg || a.acc - b.acc;   // Julia isless(MusicInterval)

class IvlSet {
  constructor(list = []) { this.m = new Map(); list.forEach((i) => this.add(i)); }
  add(i) { this.m.set(ivlKey(i), i); return this; }
  del(i) { this.m.delete(ivlKey(i)); return this; }
  has(i) { return this.m.has(ivlKey(i)); }
  sorted() { return [...this.m.values()].sort(ivlLess); }
}
const P = (s) => parseInterval(s);
const remadd = (rem, add) => (s) => { rem.forEach((i) => s.del(P(i))); add.forEach((i) => s.add(P(i))); };

// spell the note an interval above a root (equivalent to Julia's major-scale + accidental method)
export function spell(root, i) {
  const letter = mod(root.letter + i.deg - 1, 7);
  const target = NAT_PC[root.letter] + root.acc + ivlSemis(i);
  let acc = mod(target - NAT_PC[letter], 12);
  if (acc > 6) acc -= 12;
  return note(letter, acc);
}

// ---------- qualities (Julia chord_qualities.jl + additions) ----------
// level = evaluation order (Julia chord_orderings.jl): 1 applied first, 3 last.
const halfDim = remadd(['3', '5'], ['♭3', '♭5']);
export const QUALITIES = {
  min:     { sym: '-',   level: 2, apply: remadd(['3'], ['♭3']) },
  hdim:    { sym: 'ø',   level: 2, apply: halfDim },
  dim:     { sym: 'o',   level: 2, apply: (s) => { if (s.has(P('♭7'))) { s.del(P('♭7')); s.add(P('𝄫7')); } halfDim(s); } },
  aug:     { sym: '+',   level: 2, apply: remadd(['5'], ['♯5']) },
  maj:     { sym: 'Δ',   level: 3, apply: (s) => { if (s.has(P('♭7')) || s.has(P('𝄫7'))) { s.del(P('♭7')); s.del(P('𝄫7')); s.add(P('7')); } } },
  six:     { sym: '6',   level: 1, apply: remadd([], ['6']) },
  sixnine: { sym: '6/9', level: 2, apply: remadd([], ['6', '9']) },
  dom7:    { sym: '7',   level: 1, apply: remadd([], ['♭7']) },
  dom9:    { sym: '9',   level: 1, apply: remadd([], ['♭7', '9']) },
  dom11:   { sym: '11',  level: 1, apply: remadd([], ['♭7', '9', '11']) },
  dom13:   { sym: '13',  level: 1, apply: remadd([], ['♭7', '9', '13']) },  // 11 omitted (clashes with the 3rd)
  alt:     { sym: 'alt', level: 1, apply: remadd(['5'], ['♭5', '♭7', '♭9', '♯9', '♭13']) },
  five:    { sym: '5',   level: 3, apply: remadd(['3', '♭3'], []) },   // power chord: root + 5th
};
// display order for rendering a symbol, e.g. "-Δ7", "-+7", "ø7", "7alt"
export const QUAL_ORDER = ['min', 'hdim', 'dim', 'aug', 'maj', 'six', 'sixnine', 'dom7', 'dom9', 'dom11', 'dom13', 'alt', 'five'];
export const NUMBER_QUALS = ['six', 'sixnine', 'dom7', 'dom9', 'dom11', 'dom13'];

// ---------- extensions (Julia chord_extensions.jl) ----------
// ext = { kind: 'sus' | 'add' | 'omit' | 'acc', i: interval | null }
export function applyExt(s, e) {
  switch (e.kind) {
    case 'sus': s.del(P('♭3')).del(P('3')).add(e.i || P('4')); break;
    case 'add': s.add(e.i); break;
    case 'omit': s.del(e.i); break;
    case 'acc': s.del(ivl(0, e.i.deg)).add(e.i); break;   // replace the natural degree
  }
}
export function extName(e) {
  if (e.kind === 'sus') return 'sus' + (e.i ? ivlName(e.i) : '');
  if (e.kind === 'add') return 'add' + ivlName(e.i);
  if (e.kind === 'omit') return 'omit' + ivlName(e.i);
  return ivlName(e.i);
}
const sameExt = (a, b) => a.kind === b.kind && (a.i === b.i || (a.i && b.i && ivlKey(a.i) === ivlKey(b.i)));

function parseExtItem(str) {
  let m;
  if ((m = new RegExp(`^sus(${ACC_CLASS}*\\d*)$`).exec(str))) return { kind: 'sus', i: m[1] ? parseInterval(m[1]) : null };
  if ((m = new RegExp(`^add(${ACC_CLASS}*\\d+)$`).exec(str))) return { kind: 'add', i: parseInterval(m[1]) };
  if ((m = new RegExp(`^omit(${ACC_CLASS}*\\d+)$`).exec(str))) return { kind: 'omit', i: parseInterval(m[1]) };
  if ((m = new RegExp(`^(${ACC_CLASS}*\\d+)$`).exec(str))) return { kind: 'acc', i: parseInterval(m[1]) };
  throw new Error(`unknown chord extension "${str}"`);
}

// ---------- tokenizer for the quality text (longest match; fixes the Julia "dim"/"C77" issues) ----------
const QUAL_TOKENS = [
  ['Maj', 'maj'], ['maj', 'maj'], ['M', 'maj'], ['Δ', 'maj'], ['^', 'maj^'],
  ['min', 'min'], ['m', 'min'], ['-', 'min'], ['–', 'min'], ['−', 'min'],
  ['aug', 'aug'], ['+', 'aug'],
  ['ø', 'hdim'], ['o/', 'hdim'], ['0', 'hdim'], ['h', 'hdim7'],
  ['dim', 'dim'], ['o', 'dim'], ['°', 'dim'],
  ['6/9', 'sixnine'], ['69', 'sixnine'], ['6', 'six'],
  ['13', 'dom13'], ['11', 'dom11'], ['9', 'dom9'], ['7', 'dom7'],
  ['alt', 'alt'], ['5', 'five'], ['2', 'sus2'],
].sort((a, b) => [...b[0]].length - [...a[0]].length);

// inline (unbracketed) sus only takes a 2nd or 4th, so "7susb9" reads as 7 + sus + ♭9
const INLINE_EXT_RE = new RegExp(`^(sus(?:[#♯b♭]?[24])?|add${ACC_CLASS}*\\d+|omit${ACC_CLASS}*\\d+|${ACC_CLASS}+\\d+)`);

function tokenizeQualities(text, chordText) {
  const quals = [];
  const exts = [];
  let impliedMaj7 = false, impliedHdim7 = false;
  let rest = text.replace(/\s+/g, '');
  while (rest.length) {
    const im = INLINE_EXT_RE.exec(rest);
    if (im) { exts.push(parseExtItem(im[1])); rest = rest.slice(im[1].length); continue; }
    const tok = QUAL_TOKENS.find(([t]) => rest.startsWith(t));
    if (!tok) throw new Error(`unknown chord quality "${rest}" in "${chordText}"`);
    let q = tok[1];
    if (q === 'sus2') { exts.push({ kind: 'sus', i: parseInterval('2') }); rest = rest.slice(tok[0].length); continue; }  // iReal: C2 = Csus2
    if (q === 'maj^') { q = 'maj'; impliedMaj7 = true; }      // iReal: ^ alone = maj7
    if (q === 'hdim7') { q = 'hdim'; impliedHdim7 = true; }   // iReal: h alone = ø7
    if (quals.includes(q)) throw new Error(`repeated quality "${tok[0]}" in "${chordText}"`);
    quals.push(q);
    rest = rest.slice(tok[0].length);
  }
  if (quals.filter((q) => NUMBER_QUALS.includes(q)).length > 1) {
    throw new Error(`use one of 6, 6/9, 7, 9, 11, 13 in "${chordText}" — put other notes in brackets, e.g. C6(add9)`);
  }
  let auto7 = false;
  if ((impliedMaj7 || impliedHdim7) && !quals.some((q) => NUMBER_QUALS.includes(q))) { quals.push('dom7'); auto7 = true; }
  return { quals, exts, auto7 };
}

// ---------- structured chord ----------
// { nc: bool, root: note, quals: [id], exts: [ext], bass: note | null }
export function makeChord(root, quals = [], exts = [], bass = null) {
  return { nc: false, root, quals: [...quals], exts: [...exts], bass };
}
export const NC = () => ({ nc: true, root: null, quals: [], exts: [], bass: null });
export const cloneChord = (c) => ({ ...c, quals: [...c.quals], exts: c.exts.map((e) => ({ ...e })) });

const ROOT_RE = new RegExp(`^([A-G])(${ACC_CLASS}*)(.*)$`, 's');
const BASS_RE = new RegExp(`/([A-G]${ACC_CLASS}*)\\s*$`);

export function parseChord(text) {
  const s = text.trim();
  if (/^(n|N\.?C\.?|nc)$/i.test(s)) return NC();
  const m = ROOT_RE.exec(s);
  if (!m) throw new Error(`invalid chord "${text}" (must start with a note A–G)`);
  const root = note(LETTERS.indexOf(m[1]), accCount(m[2]));
  let rest = m[3];
  let bass = null;
  const bm = BASS_RE.exec(rest);
  if (bm) { bass = parseNote(bm[1]); rest = rest.slice(0, bm.index); }
  // bracketed extensions (Julia syntax), possibly several groups
  const exts = [];
  let outside = '';
  let depth = 0, buf = '';
  for (const ch of rest) {
    if (ch === '(') { if (depth++) throw new Error(`nested brackets in "${text}"`); buf = ''; }
    else if (ch === ')') {
      if (!depth--) throw new Error(`invalid chord symbol "${text}" (check the brackets)`);
      buf.split(',').map((x) => x.trim()).filter(Boolean).forEach((x) => exts.push(parseExtItem(x)));
    } else if (depth) buf += ch; else outside += ch;
  }
  if (depth) throw new Error(`invalid chord symbol "${text}" (check the brackets)`);
  const t = tokenizeQualities(outside, text);
  const c = makeChord(root, t.quals, [...t.exts, ...exts], bass);
  if (t.auto7) c.auto7 = true;           // "C^" / "Ch": the 7 is implied by ^ / h
  return c;
}

export function chordIntervals(c) {
  if (c.nc) return [];
  const s = new IvlSet([P('1'), P('3'), P('5')]);
  const qs = QUAL_ORDER.filter((q) => c.quals.includes(q)).sort((a, b) => QUALITIES[a].level - QUALITIES[b].level);
  qs.forEach((q) => QUALITIES[q].apply(s));
  c.exts.forEach((e) => applyExt(s, e));
  return s.sorted();
}

export function chordNotes(c) {
  if (c.nc) return [];
  return chordIntervals(c).map((i) => spell(c.root, i));
}

export function qualityText(c) {
  return QUAL_ORDER.filter((q) => c.quals.includes(q)).map((q) => QUALITIES[q].sym).join('');
}
export function extText(c) { return c.exts.map(extName).join(', '); }

export function chordText(c) {
  if (c.nc) return 'N.C.';
  const ext = c.exts.length ? `(${extText(c)})` : '';
  return noteName(c.root) + qualityText(c) + ext + (c.bass ? '/' + noteName(c.bass) : '');
}

// ---------- editing helpers (toggle keyboard) ----------
export function toggleQual(c, q) {
  const d = cloneChord(c);
  const on = d.quals.includes(q);
  const drop = (...xs) => { d.quals = d.quals.filter((x) => !xs.includes(x)); };
  const SEVENTH_MAKERS = ['maj', 'hdim', 'alt'];
  // an implied 7 (added by Δ, ø or alt): tapping 7 makes it explicit rather than removing it
  if (q === 'dom7' && on && d.auto7) { d.auto7 = false; return d; }
  // ...and turning an explicit 7 off while Δ / ø / alt is still on returns it to implied
  if (q === 'dom7' && on && d.quals.some((x) => SEVENTH_MAKERS.includes(x))) { d.auto7 = true; return d; }
  if (on) drop(q);
  else {
    if (NUMBER_QUALS.includes(q)) { drop(...NUMBER_QUALS); d.auto7 = false; }
    if (q === 'hdim' || q === 'dim') { drop('hdim', 'dim', 'min', 'aug'); }
    if (q === 'min' || q === 'aug') drop('hdim', 'dim');
    d.quals.push(q);
    // major-7th, half-diminished and altered keys give seventh chords (a bare Δ would sound like a triad)
    if (SEVENTH_MAKERS.includes(q) && !d.quals.some((x) => NUMBER_QUALS.includes(x))) { d.quals.push('dom7'); d.auto7 = true; }
  }
  // once nothing implies it any more, an implied 7 goes too
  if (d.auto7 && !d.quals.some((x) => SEVENTH_MAKERS.includes(x))) { drop('dom7'); d.auto7 = false; }
  if (!d.quals.includes('dom7')) d.auto7 = false;
  return d;
}
export function hasExt(c, e) { return c.exts.some((x) => sameExt(x, e)); }
export function toggleExt(c, e) {
  const d = cloneChord(c);
  if (hasExt(d, e)) { d.exts = d.exts.filter((x) => !sameExt(x, e)); return d; }
  if (e.kind === 'sus') d.exts = d.exts.filter((x) => x.kind !== 'sus');
  if (e.kind === 'acc') {
    // ♭5/♯5 (and ♭13/♯5 duplicates) are alternatives for the same degree
    d.exts = d.exts.filter((x) => !(x.kind === 'acc' && x.i.deg === e.i.deg && x.i.acc !== e.i.acc && e.i.deg === 5));
  }
  d.exts.push(e);
  return d;
}

// semitone transposition with conventional spellings (flats, as in the practice sets)
const PREFERRED = [[0, 0], [1, -1], [1, 0], [2, -1], [2, 0], [3, 0], [4, -1], [4, 0], [5, -1], [5, 0], [6, -1], [6, 0]];
export function preferredNote(pc) { const [l, a] = PREFERRED[mod(pc, 12)]; return note(l, a); }
export function transposeChord(c, semis) {
  if (c.nc) return cloneChord(c);
  const d = cloneChord(c);
  d.root = preferredNote(notePC(c.root) + semis);
  if (c.bass) {
    // keep the bass's letter distance and interval from the root (C/E -> D♭/F)
    const deg = mod(c.bass.letter - c.root.letter, 7) + 1;
    const semi = mod(notePC(c.bass) - notePC(c.root), 12);
    const base = DEG_SEMI[deg - 1];
    let acc = mod(semi - base, 12); if (acc > 6) acc -= 12;
    d.bass = spell(d.root, ivl(acc, deg));
  }
  return d;
}
export function enharmonic(n) {
  // C♯ <-> D♭ style respelling: move to the neighbouring letter that needs the fewest accidentals.
  // Naturals stay natural (no B♯ for C).
  if (n.acc === 0) return n;
  const pc = notePC(n);
  const cands = [-1, 1].map((dl) => { const l = mod(n.letter + dl, 7); let a = mod(pc - NAT_PC[l], 12); if (a > 6) a -= 12; return note(l, a); });
  cands.sort((x, y) => Math.abs(x.acc) - Math.abs(y.acc));
  return Math.abs(cands[0].acc) <= 2 ? cands[0] : n;
}

// ---------- MIDI ----------
export const noteMidi = (n, octave) => 12 * (octave + 1) + NAT_PC[n.letter] + n.acc;  // C4 = 60
