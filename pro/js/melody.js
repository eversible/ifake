// melody.js — melody model for the lead sheet: exact durations in ticks, MuseScore-style overwrite
// entry (bars always stay full; rests fill gaps), ties, tuplets, and a compact text format.
//
// Event  { r: true } rest, or { p: { l, a, o } } note (letter 0–6 = C–B, accidental, octave; C4 = middle C)
//        plus b (1 whole … 64 sixty-fourth), d (dots 0–2), tie (tied to the next note),
//        tup { n, m, id } (n notes in the time of m, e.g. a triplet is 3:2)
// Measure { len: ticks, ev: [Event], ch: [chord | null per beat] }

export const TPQ = 10080;                                  // ticks per quarter (divisible by 3, 5, 7, 9)
export const BASES = [1, 2, 4, 8, 16, 32, 64];
export const TUPLET_RATIO = { 2: 3, 3: 2, 4: 3, 5: 4, 6: 4, 7: 4, 9: 8 };   // n -> m
export const baseTicks = (b) => (TPQ * 4) / b;
export const dotted = (t, d) => (d === 1 ? (t * 3) / 2 : d === 2 ? (t * 7) / 4 : t);
export const nominal = (ev) => dotted(baseTicks(ev.b), ev.d || 0);
export const evTicks = (ev) => (ev.tup ? (nominal(ev) * ev.tup.m) / ev.tup.n : nominal(ev));
export const beatTicks = (den) => (TPQ * 4) / den;

const NAT_PC = [0, 2, 4, 5, 7, 9, 11];
export const LETTERS = 'CDEFGAB';
export const midiOf = (p) => 12 * (p.o + 1) + NAT_PC[p.l] + p.a;
const mod = (a, n) => ((a % n) + n) % n;
let tupSeq = 1;
const newTupId = () => 't' + (tupSeq++) + Math.random().toString(36).slice(2, 5);
export const clonePitch = (p) => (p ? { l: p.l, a: p.a, o: p.o } : null);
export const cloneEv = (e) => ({ ...e, p: clonePitch(e.p), tup: e.tup ? { ...e.tup } : null });

// ---------- key signatures ----------
const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6];   // F C G D A E B
const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3];    // B E A D G C F
export function keyAccidental(fifths, letter) {
  if (fifths > 0) return SHARP_ORDER.slice(0, fifths).includes(letter) ? 1 : 0;
  if (fifths < 0) return FLAT_ORDER.slice(0, -fifths).includes(letter) ? -1 : 0;
  return 0;
}
export const KEY_NAMES = { '-7': 'Cb', '-6': 'Gb', '-5': 'Db', '-4': 'Ab', '-3': 'Eb', '-2': 'Bb', '-1': 'F', 0: 'C', 1: 'G', 2: 'D', 3: 'A', 4: 'E', 5: 'B', 6: 'F#', 7: 'C#' };

// spell a MIDI note for this key: diatonic notes as in the key, others with flats in flat keys, sharps otherwise
export function spellMidi(midi, fifths) {
  const pc = mod(midi, 12);
  for (let l = 0; l < 7; l++) {
    const a = keyAccidental(fifths, l);
    if (mod(NAT_PC[l] + a, 12) === pc) return { l, a, o: Math.floor((midi - NAT_PC[l] - a) / 12) - 1 };
  }
  const useFlat = fifths < 0;
  for (let l = 0; l < 7; l++) {
    const a = useFlat ? -1 : 1;
    if (mod(NAT_PC[l] + a, 12) === pc) return { l, a, o: Math.floor((midi - NAT_PC[l] - a) / 12) - 1 };
  }
  return null;
}
export function respell(p, dir) {   // move to the neighbouring letter, same pitch
  const midi = midiOf(p);
  const l = mod(p.l + dir, 7);
  for (let o = p.o - 1; o <= p.o + 1; o++) { const a = midi - (12 * (o + 1) + NAT_PC[l]); if (Math.abs(a) <= 2) return { l, a, o }; }
  return p;
}

