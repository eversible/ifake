// song.js — a lead sheet: header (title, key, time, pickup), per-bar chords (one cell per beat, or finer:
// see "chord slots"), melody (melody.js) and repeat marks (form.js). Text import/export and storage format.
import { parseChord, chordText } from './chords.js';
import { TPQ, beatTicks, emptyMeasure, restsFor, parseMelody, setMelody, melodyText, KEY_NAMES } from './melody.js';
import { unrollBars } from './form.js';

const uid = () => Math.random().toString(36).slice(2, 10);
const FIFTHS_BY_NAME = Object.fromEntries(Object.entries(KEY_NAMES).map(([f, n]) => [n, +f]));

export function newSong(opts = {}) {
  const time = opts.time || { num: 4, den: 4 };
  const song = { id: uid(), title: opts.title || 'New song', composer: '', key: { fifths: opts.fifths ?? 0 }, time, pickup: 0, tempo: 120, measures: [], marks: {} };
  for (let k = 0; k < (opts.bars ?? 8); k++) song.measures.push(emptyMeasure(barTicks(song), time.num));
  return song;
}
export const barTicks = (song) => song.time.num * beatTicks(song.time.den);
export const barNumber = (song, m) => (song.pickup ? m : m + 1);          // pickup is bar 0

// cells (beats) of the whole song, for chords and playback
export function cellMap(song) {
  const start = [], ofCell = [];
  let c = 0;
  song.measures.forEach((meas, m) => {
    start.push(c);
    const beats = Math.round(meas.len / beatTicks(song.time.den));
    for (let k = 0; k < beats; k++) ofCell.push(m);
    c += beats;
  });
  return { start, ofCell, total: c };
}
export function chordCells(song) { return song.measures.flatMap((meas) => meas.ch); }
export const hasChords = (song) => song.measures.some((meas) => slotList(meas).some((x) => x.chord));