// ---------- rests that fill a gap neatly (largest values that start on their own grid) ----------
export function restsFor(pos, len, wholeBar) {
  if (wholeBar) return [{ r: true, b: 1, d: 0, tie: false, tup: null, whole: true }];
  const out = [];
  let p = pos, left = len;
  while (left > 0) {
    let pick = null;
    for (const b of BASES) {
      const t = baseTicks(b);
      if (t <= left && p % t === 0) { pick = { b, d: 0, t }; break; }
    }
    if (!pick) {                       // off-grid remainder: largest value that fits
      for (const b of BASES) { const t = baseTicks(b); if (t <= left) { pick = { b, d: 0, t }; break; } }
    }
    if (!pick) break;                  // smaller than a 64th (only with odd tuplets): give up
    out.push({ r: true, b: pick.b, d: pick.d, tie: false, tup: null });
    p += pick.t; left -= pick.t;
  }
  return out;
}

// one duration as written values tied together, following the beat grid like printed music:
// from beat 1.75, 3 beats = sixteenth ~ half ~ dotted eighth (not half ~ sixteenth ...)
export function splitDuration(len, pos = 0) {
  const out = [];
  let left = len, p = pos;
  while (left > 0) {
    let pick = null, loose = null;
    for (const b of BASES) {
      for (const d of [0, 1]) {
        const t = dotted(baseTicks(b), d);
        if (t > left) continue;
        // plain values on their own grid; dotted values only where they start a pair (dotted quarter on beats 1 and 3)
        const onGrid = d === 0 ? p % t === 0 : p % (2 * baseTicks(b)) === 0;
        if (onGrid && (!pick || t > pick.t)) pick = { b, d, t };
        if (d === 0 && (!loose || t > loose.t)) loose = { b, d, t };
      }
    }
    pick = pick || loose;
    if (!pick) break;
    out.push({ b: pick.b, d: pick.d });
    left -= pick.t; p += pick.t;
  }
  return out;
}

// ---------- positions ----------
export function positions(meas) {
  let t = 0;
  return meas.ev.map((e) => { const s = t; t += evTicks(e); return { e, start: s, end: t }; });
}
// tuplet groups and single events as blocks
function blocks(meas) {
  const out = [];
  for (const x of positions(meas)) {
    const last = out[out.length - 1];
    if (x.e.tup && last && last.tup === x.e.tup.id) { last.items.push(x.e); last.end = x.end; }
    else out.push({ tup: x.e.tup ? x.e.tup.id : null, items: [x.e], start: x.start, end: x.end });
  }
  return out;
}
export const measureFull = (meas) => Math.abs(positions(meas).reduce((s, x) => Math.max(s, x.end), 0) - meas.len) < 1;

// replace [pos, pos+len) of a measure with newEvs (top level). Tuplet groups that overlap go entirely.
function replaceSpan(meas, pos, len, newEvs) {
  const bl = blocks(meas);
  const before = [], after = [];
  let lo = pos, hi = pos + len;
  for (const b of bl) {
    if (b.end <= pos) before.push(...b.items);
    else if (b.start >= pos + len) after.push(...b.items);
    else { lo = Math.min(lo, b.start); hi = Math.max(hi, b.end); }
  }
  const whole = meas.len;
  meas.ev = [...before, ...restsFor(lo, pos - lo, false), ...newEvs, ...restsFor(pos + len, hi - pos - len, false), ...after];
  if (meas.ev.every((e) => e.r && !e.tup)) meas.ev = restsFor(0, whole, true);
}

// ---------- song helpers ----------
export function emptyMeasure(len, beats) { return { len, ev: restsFor(0, len, true), ch: new Array(beats).fill(null) }; }
export const measureBeats = (song, m) => Math.round(song.measures[m].len / beatTicks(song.time.den));
export const barLen = (song) => song.time.num * beatTicks(song.time.den);
function ensureMeasure(song, m) { while (song.measures.length <= m) song.measures.push(emptyMeasure(barLen(song), song.time.num)); }

// cursor: { m, pos } — where the next entry goes. Returns the event index at a position (or -1).
export function eventAt(song, m, pos) {
  const ps = positions(song.measures[m]);
  return ps.findIndex((x) => Math.abs(x.start - pos) < 1);
}
export function normCursor(song, c) {
  let { m, pos } = c;
  while (m < song.measures.length && pos >= song.measures[m].len - 0.5) { pos -= song.measures[m].len; m++; }
  if (m >= song.measures.length) { ensureMeasure(song, m); pos = 0; }
  // snap into an event start (cursor inside an event moves to its start)
  const ps = positions(song.measures[m]);
  const hit = ps.find((x) => pos >= x.start - 0.5 && pos < x.end - 0.5);
  return { m, pos: hit ? hit.start : 0 };
}

// Enter a note (pitch) or rest (pitch null) at the cursor with duration {b, d}; tuplet: n or 0.
// Returns { cursor (after the entry), sel: { m, i } (the first written event) }.
export function enter(song, cursor, pitch, dur, tupletN = 0) {
  let c = normCursor(song, cursor);
  let meas = song.measures[c.m];
  let idx = eventAt(song, c.m, c.pos);
  let target = meas.ev[idx];

  // start a new tuplet group here if tuplet mode is on and we're not already inside one
  if (tupletN && !(target && target.tup)) {
    const mRatio = TUPLET_RATIO[tupletN] || 2;
    const groupLen = baseTicks(dur.b) * mRatio;
    if (c.pos + groupLen > meas.len + 0.5) return { error: 'The tuplet doesn\'t fit in the rest of this bar' };
    const id = newTupId();
    const slots = Array.from({ length: tupletN }, () => ({ r: true, b: dur.b, d: 0, tie: false, tup: { n: tupletN, m: mRatio, id } }));
    replaceSpan(meas, c.pos, groupLen, slots);
    idx = eventAt(song, c.m, c.pos); target = meas.ev[idx];
  }

  if (target && target.tup) return enterInGroup(song, c, idx, pitch, dur);

  // top level: overwrite forward, splitting across bar lines with ties
  let left = dotted(baseTicks(dur.b), dur.d || 0);
  let first = null, prevPiece = null, m = c.m, pos = c.pos;
  while (left > 0.5) {
    ensureMeasure(song, m);
    meas = song.measures[m];
    const take = Math.min(left, meas.len - pos);
    const pieces = (take === dotted(baseTicks(dur.b), dur.d || 0) ? [{ b: dur.b, d: dur.d || 0 }] : splitDuration(take, pos))
      .map((x) => ({ r: !pitch, p: clonePitch(pitch), b: x.b, d: x.d, tie: false, tup: null }));
    if (pitch) pieces.forEach((x, k) => { x.tie = k < pieces.length - 1; });
    if (prevPiece && pitch) prevPiece.tie = true;
    replaceSpan(meas, pos, take, pieces);
    if (!first) first = { m, i: eventAt(song, m, pos) };
    prevPiece = pieces[pieces.length - 1];
    left -= take; pos += take;
    if (left > 0.5) { m++; pos = 0; }
  }
  return { cursor: normCursor(song, { m, pos }), sel: first };
}