// ---------- chord slots ----------
// A bar's chord layer is a row of slots: one per beat (meas.ch[b]) unless the beat is divided.
//   meas.div[b] = 2 | 3 | 4  → beat b split into n slots (3 = an 8th-note triplet)
//   meas.div[b] = 't'        → quarter-note triplet: 3 slots over beats b and b+1 (b+1 has no slots of its own)
//   meas.sub[b][k]           → the chord in slot k ≥ 1 of beat b (slot 0 is meas.ch[b])
// A slot's position is in beats from the start of the bar.
export const DIVISIONS = [1, 2, 3, 4, 't'];
export function beatGrid(meas, b) {
  const d = meas.div && meas.div[b];
  if (d === 't') return { n: 3, span: 2, d };
  if (d > 1) return { n: d, span: 1, d };
  if (b > 0 && meas.div && meas.div[b - 1] === 't') return { n: 0, span: 0, d: 0 };     // inside a triplet
  return { n: 1, span: 1, d: 1 };
}
export const getSlot = (meas, b, k = 0) => (k === 0 ? meas.ch[b] || null : (meas.sub && meas.sub[b] && meas.sub[b][k]) || null);
export function setSlot(meas, b, k, c) {
  if (k === 0) { meas.ch[b] = c; return; }
  meas.sub = meas.sub || {};
  const a = (meas.sub[b] = meas.sub[b] || []);
  a[k] = c;
}
export function slotList(meas) {
  const out = [];
  for (let b = 0; b < meas.ch.length; b++) {
    const g = beatGrid(meas, b);
    for (let k = 0; k < g.n; k++) out.push({ b, k, pos: b + (k * g.span) / g.n, len: g.span / g.n, n: g.n, span: g.span, chord: getSlot(meas, b, k) });
  }
  return out;
}
// the slot covering a position (in beats)
export function slotAt(meas, pos) {
  let best = null;
  for (const x of slotList(meas)) if (x.pos <= pos + 1e-9) best = x;
  return best;
}
// change beat b's division. Chords keep their place when it still exists; others move to the nearest
// free slot in the beats that changed, or are dropped. Returns how many were dropped (-1 = not possible).
export function setDivision(meas, b, d) {
  const beats = meas.ch.length, old = meas.div ? { ...meas.div } : {};
  if (d === 't' && b >= beats - 1) return -1;
  if (beatGrid(meas, b).d === d) return 0;
  const chords = slotList(meas).filter((x) => x.chord).map((x) => ({ pos: x.pos, c: x.chord }));
  const div = { ...old };
  if (d === 't') delete div[b + 1];
  if (d === 1) delete div[b]; else div[b] = d;
  const hi = Math.min(beats, Math.max(b + (old[b] === 't' ? 2 : 1), b + (d === 't' ? 2 : 1), d === 't' && old[b + 1] === 't' ? b + 3 : 0));
  meas.div = div; meas.sub = {}; meas.ch = meas.ch.map(() => null);
  const slots = slotList(meas), free = new Set(slots.map((_, i) => i)), left = [];
  const put = (i, c) => { setSlot(meas, slots[i].b, slots[i].k, c); free.delete(i); };
  for (const x of chords) {
    const i = slots.findIndex((y) => Math.abs(y.pos - x.pos) < 1e-6);
    if (i >= 0 && free.has(i)) put(i, x.c); else left.push(x);
  }
  let dropped = 0;
  for (const x of left) {
    let best = -1, bd = Infinity;
    for (const i of free) { const y = slots[i], dd = Math.abs(y.pos - x.pos); if (y.pos >= b - 1e-9 && y.pos < hi - 1e-9 && dd < bd - 1e-9) { bd = dd; best = i; } }
    if (best >= 0) put(best, x.c); else dropped++;
  }
  tidySlots(meas);
  return dropped;
}
export function tidySlots(meas) {
  if (meas.div) for (const b of Object.keys(meas.div)) if (+b >= meas.ch.length || (meas.div[b] === 't' && +b >= meas.ch.length - 1)) delete meas.div[b];
  if (meas.sub) for (const b of Object.keys(meas.sub)) {
    const g = beatGrid(meas, +b), a = meas.sub[b];
    if (g.n < 2 || !a || !a.some((c, k) => k > 0 && k < g.n && c)) delete meas.sub[b];
    else { a.length = g.n; a[0] = null; for (let k = 1; k < g.n; k++) a[k] = a[k] || null; }
  }
  for (let b = 0; b < meas.ch.length; b++) if (beatGrid(meas, b).n === 0) meas.ch[b] = null;
  if (meas.div && !Object.keys(meas.div).length) delete meas.div;
  if (meas.sub && !Object.keys(meas.sub).length) delete meas.sub;
}
export function copyChords(from, to, clone = (c) => c) {
  to.ch = Array.from({ length: to.ch.length }, (_, b) => (from.ch[b] ? clone(from.ch[b]) : null));
  delete to.div; delete to.sub;
  if (from.div) to.div = { ...from.div };
  if (from.sub) { to.sub = {}; for (const [b, a] of Object.entries(from.sub)) to.sub[b] = a.map((c) => (c ? clone(c) : null)); }
  tidySlots(to);
  return to;
}
export function mapChords(meas, fn) {
  meas.ch = meas.ch.map((c) => (c ? fn(c) : c));
  if (meas.sub) for (const b of Object.keys(meas.sub)) meas.sub[b] = meas.sub[b].map((c) => (c ? fn(c) : c));
}
// fill a bar from parsed chord cells: one entry per beat (chord or null), or a group {span, items}
export function fillChords(meas, cells) {
  const beats = meas.ch.length;
  meas.ch = meas.ch.map(() => null); delete meas.div; delete meas.sub;
  const explicit = cells.some((c) => c === null || (c && c.items));
  if (!explicit) { cells.forEach((c, j) => { const b = Math.floor((j * beats) / cells.length); if (c && b < beats && !meas.ch[b]) meas.ch[b] = c; }); return; }
  let b = 0;
  for (const c of cells) {
    if (b >= beats) break;
    if (c && c.items) {
      const d = c.span === 2 ? 't' : c.items.length;
      if (setDivision(meas, b, d) < 0) { meas.ch[b] = c.items.find(Boolean) || null; b++; continue; }
      c.items.forEach((x, k) => { if (x) setSlot(meas, b, k, x); });
      b += c.span;
    } else { meas.ch[b] = c; b++; }
  }
  tidySlots(meas);
}

// play order of cells (repeats unrolled), optionally restricted to bars lo..hi
export function playOrder(song, lo = null, hi = null) {
  const cm = cellMap(song);
  const bars = unrollBars(song.measures.length, song.marks);
  const sel = lo == null ? bars : bars.filter((m) => m >= lo && m <= hi);
  const useBars = sel.length ? sel : Array.from({ length: hi - lo + 1 }, (_, k) => lo + k);
  const order = [];
  for (const m of useBars) for (let k = 0; k < song.measures[m].ch.length; k++) order.push(cm.start[m] + k);
  return order;
}