// overwrite inside a tuplet group, in nominal (unscaled) time; clipped to the group's end
function enterInGroup(song, c, idx, pitch, dur) {
  const meas = song.measures[c.m];
  const id = meas.ev[idx].tup.id;
  const tup = { ...meas.ev[idx].tup };
  const gi = meas.ev.map((e, k) => (e.tup && e.tup.id === id ? k : -1)).filter((k) => k >= 0);
  const g0 = gi[0], g1 = gi[gi.length - 1];
  const group = meas.ev.slice(g0, g1 + 1);
  let off = 0; for (let k = g0; k < idx; k++) off += nominal(meas.ev[k]);
  const gLen = group.reduce((s, e) => s + nominal(e), 0);
  let len = Math.min(dotted(baseTicks(dur.b), dur.d || 0), gLen - off);
  const pieces = (len === dotted(baseTicks(dur.b), dur.d || 0) ? [{ b: dur.b, d: dur.d || 0 }] : splitDuration(len, off))
    .map((x) => ({ r: !pitch, p: clonePitch(pitch), b: x.b, d: x.d, tie: false, tup: { ...tup } }));
  if (pitch) pieces.forEach((x, k) => { x.tie = k < pieces.length - 1; });
  // rebuild the group: keep events before off, new pieces, rests to the next boundary, events after
  const out = []; let t = 0, hi = off + len;
  for (const e of group) {
    const s = t, en = t + nominal(e); t = en;
    if (en <= off + 0.5) out.push(e);
    else if (s >= off + len - 0.5) { if (s >= hi - 0.5) out.push(e); }
    else hi = Math.max(hi, en);
  }
  const fill = restsFor(off + len, hi - off - len, false).map((r) => ({ ...r, tup: { ...tup } }));
  const beforeN = group.filter((e, k) => { let s = 0; for (let j = 0; j < k; j++) s += nominal(group[j]); return s + nominal(e) <= off + 0.5; }).length;
  const newGroup = [...out.slice(0, beforeN), ...pieces, ...fill, ...out.slice(beforeN)];
  meas.ev.splice(g0, g1 - g0 + 1, ...newGroup);
  const sel = { m: c.m, i: g0 + beforeN };
  // cursor: after the pieces
  let pos = 0; for (let k = 0; k < sel.i + pieces.length; k++) pos += evTicks(meas.ev[k]);
  return { cursor: normCursor(song, { m: c.m, pos }), sel };
}

// Delete: a note becomes a rest of the same length; a tuplet group of only rests collapses
export function toRest(song, sel) {
  const meas = song.measures[sel.m];
  const e = meas.ev[sel.i];
  if (!e) return;
  // a tie into this note (from the previous note, possibly in the previous bar) goes too
  if (sel.i > 0) meas.ev[sel.i - 1].tie = false;
  else if (sel.m > 0) { const prev = song.measures[sel.m - 1].ev; if (prev.length) prev[prev.length - 1].tie = false; }
  e.r = true; e.p = null; e.tie = false;
  if (e.tup) {
    const g = meas.ev.filter((x) => x.tup && x.tup.id === e.tup.id);
    if (g.every((x) => x.r)) {
      const ps = positions(meas).filter((x) => x.e.tup && x.e.tup.id === e.tup.id);
      replaceSpan(meas, ps[0].start, ps[ps.length - 1].end - ps[0].start, restsFor(ps[0].start, ps[ps.length - 1].end - ps[0].start, false));
    }
  }
  // merge a bar of rests back into one whole-bar rest
  if (meas.ev.every((x) => x.r && !x.tup)) meas.ev = restsFor(0, meas.len, true);
}

// ---------- text format ----------
// Bars separated by "|". Event: <value><dots>:<pitch or r>[~]  e.g. 8:Bb4  4.:F#5~  16:r  1:r
// Tuplet: 3[8:C5 8:D5 8:Eb5]  (n notes in the time of m; m defaults: 3→2, 5→4, 6→4, 7→4; or 5:4[...])
const PITCH_RE = /^([A-G])(bb|b|n|##|#|x|𝄫|♭|♮|♯|𝄪)?(-?\d)$/;
const ACC = { bb: -2, b: -1, n: 0, '##': 2, '#': 1, x: 2, '𝄫': -2, '♭': -1, '♮': 0, '♯': 1, '𝄪': 2 };
export function parsePitch(s) {
  const m = PITCH_RE.exec(s);
  if (!m) throw new Error(`invalid pitch "${s}"`);
  return { l: LETTERS.indexOf(m[1]), a: m[2] ? ACC[m[2]] : 0, o: +m[3] };
}
const ACC_TXT = { '-2': 'bb', '-1': 'b', 0: '', 1: '#', 2: '##' };
export const pitchText = (p) => LETTERS[p.l] + ACC_TXT[p.a] + p.o;
const ACC_SYM = { '-2': '𝄫', '-1': '♭', 0: '', 1: '♯', 2: '𝄪' };
export const pitchName = (p) => LETTERS[p.l] + ACC_SYM[p.a] + p.o;

function parseEvent(tok, tup) {
  const m = /^(1|2|4|8|16|32|64)(\.{0,2}):([^~]+)(~?)$/.exec(tok);
  if (!m) throw new Error(`can't read "${tok}" (e.g. 8:Bb4, 4.:r, 2:C5~)`);
  const rest = m[3] === 'r';
  return { r: rest, p: rest ? null : parsePitch(m[3]), b: +m[1], d: m[2].length, tie: !!m[4], tup };
}

// parse bars of melody; key (fifths) only matters for pitches written without accidentals —
// here pitches are always absolute (Bb4 = B flat), as in the export
export function parseMelody(text, song) {
  const bars = text.split('|').map((b) => b.trim()).filter((b, k, arr) => b.length || (k > 0 && k < arr.length - 1));
  const out = [];
  bars.forEach((bt, k) => {
    const ev = [];
    const re = /(\d)(?::(\d))?\[([^\]]*)\]|(\S+)/g;
    let mm;
    while ((mm = re.exec(bt))) {
      if (mm[3] !== undefined) {
        const n = +mm[1], m = mm[2] ? +mm[2] : TUPLET_RATIO[n];
        const id = newTupId();
        mm[3].trim().split(/\s+/).forEach((t) => ev.push(parseEvent(t, { n, m, id })));
      } else ev.push(parseEvent(mm[4], null));
    }
    out.push(ev);
  });
  return out;
}

export function melodyText(song, from = 0, to = song.measures.length) {
  const bars = [];
  for (let m = from; m < to; m++) {
    const parts = [];
    let curTup = null, group = [];
    const flush = () => { if (curTup) { parts.push(`${curTup.n}${TUPLET_RATIO[curTup.n] === curTup.m ? '' : ':' + curTup.m}[${group.join(' ')}]`); curTup = null; group = []; } };
    for (const e of song.measures[m].ev) {
      const tok = `${e.b}${'.'.repeat(e.d || 0)}:${e.r ? 'r' : pitchText(e.p)}${e.tie ? '~' : ''}`;
      if (e.tup) { if (!curTup || curTup.id !== e.tup.id) { flush(); curTup = e.tup; } group.push(tok); }
      else { flush(); parts.push(tok); }
    }
    flush();
    bars.push(parts.join(' '));
  }
  return bars.join(' | ');
}

// put parsed bars into measures starting at measure `at`; each bar must fill its measure exactly
export function setMelody(song, bars, at = 0) {
  bars.forEach((ev, k) => {
    const m = at + k;
    ensureMeasure(song, m);
    const meas = song.measures[m];
    const total = ev.reduce((s, e) => s + evTicks(e), 0);
    if (Math.abs(total - meas.len) > 0.5) {
      const beats = (x) => +(x / beatTicks(song.time.den)).toFixed(3);
      throw new Error(`bar ${m + (song.pickup ? 0 : 1)} has ${beats(total)} beats of notes; it needs ${beats(meas.len)}`);
    }
    meas.ev = ev.length === 1 && ev[0].r && ev[0].b === 1 ? restsFor(0, meas.len, true) : ev;
  });
}

// ---------- playback: notes with ties merged ----------
// returns [{ m, start (ticks in measure), ticks (merged length), midi, ev }]
export function playableNotes(song) {
  const out = [];
  let open = null;
  song.measures.forEach((meas, m) => {
    for (const x of positions(meas)) {
      const e = x.e;
      if (e.r) { open = null; continue; }
      const midi = midiOf(e.p);
      if (open && open.midi === midi) { open.ticks += x.end - x.start; }
      else { open = { m, start: x.start, ticks: x.end - x.start, midi, ev: e }; out.push(open); }
      if (!e.tie) open = null;
    }
  });
  return out;
}