// ---------- text format ----------
const cellText = (c) => (c ? chordText(c).replace(/,\s+/g, ',') : '.');
export function barChordText(meas) {
  const out = [];
  for (let b = 0; b < meas.ch.length; b++) {
    const g = beatGrid(meas, b);
    if (g.n === 1) out.push(cellText(meas.ch[b]));
    else if (g.n > 1) out.push(`${g.span === 2 ? '2' : ''}[${Array.from({ length: g.n }, (_, k) => cellText(getSlot(meas, b, k))).join(' ')}]`);
  }
  return out.join(' ');
}
export function songToText(song) {
  const head = [
    `Title: ${song.title}`, `Composer: ${song.composer || ''}`, `Key: ${KEY_NAMES[song.key.fifths]}`,
    `Time: ${song.time.num}/${song.time.den}`, `Pickup: ${song.pickup || 0}`, `Tempo: ${song.tempo || 120}`,
  ];
  if (song.chartOnly) head.push('Type: chord chart');
  const chords = [];
  let line = '', closed = false;
  song.measures.forEach((meas, m) => {
    const mk = song.marks[m] || {};
    line += (mk.start ? '{ ' : closed ? '' : '| ') + (mk.ending ? `N${mk.ending} ` : '') + barChordText(meas) + ' ';
    closed = !!mk.end;
    if (mk.end) line += (mk.end > 2 ? `}x${mk.end}` : '}') + ' ';
    const lineBreak = (m + 1 - (song.pickup ? 1 : 0)) % 4 === 0;
    if (lineBreak || m === song.measures.length - 1) { chords.push((line + (closed ? '' : '|')).trim()); line = ''; closed = false; }
  });
  const melody = [];
  for (let m = 0; m < song.measures.length; m += 4) melody.push(melodyText(song, m, Math.min(m + 4, song.measures.length)) + ' |');
  return [...head, 'Chords:', ...chords, ...(song.chartOnly ? [] : ['Melody:', ...melody])].join('\n');
}

// Chords section: bars split by "|", "{" (repeat start) and "}" / "}x3" (repeat end); "N1".."N3" endings;
// one token per beat ("." = no new chord). A beat can hold a group: [C F] (halves), [C D E] (8th-note
// triplet), [C . F .] (quarters of the beat), 2[C D E] (quarter-note triplet over two beats). Also reads
// Chord Pad's export.
export function parseChordBars(text) {
  const bars = [];
  let cur = null;
  const open = () => { if (!cur) { cur = { cells: [], mark: {} }; } };
  const endGroup = (g) => {
    const n = g.items.length;
    if (!((g.span === 1 && n >= 2 && n <= 4) || (g.span === 2 && n === 3))) throw new Error(`${g.raw}… — use [a b], [a b c], [a b c d] or 2[a b c]`);
    open();
    if (g.items.every((x) => !x)) { for (let k = 0; k < g.span; k++) cur.cells.push(null); return; }
    cur.cells.push({ span: g.span, items: g.items });
  };
  const close = () => { if (cur) { bars.push(cur); cur = null; } };
  const toks = text.replace(/\|/g, ' | ').replace(/\{/g, ' { ').replace(/\}/g, ' }').split(/\s+/).filter(Boolean);
  // re-join tokens split inside brackets
  const joined = []; let buf = '';
  for (const t of toks) { buf = buf ? buf + ' ' + t : t; if ((buf.match(/\(/g) || []).length === (buf.match(/\)/g) || []).length) { joined.push(buf); buf = ''; } }
  let group = null;
  const tok = (t) => (t === '.' ? null : parseChord(t));
  for (const t0 of joined) {
    let t = t0, m;
    if (group) {
      const end = t.endsWith(']');
      if (end) t = t.slice(0, -1);
      if (t) group.items.push(tok(t));
      if (end) { endGroup(group); group = null; }
      continue;
    }
    if ((m = /^(\d)?\[(.*)$/.exec(t))) {
      group = { span: m[1] ? +m[1] : 1, items: [], raw: t0 };
      let rest = m[2];
      const end = rest.endsWith(']');
      if (end) rest = rest.slice(0, -1);
      if (rest) group.items.push(tok(rest));
      if (end) { endGroup(group); group = null; }
      continue;
    }
    if (t === '|') { close(); continue; }
    if (t === '{') { close(); open(); cur.mark.start = true; continue; }
    if ((m = /^\}(?:x(\d+))?$/.exec(t))) { if (cur) { cur.mark.end = m[1] ? +m[1] : 2; close(); } continue; }
    if ((m = /^N([1-3])$/.exec(t))) { open(); cur.mark.ending = +m[1]; continue; }
    open();
    cur.cells.push(t === '.' ? null : parseChord(t));
  }
  close();
  return bars.filter((b) => b.cells.length || b.mark.start || b.mark.end || b.mark.ending);
}

export function songFromText(text) {
  const song = newSong({ bars: 0 });
  const lines = text.split('\n');
  let section = null; const chordLines = [], melodyLines = [];
  for (const raw of lines) {
    const line = raw.trim();
    let m;
    if (!line) continue;
    if (/^chords:\s*$/i.test(line)) { section = 'c'; continue; }
    if (/^melody:\s*$/i.test(line)) { section = 'm'; continue; }
    if (section === 'c') { chordLines.push(line); continue; }
    if (section === 'm') { melodyLines.push(line); continue; }
    if ((m = /^title:\s*(.*)$/i.exec(line))) song.title = m[1];
    else if (/^type:\s*chord chart\s*$/i.test(line)) song.chartOnly = true;
    else if ((m = /^composer:\s*(.*)$/i.exec(line))) song.composer = m[1];
    else if ((m = /^key:\s*(\S+)/i.exec(line))) { const f = FIFTHS_BY_NAME[m[1].replace('♭', 'b').replace('♯', '#')]; if (f !== undefined) song.key.fifths = f; }
    else if ((m = /^time:\s*(\d+)\s*\/\s*(\d+)/i.exec(line))) song.time = { num: +m[1], den: +m[2] };
    else if ((m = /^pickup:\s*(\d+)/i.exec(line))) song.pickup = +m[1];
    else if ((m = /^tempo:\s*(\d+)/i.exec(line))) song.tempo = +m[1];
  }
  const cbars = parseChordBars(chordLines.join(' '));
  const mbars = melodyLines.length ? parseMelody(melodyLines.join(' '), song) : [];
  const nBars = Math.max(cbars.length, mbars.length, 1);
  const bt = beatTicks(song.time.den);
  for (let k = 0; k < nBars; k++) {
    const beats = k === 0 && song.pickup ? song.pickup : song.time.num;
    const meas = emptyMeasure(beats * bt, beats);
    const cb = cbars[k];
    if (cb) { fillChords(meas, cb.cells); if (Object.keys(cb.mark).length) song.marks[k] = cb.mark; }
    song.measures.push(meas);
  }
  if (mbars.length) setMelody(song, mbars, 0);
  return song;
}

// storage: compact JSON (chords and melody as text per bar)
export function serialiseSong(song) {
  return {
    id: song.id, title: song.title, composer: song.composer, key: song.key, time: song.time, pickup: song.pickup, tempo: song.tempo,
    ...(song.chartOnly ? { chartOnly: true } : {}), marks: song.marks, bars: song.measures.map((meas, m) => {
      const o = { c: meas.ch.map(chordStore), n: melodyText(song, m, m + 1) };
      if (meas.div) o.d = { ...meas.div };
      if (meas.sub) { o.s = {}; for (const [b, a] of Object.entries(meas.sub)) o.s[b] = a.map(chordStore); }
      return o;
    }),
  };
}
const chordStore = (c) => (c ? chordText(c) + (c.auto7 ? '~' : '') : '');
const chordLoad = (t) => {
  if (!t) return null;
  try { const auto = t.endsWith('~'); const c = parseChord(auto ? t.slice(0, -1) : t); if (auto) c.auto7 = true; return c; } catch (e) { return null; }
};
export function deserialiseSong(o) {
  const song = newSong({ bars: 0 });
  Object.assign(song, { id: o.id || uid(), title: o.title || 'Untitled', composer: o.composer || '', key: o.key || { fifths: 0 }, time: o.time || { num: 4, den: 4 }, pickup: o.pickup || 0, tempo: o.tempo || 120, marks: o.marks || {}, chartOnly: !!o.chartOnly });
  const bt = beatTicks(song.time.den);
  (o.bars || []).forEach((b, k) => {
    const beats = k === 0 && song.pickup ? song.pickup : song.time.num;
    const meas = emptyMeasure(beats * bt, beats);
    meas.ch = Array.from({ length: beats }, (_, j) => chordLoad((b.c || [])[j]));
    if (b.d) meas.div = { ...b.d };
    if (b.s) { meas.sub = {}; for (const [j, a] of Object.entries(b.s)) meas.sub[j] = a.map(chordLoad); }
    tidySlots(meas);
    song.measures.push(meas);
    try { if (b.n) setMelody(song, parseMelody(b.n, song), k); } catch (e) { meas.ev = restsFor(0, meas.len, true); }
  });
  if (!song.measures.length) song.measures.push(emptyMeasure(barTicks(song), song.time.num));
  return song;
}
export { TPQ };
