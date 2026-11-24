// app.js — Chord Pad UI: chart grid, chord keyboard, text entry, transport, settings, chart library.
import {
  LETTERS, accStr, note, noteName, parseChord, chordText, chordNotes, chordIntervals, ivlName, ivlSemis,
  qualityText, extName, NC, toggleQual, toggleExt, hasExt, parseInterval, transposeChord, enharmonic, cloneChord, notePC,
} from './chords.js';
import { voiceChord, VOICINGS } from './voicing.js';
import { AudioEngine, Sequencer, SYNTHS, COMP_PATTERNS, BASS_PATTERNS } from './audio.js';
import { Store } from './store.js';
import { unrollBars, barsToCells, shiftMarks } from './form.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);

// ---------------------------------------------------------------- defaults
const DEFAULT_SETTINGS = {
  tempo: 120, loop: true, chordInst: 'piano', bassInst: 'upbass', compPattern: 'block', bassPattern: 'off',
  voicing: 'smooth', swing: 0, click: false, countIn: 0, reverb: 0.15,
  volChord: 0.8, volBass: 0.8, volClick: 0.5, audition: true,
};
const DEMO = {
  title: 'ii–V–I workout',
  text: [
    'Cells: 16/line, 4/bar',
    '| D-7 . G7 . | CΔ7 . . . | E-7 . A7(♭9) . | D-7 . G7 . |',
    '| E♭-7 . A♭7 . | D♭Δ7 . . . | C-7 . F7 . | B♭Δ7 . . . |',
    '| . . . . | . . . . | . . . . | . . . . |',
    '| . . . . | . . . . | . . . . | . . . . |',
  ],
};

// ---------------------------------------------------------------- state
const S = {
  settings: { ...DEFAULT_SETTINGS },
  settingsAt: 0,
  charts: [],            // serialised charts (each with updatedAt)
  deleted: {},           // id -> time deleted (so other devices don't bring it back)
  chart: null,           // { id, title, cpl, bpb, cells: [chord|null] }
  sel: { a: 0, b: 0 },
  bassMode: false,
  target: 'root',        // which note ♭/♯/⇄ act on
  undo: [], redo: [],
  clip: null,
  tl: null,              // timeline cache
  auditionVoices: [],
  playRange: null,       // range the sequencer is (or will be) looping
};

const engine = new AudioEngine('samples/');
const seq = new Sequencer(engine, () => timeline(), () => playSettings(), () => {});
const store = new Store((merged) => applyExternal(merged));

// split on spaces, but not inside brackets: "G7(♭9, ♯11) C" -> ["G7(♭9, ♯11)", "C"]
function splitTokens(s) {
  const out = []; let buf = '', depth = 0;
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (/\s/.test(ch) && depth === 0) { if (buf) out.push(buf); buf = ''; } else buf += ch;
  }
  if (buf) out.push(buf);
  return out;
}
const compactText = (c) => chordText(c).replace(/,\s+/g, ',');

// ---------------------------------------------------------------- chart (de)serialisation
// Text format: "|" bar line, "{" repeat start, "}" repeat end ("}x3" = play 3 times), "N1"/"N2"/"N3" endings, "." empty beat
function chartToText(ch) {
  const lines = [`Title: ${ch.title}`, `Cells: ${ch.cpl}/line, ${ch.bpb}/bar`];
  const marks = ch.marks || {};
  for (let l = 0; l < ch.cells.length; l += ch.cpl) {
    let s = '', closed = false;
    for (let i = l; i < l + ch.cpl; i += ch.bpb) {
      const m = marks[i / ch.bpb] || {}, under = (marks[i / ch.bpb - 1] || {}).sim === 'two';
      s += (m.start ? '{ ' : closed ? '' : '| ') + (m.ending ? `N${m.ending} ` : '');
      // repeat signs: "%" (the bar before), "%%" (the two bars before; the next bar is left empty), "C7 % ." (half)
      if (m.sim === 'bar') s += '% ';
      else if (m.sim === 'two') s += '%% ';
      else if (under) s += '';
      else for (let k = i; k < Math.min(i + ch.bpb, l + ch.cpl); k++) {
        s += (m.sim === 'half' && k - i === ch.bpb / 2 ? '%' : ch.cells[k] ? compactText(ch.cells[k]) : '.') + ' ';
      }
      closed = !!m.end;
      if (m.end) s += (m.end > 2 ? `}x${m.end}` : '}') + ' ';
    }
    lines.push(s + (closed ? '' : '|'));
  }
  return lines.join('\n').replace(/ +$/gm, '');
}

function textToChart(text) {
  const ch = { id: uid(), title: 'Imported', cpl: 16, bpb: 4, cells: [], marks: {} };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    let m;
    if ((m = /^title:\s*(.*)$/i.exec(line))) { ch.title = m[1] || 'Imported'; continue; }
    if ((m = /^cells:\s*(\d+)\s*\/\s*line\s*,\s*(\d+)\s*\/\s*bar/i.exec(line))) { ch.cpl = +m[1]; ch.bpb = +m[2]; continue; }
    if (!/^[|{]/.test(line)) continue;
    for (const tok of splitTokens(line.replace(/\|/g, ' ').replace(/\{/g, ' { ').replace(/\}/g, ' }'))) {
      const bar = Math.floor(ch.cells.length / ch.bpb);
      let m;
      if (tok === '{') { (ch.marks[bar] = ch.marks[bar] || {}).start = true; continue; }
      if ((m = /^\}(?:x(\d+))?$/.exec(tok))) { const b = Math.floor((ch.cells.length - 1) / ch.bpb); if (b >= 0) (ch.marks[b] = ch.marks[b] || {}).end = m[1] ? +m[1] : 2; continue; }
      if ((m = /^N([1-3])$/.exec(tok))) { (ch.marks[bar] = ch.marks[bar] || {}).ending = +m[1]; continue; }
      if (tok === '%' || tok === '%%') {
        const at = ch.cells.length % ch.bpb;
        const kind = tok === '%%' ? 'two' : at === 0 ? 'bar' : 'half';
        (ch.marks[bar] = ch.marks[bar] || {}).sim = kind;
        const n = kind === 'two' ? 2 * ch.bpb : kind === 'bar' ? ch.bpb : 1;
        for (let k = 0; k < n; k++) ch.cells.push(null);
        continue;
      }
      ch.cells.push(tok === '.' ? null : impliedSeven(parseChord(tok)));
    }
  }
  // sanity-check the layout: 2–8 beats per bar, whole bars on each line
  if (!(ch.bpb >= 2 && ch.bpb <= 8)) ch.bpb = 4;
  if (!(ch.cpl >= ch.bpb * 2 && ch.cpl <= 32 && ch.cpl % ch.bpb === 0)) ch.cpl = ch.bpb * 4;
  padCells(ch);
  return ch;
}

// in this app Δ, ø and alt bring their 7 with them: a text chart's "CΔ7" is that implied 7
function impliedSeven(c) { if (c && c.quals.includes('dom7') && c.quals.some((q) => q === 'maj' || q === 'hdim' || q === 'alt')) c.auto7 = true; return c; }
// cells are saved as chord text; a trailing "~" marks a 7 that is only implied by Δ / ø / alt
const cellText = (c) => (c ? chordText(c) + (c.auto7 ? '~' : '') : '');
const parseCell = (t) => { const auto = t.endsWith('~'); const c = parseChord(auto ? t.slice(0, -1) : t); if (auto && c.quals.includes('dom7')) c.auto7 = true; return c; };
const serialise = (ch) => ({ id: ch.id, title: ch.title, cpl: ch.cpl, bpb: ch.bpb, cells: ch.cells.map(cellText), marks: ch.marks || {} });
function deserialise(o) {
  const ch = { id: o.id || uid(), title: o.title || 'Untitled', cpl: o.cpl || 16, bpb: o.bpb || 4, cells: [], marks: JSON.parse(JSON.stringify(o.marks || {})) };
  ch.cells = (o.cells || []).map((t) => { if (!t) return null; try { return parseCell(t); } catch (e) { return null; } });
  padCells(ch);
  return ch;
}
function padCells(ch) {
  if (!ch.cells.length) ch.cells = new Array(ch.cpl * 4).fill(null);
  while (ch.cells.length % ch.cpl) ch.cells.push(null);
}

function demoChart() { const c = textToChart(DEMO.text.join('\n')); c.title = DEMO.title; return c; }
function blankChart() {
  const bpb = S.settings.lastBpb || 4;
  let cpl = S.settings.lastCpl || 16; if (cpl % bpb) cpl = bpb * 4;
  return { id: uid(), title: 'New chart', cpl, bpb, cells: new Array(cpl * 4).fill(null), marks: {} };
}

// ---------------------------------------------------------------- persistence
function loadData(data) {
  if (data && data.charts && data.charts.length) {
    S.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
    S.settingsAt = data.settingsAt || 0;
    S.charts = data.charts;
    S.deleted = data.deleted || {};
    const cur = S.charts.find((c) => c.id === data.currentId) || S.charts[0];
    S.chart = deserialise(cur);
  } else {
    S.chart = demoChart();
    S.charts = [{ ...serialise(S.chart), updatedAt: Date.now() }];
    S.deleted = {};
  }
  S.lastSettingsJSON = JSON.stringify(S.settings);
  S.sel = { a: 0, b: 0 }; S.undo = []; S.redo = []; S.tl = null;
  applyAudioSettings();
}

// write the open chart into the library list (bumping its edit time only if it actually changed)
function syncCurrent() {
  const ser = serialise(S.chart);
  const idx = S.charts.findIndex((c) => c.id === S.chart.id);
  const old = idx >= 0 ? S.charts[idx] : null;
  const strip = (c) => JSON.stringify({ title: c.title, cpl: c.cpl, bpb: c.bpb, cells: c.cells, marks: c.marks || {} });
  ser.updatedAt = old && strip(old) === strip(ser) ? old.updatedAt : Date.now();
  if (idx >= 0) S.charts[idx] = ser; else S.charts.unshift(ser);
  const sj = JSON.stringify(S.settings);
  if (sj !== S.lastSettingsJSON) { S.settingsAt = Date.now(); S.lastSettingsJSON = sj; }
}
function libraryData() {
  syncCurrent();
  return { version: 1, currentId: S.chart.id, charts: S.charts, deleted: S.deleted, settings: S.settings, settingsAt: S.settingsAt };
}
let warnedUnsaved = false;
function persist() {
  clearTimeout(persistTimer);
  const ok = store.save(libraryData());
  if (!ok && !warnedUnsaved) { warnedUnsaved = true; toast("This browser isn't saving — use Charts → Export to keep your work"); }
  updateSyncLabel();
}
let persistTimer = null;
const persistSoon = () => { clearTimeout(persistTimer); persistTimer = setTimeout(persist, 400); };

// another tab or device changed the library
function applyExternal(merged) {
  syncCurrent();
  const mine = S.charts.find((c) => c.id === S.chart.id);
  S.charts = merged.charts.length ? merged.charts : S.charts;
  S.deleted = merged.deleted || S.deleted;
  if ((merged.settingsAt || 0) > S.settingsAt && merged.settings) {
    S.settings = { ...DEFAULT_SETTINGS, ...merged.settings };
    S.settingsAt = merged.settingsAt; S.lastSettingsJSON = JSON.stringify(S.settings);
    applyAudioSettings(); invalidate();
    loadInstrument(S.settings.chordInst, false);
    if (S.settings.bassPattern !== 'off') loadInstrument(S.settings.bassInst, false);
  }
  const theirs = S.charts.find((c) => c.id === S.chart.id);
  if (!theirs) {                                  // open chart was deleted elsewhere
    S.chart = deserialise(S.charts[0] || serialise(blankChart()));
    S.undo = []; S.redo = []; invalidate(); setSel(0);
  } else if (!mine || (theirs.updatedAt || 0) > (mine.updatedAt || 0)) {
    S.chart = deserialise(theirs); invalidate();
    setSel(Math.min(S.sel.a, S.chart.cells.length - 1), Math.min(S.sel.b, S.chart.cells.length - 1));
  }
  renderAll();
  toast('Charts updated from another device or tab');
}

// ---------------------------------------------------------------- timeline
// ---------------------------------------------------------------- repeat signs (simile, "%")
// marks[bar].sim: 'bar' = this bar plays the bar before; 'half' = the second half of the bar plays its first
// half; 'two' = this bar and the next play the two bars before. The bars under a sign hold no chords.
function simSpan(ch, b, sim) {                    // the cells a sign covers: [from, to)
  const bpb = ch.bpb;
  if (sim === 'half') return [b * bpb + bpb / 2, (b + 1) * bpb];
  return [b * bpb, (b + (sim === 'two' ? 2 : 1)) * bpb];
}
function simFits(ch, b, sim) {
  const nBars = Math.ceil(ch.cells.length / ch.bpb);
  if (sim === 'half') return ch.bpb % 2 === 0;
  if (sim === 'two') return b >= 2 && b + 1 < nBars;
  return b >= 1 && b < nBars;
}
// after an edit: a sign goes when chords are put under it or it no longer fits
function tidySims(ch) {
  const marks = ch.marks || {};
  for (const k of Object.keys(marks).map(Number).sort((a, b) => a - b)) {
    const m = marks[k]; if (!m || !m.sim) continue;
    const [a, z] = simSpan(ch, k, m.sim);
    if (!simFits(ch, k, m.sim) || ch.cells.slice(a, z).some(Boolean)) { delete m.sim; continue; }
    if (m.sim === 'two' && marks[k + 1]) delete marks[k + 1].sim;   // the second bar belongs to this sign
  }
  for (const [k, v] of Object.entries(marks)) if (!v.start && !v.end && !v.ending && !v.sim) delete marks[k];
}
// the chords as played: each sign's cells take the chords of the cells just before it (a sign that starts
// while a chord is held on restrikes that chord)
function playedCells(ch) {
  const out = ch.cells.slice(), bpb = ch.bpb, marks = ch.marks || {};
  const soundingAt = (i) => { for (let j = i; j >= 0; j--) if (out[j]) return out[j]; return null; };
  for (let b = 0; b * bpb < out.length; b++) {
    const sim = (marks[b] || {}).sim; if (!sim) continue;
    const [a, z] = simSpan(ch, b, sim), len = z - a, src = a - len;
    if (src < 0) continue;
    for (let k = 0; k < len; k++) out[a + k] = out[src + k];
    if (!out[a]) out[a] = soundingAt(src);
  }
  return out;
}
const SIM_SVG = {
  one: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="7.5" r="2.4"/><circle cx="18" cy="16.5" r="2.4"/><path d="M4 21h3.6L20 3h-3.6z"/></svg>',
  two: '<svg viewBox="0 0 36 30" aria-hidden="true"><text x="18" y="8" text-anchor="middle" font-size="9" font-weight="700">2</text><circle cx="5.5" cy="15" r="2.4"/><circle cx="30.5" cy="26" r="2.4"/><path d="M4 30h3.4l10.4-18h-3.4zM15.4 30h3.4l10.4-18h-3.4z"/></svg>',
};
const SIM_NAMES = { bar: 'Repeat the bar before', half: 'Repeat the first half of the bar', two: 'Repeat the two bars before' };

function timeline() {
  if (S.tl) return S.tl;
  const cells = playedCells(S.chart), n = cells.length;
  const segs = [], info = new Array(n);
  let cur = -1;
  for (let i = 0; i < n; i++) {
    if (cells[i]) { if (cur >= 0) segs[cur].end = i; segs.push({ start: i, end: n, chord: cells[i] }); cur = segs.length - 1; }
    info[i] = { seg: cur };
  }
  let prev = null;
  for (const s of segs) {
    if (s.chord.nc) { s.v = null; continue; }
    s.v = voiceChord(s.chord, S.settings.voicing, prev);
    if (s.v.upper.length) prev = s.v.upper;
    s.bassMidi = s.v.bass;
    s.rootBass = 36 + notePC(s.chord.root);       // root in the bass register (chord tones for bass lines)
    s.toneSemis = chordIntervals(s.chord).map(ivlSemis);
  }
  S.tl = { beatsPerBar: S.chart.bpb, cells: info, segs };
  return S.tl;
}
const invalidate = () => { S.tl = null; };
function soundingSeg(i) { const tl = timeline(); const k = tl.cells[i] ? tl.cells[i].seg : -1; return k >= 0 ? tl.segs[k] : null; }

function playSettings() {
  const s = S.settings;
  return { tempo: s.tempo, swing: s.swing, click: s.click, countIn: s.countIn, compPattern: s.compPattern, bassPattern: s.bassPattern, chordInst: s.chordInst, bassInst: s.bassInst };
}

// ---------------------------------------------------------------- selection helpers
const selLo = () => Math.min(S.sel.a, S.sel.b);
const selHi = () => Math.max(S.sel.a, S.sel.b);
const isRange = () => S.sel.a !== S.sel.b;
const selChord = () => S.chart.cells[S.sel.a];
const barOf = (i) => Math.floor(i / S.chart.bpb) + 1;
const barStart = (i) => i - (i % S.chart.bpb);
function setSel(a, b = a, opts = {}) {
  const n = S.chart.cells.length;
  const clamp = (x) => Math.max(0, Math.min(n - 1, x));
  S.sel = { a: clamp(a), b: clamp(b) };
  if (!opts.keepMode) { S.bassMode = false; S.target = 'root'; }
  updateSelection(); renderInfo(); updateKeys();
  followSelection();
}

// ---------------------------------------------------------------- editing
function snapshot() { return { cells: S.chart.cells.map((c) => (c ? cloneChord(c) : null)), cpl: S.chart.cpl, bpb: S.chart.bpb, marks: JSON.parse(JSON.stringify(S.chart.marks || {})) }; }
function restore(snap) {
  S.chart.cells = snap.cells; S.chart.cpl = snap.cpl; S.chart.bpb = snap.bpb; S.chart.marks = snap.marks || {};
  S.settings.lastBpb = snap.bpb; S.settings.lastCpl = snap.cpl;
}
function edit(fn, opts = {}) {
  const before = snapshot();
  const result = fn();
  if (result === false) return;
  tidySims(S.chart);
  S.undo.push(before); if (S.undo.length > 300) S.undo.shift();
  S.redo = [];
  afterEdit(opts);
}
function afterEdit(opts = {}) {
  invalidate();
  // sound first, so the audition isn't delayed by redrawing the grid
  if (opts.audition !== false && S.settings.audition && !seq.playing) audition(S.sel.a);
  renderGrid(); renderInfo(); updateKeys();
  persistSoon();
  followSelection();
}
function ensureLength(n) { while (S.chart.cells.length < n) for (let k = 0; k < S.chart.cpl; k++) S.chart.cells.push(null); }

function needChord(allowNC = false) {
  const c = selChord();
  if (!c) { toast('Tap a root note first'); return null; }
  if (c.nc && !allowNC) { toast('N.C. — tap a root note to make it a chord'); return null; }
  return c;
}
const setSelChord = (c) => edit(() => { S.chart.cells[S.sel.a] = c; });

// ---------------------------------------------------------------- keyboard
// [label, action, class, arg, title]
const KB = [
  ...LETTERS.map((l) => [l, 'root', 'root', l]), ['♭', 'acc', 'root', -1], ['♯', 'acc', 'root', 1], ['/', 'slash', 'root', null, 'Bass note'],
  ['–', 'q', '', 'min'], ['Δ', 'q', '', 'maj'], ['+', 'q', '', 'aug'], ['ø', 'q', '', 'hdim'], ['o', 'q', '', 'dim'],
  ['6', 'q', '', 'six'], ['7', 'q', '', 'dom7'], ['9', 'q', '', 'dom9'], ['11', 'q', '', 'dom11'], ['13', 'q', '', 'dom13'],
  ['♭9', 'x', 'alt', '♭9'], ['♯9', 'x', 'alt', '♯9'], ['♯11', 'x', 'alt', '♯11'], ['♭13', 'x', 'alt', '♭13'], ['♭5', 'x', 'alt', '♭5'],
  ['♯5', 'x', 'alt', '♯5'], ['sus4', 'sus', 'alt small', '4'], ['sus2', 'sus', 'alt small', '2'], ['6/9', 'q', 'alt small', 'sixnine'], ['alt', 'q', 'alt small', 'alt'],
  ['add9', 'add', 'alt small', '9'], ['add11', 'add', 'alt small', '11'], ['omit3', 'omit', 'alt small', '3'], ['omit5', 'omit', 'alt small', '5'],
  ['⇄', 'enh', 'alt', null, 'Respell root (C♯ ↔ D♭)'], ['N.C.', 'nc', 'alt small'], ['⌨', 'type', 'alt', null, 'Type a chord or progression'],
  ['Copy', 'copy', 'alt small'], ['Paste', 'paste', 'alt small'], ['⌫', 'clear', 'alt', null, 'Clear'],
  // page 2: form and layout
  ['|:', 'rstart', 'form p2', null, 'Repeat start'], [':|', 'rend', 'form p2', null, 'Repeat end'], ['×2', 'rtimes', 'form small p2', null, 'Times to play'],
  ['1.', 'ending', 'form p2', 1, '1st ending'], ['2.', 'ending', 'form p2', 2, '2nd ending'], ['3.', 'ending', 'form p2', 3, '3rd ending'],
  ['+bar', 'insbar', 'form small p2', null, 'Insert bar'], ['−bar', 'delbar', 'form small p2', null, 'Delete bar'], ['Dup', 'dupbar', 'form small p2', null, 'Duplicate bar'], ['%', 'sim', 'form p2', 'bar', SIM_NAMES.bar],
  ['½ %', 'sim', 'form small p2 span2', 'half', SIM_NAMES.half], ['2 %', 'sim', 'form small p2 span2', 'two', SIM_NAMES.two],
  ['−½', 'tr', 'alt small p2', -1, 'Transpose down'], ['+½', 'tr', 'alt small p2', 1, 'Transpose up'],
  ['+ line', 'lineadd', 'alt small p2 span2', null, 'Add a line at the end'], ['− line', 'linedel', 'alt small p2 span2', null, 'Remove the last line (if empty)'],
  // both pages: moving, undo, hearing, and the page switch
  ['◀', 'left', 'alt pb', null, 'Previous cell'], ['▶', 'right', 'alt pb', null, 'Next cell'], ['⇥', 'nextbar', 'alt pb', null, 'Next bar'],
  ['+cell', 'ins', 'alt small pb'], ['−cell', 'del', 'alt small pb'],
  ['↶', 'undo', 'alt pb', null, 'Undo'], ['↷', 'redo', 'alt pb', null, 'Redo'], ['♪', 'hear', 'alt pb', null, 'Hear chord'],
  ['Form ›', 'page', 'alt small pb span2 pagekey', null, 'Repeats, endings, bars and transpose'],
];
// keys without a page class are chord entry (page 1)
KB.forEach((k) => { if (!/\bp2\b|\bpb\b/.test(k[2] || '')) k[2] = (k[2] || '') + ' p1'; });

function setKbPage(n) {
  const kb = $('#keyboard'); kb.dataset.page = n;
  const pk = kb.querySelector('.pagekey'); if (pk) pk.textContent = n === 2 ? '‹ Chords' : 'Form ›';
}
function buildKeyboard() {
  const kb = $('#keyboard');
  kb.innerHTML = '';
  KB.forEach(([label, action, cls, arg, title], idx) => {
    const b = document.createElement('button');
    b.className = 'key ' + (cls || '');
    b.textContent = label;
    // the repeat-sign keys show the signs themselves
    if (action === 'sim') b.innerHTML = arg === 'two' ? SIM_SVG.two : (arg === 'half' ? '<span class="half">½</span>' : '') + SIM_SVG.one;
    b.dataset.k = idx;
    if (title) b.title = title; b.setAttribute('aria-label', title || label);
    kb.appendChild(b);
  });
  setKbPage(1);
  // keys act on touch-down for speed; ⌨ waits for the tap to finish, because iOS only shows its
  // keyboard when focus happens at the end of a tap
  kb.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.key'); if (!b) return;
    e.preventDefault();
    engine.unlock();
    b.classList.add('pressed'); setTimeout(() => b.classList.remove('pressed'), 120);
    b._downAt = performance.now();
    const [, action, , arg] = KB[+b.dataset.k];
    if (action !== 'type') keyAction(action, arg);
  });
  // clicks without a touch-down first (VoiceOver, Switch Control, keyboard) still work, once
  kb.addEventListener('click', (e) => {
    const b = e.target.closest('.key'); if (!b) return;
    const [, action, , arg] = KB[+b.dataset.k];
    if (action === 'type') keyAction('type');
    else if (!(performance.now() - (b._downAt || 0) < 800)) { engine.unlock(); keyAction(action, arg); }
  });
}

// act on touch-down (no waiting for the finger to lift), but also on a click that had no touch-down
function fastTap(el, fn) {
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); el._downAt = performance.now(); fn(e); });
  el.addEventListener('click', (e) => { if (!(performance.now() - (el._downAt || 0) < 800)) fn(e); });
}

function keyAction(action, arg) {
  const cells = S.chart.cells, i = S.sel.a;
  switch (action) {
    case 'page': setKbPage(+$('#keyboard').dataset.page === 2 ? 1 : 2); return;
    case 'lineadd': edit(() => { ensureLength(S.chart.cells.length + S.chart.cpl); }, { audition: false }); toast('Line added'); return;
    case 'linedel': {
      const n = S.chart.cells.length, cpl = S.chart.cpl;
      if (n <= cpl) return;
      if (S.chart.cells.slice(n - cpl).some(Boolean)) { toast("The last line isn't empty — clear it first"); return; }
      edit(() => { S.chart.cells.length = n - cpl; S.chart.marks = shiftMarks(S.chart.marks, (n - cpl) / S.chart.bpb, -(cpl / S.chart.bpb)); }, { audition: false });
      setSel(Math.min(S.sel.a, S.chart.cells.length - 1), Math.min(S.sel.b, S.chart.cells.length - 1));
      return;
    }
    case 'root': {
      const c = cells[i];
      const letter = LETTERS.indexOf(arg);
      if (S.bassMode && c && !c.nc) {
        const d = cloneChord(c); d.bass = note(letter, 0);
        S.bassMode = false; S.target = 'bass'; setSelChord(d); return;
      }
      S.target = 'root';
      if (c && !c.nc) { const d = cloneChord(c); d.root = note(letter, 0); setSelChord(d); }
      else setSelChord(parseChord(arg));
      return;
    }
    case 'acc': {
      const c = needChord(); if (!c) return;
      const d = cloneChord(c);
      const key = S.target === 'bass' && d.bass ? 'bass' : 'root';
      const n = d[key];
      d[key] = note(n.letter, n.acc === arg ? 0 : arg);
      setSelChord(d); return;
    }
    case 'slash': {
      const c = needChord(); if (!c) return;
      if (c.bass) { const d = cloneChord(c); d.bass = null; S.target = 'root'; setSelChord(d); return; }
      S.bassMode = !S.bassMode; updateKeys();
      if (S.bassMode) toast('Tap the bass note');
      return;
    }
    case 'q': { const c = needChord(); if (c) setSelChord(toggleQual(c, arg)); return; }
    case 'x': { const c = needChord(); if (c) setSelChord(toggleExt(c, { kind: 'acc', i: parseInterval(arg) })); return; }
    case 'sus': { const c = needChord(); if (c) setSelChord(toggleExt(c, { kind: 'sus', i: parseInterval(arg) })); return; }
    case 'add': { const c = needChord(); if (c) setSelChord(toggleExt(c, { kind: 'add', i: parseInterval(arg) })); return; }
    case 'omit': { const c = needChord(); if (c) setSelChord(toggleExt(c, { kind: 'omit', i: parseInterval(arg) })); return; }
    case 'enh': {
      const c = needChord(); if (!c) return;
      const useBass = S.target === 'bass' && c.bass;
      const n = useBass ? c.bass : c.root;
      if (n.acc === 0) { toast('Only sharps and flats can be respelled'); return; }
      const d = cloneChord(c);
      if (useBass) d.bass = enharmonic(d.bass); else d.root = enharmonic(d.root);
      setSelChord(d); return;
    }
    case 'nc': edit(() => { cells[i] = cells[i] && cells[i].nc ? null : NC(); }, { audition: false }); return;
    case 'type': toggleTypebar(); return;
    case 'copy': S.clip = cells.slice(selLo(), selHi() + 1).map((c) => (c ? cloneChord(c) : null)); toast(`Copied ${S.clip.length} cell${S.clip.length > 1 ? 's' : ''}`); updateKeys(); return;
    case 'paste': {
      if (!S.clip) { toast('Nothing copied yet'); return; }
      const clip = S.clip, at = selLo();
      edit(() => { ensureLength(at + clip.length); clip.forEach((c, k) => { cells[at + k] = c ? cloneChord(c) : null; }); }, { audition: false });
      setSel(at, at + clip.length - 1);
      return;
    }
    case 'clear': edit(() => { for (let k = selLo(); k <= selHi(); k++) cells[k] = null; }, { audition: false }); return;
    case 'left': setSel(i - 1); hearIfOn(); return;
    case 'right': setSel(i + 1); hearIfOn(); return;
    case 'up': setSel(i - S.chart.cpl); hearIfOn(); return;
    case 'down': setSel(i + S.chart.cpl); hearIfOn(); return;
    case 'nextbar': setSel(barStart(i) + S.chart.bpb); hearIfOn(); return;
    case 'ins': edit(() => {
      cells.splice(i, 0, null);
      if (cells[cells.length - 1] === null && cells.length % S.chart.cpl === 1) cells.pop(); else padCells(S.chart);
    }, { audition: false }); return;
    case 'del': edit(() => { cells.splice(i, 1); cells.push(null); }, { audition: false }); return;
    case 'undo': case 'redo': {
      const from = action === 'undo' ? S.undo : S.redo, to = action === 'undo' ? S.redo : S.undo;
      if (!from.length) { toast(`Nothing to ${action}`); return; }
      to.push(snapshot()); restore(from.pop());
      setSel(Math.min(S.sel.a, S.chart.cells.length - 1), Math.min(S.sel.b, S.chart.cells.length - 1));
      afterEdit({ audition: false });
      return;
    }
    case 'tr': {
      const whole = !isRange();
      const lo = whole ? 0 : selLo(), hi = whole ? cells.length - 1 : selHi();
      edit(() => { for (let k = lo; k <= hi; k++) if (cells[k] && !cells[k].nc) cells[k] = transposeChord(cells[k], arg); }, { audition: false });
      toast(`Transposed ${whole ? 'whole chart' : 'selection'} ${arg > 0 ? 'up' : 'down'} a semitone`);
      hearIfOn();
      return;
    }
    case 'hear': audition(i, true); return;
    case 'rstart': case 'rend': case 'rtimes': case 'ending': formAction(action, arg); return;
    case 'insbar': case 'delbar': case 'dupbar': barAction(action); return;
    case 'sim': simAction(arg); return;
  }
}

// bars covered by the selection
const selBars = () => { const a = Math.floor(selLo() / S.chart.bpb), b = Math.floor(selHi() / S.chart.bpb); return Array.from({ length: b - a + 1 }, (_, k) => a + k); };
const markOf = (b) => (S.chart.marks[b] = S.chart.marks[b] || {});
const tidyMarks = () => { for (const [k, v] of Object.entries(S.chart.marks)) if (!v.start && !v.end && !v.ending && !v.sim) delete S.chart.marks[k]; };
function formAction(action, arg) {
  if (!S.chart.marks) S.chart.marks = {};
  const bars = selBars(), first = bars[0], last = bars[bars.length - 1];
  edit(() => {
    if (action === 'rstart') { const m = markOf(first); m.start = !m.start; }
    else if (action === 'rend') { const m = markOf(last); m.end = m.end ? 0 : 2; }
    else if (action === 'rtimes') {
      const m = markOf(last);
      m.end = !m.end ? 3 : m.end >= 4 ? 2 : m.end + 1;      // ×2 → ×3 → ×4 → ×2
      toast(`Play ${m.end} times`);
    } else {
      const all = bars.every((b) => (S.chart.marks[b] || {}).ending === arg);
      bars.forEach((b) => { markOf(b).ending = all ? 0 : arg; });
    }
    tidyMarks();
  }, { audition: false });
}
// put a repeat sign on the selected bars (the first of them for a two-bar sign), or take it off
function simAction(kind) {
  const ch = S.chart; if (!ch.marks) ch.marks = {};
  const bars = selBars(), targets = kind === 'two' ? [bars[0]] : bars;
  const off = targets.every((b) => (ch.marks[b] || {}).sim === kind);
  if (!off) {
    if (kind === 'half' && ch.bpb % 2) { toast('A half-bar repeat needs an even number of beats in the bar'); return; }
    if (targets.some((b) => !simFits(ch, b, kind))) { toast(kind === 'two' ? 'A two-bar repeat needs two bars before it and a bar after' : 'No bar before this one to repeat'); return; }
  }
  edit(() => {
    targets.forEach((b) => {
      const m = markOf(b);
      if (off) { delete m.sim; return; }
      m.sim = kind;
      const [a, z] = simSpan(ch, b, kind);
      for (let i = a; i < z; i++) ch.cells[i] = null;
      if (kind === 'two' && ch.marks[b + 1]) delete ch.marks[b + 1].sim;
      if ((ch.marks[b - 1] || {}).sim === 'two') delete ch.marks[b - 1].sim;   // this bar was the second of a two-bar sign
    });
  }, { audition: false });
  toast(off ? 'Repeat sign removed' : SIM_NAMES[kind]);
}
function barAction(action) {
  const bpb = S.chart.bpb, cells = S.chart.cells, b = Math.floor(S.sel.a / bpb), at = b * bpb;
  edit(() => {
    if (action === 'insbar' || action === 'dupbar') {
      const copy = action === 'dupbar' ? cells.slice(at, at + bpb).map((c) => (c ? cloneChord(c) : null)) : new Array(bpb).fill(null);
      const insertAt = action === 'dupbar' ? at + bpb : at;
      cells.splice(insertAt, 0, ...copy);
      S.chart.marks = shiftMarks(S.chart.marks, insertAt / bpb, 1);
      padCells(S.chart);
    } else {                                                  // delbar
      cells.splice(at, bpb);
      S.chart.marks = shiftMarks(S.chart.marks, b, -1);
      while (cells.length < S.chart.cpl) cells.push(null);
      padCells(S.chart);
    }
  }, { audition: false });
  setSel(Math.min(action === 'dupbar' ? at + bpb : at, S.chart.cells.length - 1));
}
const hearIfOn = () => { if (S.settings.audition && !seq.playing) audition(S.sel.a); };

function updateKeys() {
  const c = selChord();
  const chord = c && !c.nc ? c : null;
  document.querySelectorAll('#keyboard .key').forEach((b) => {
    const [, action, , arg] = KB[+b.dataset.k];
    let on = false, dim = false;
    if (action === 'root') on = !!chord && !S.bassMode && LETTERS[chord.root.letter] === arg;
    else if (action === 'acc') { const n = chord && (S.target === 'bass' && chord.bass ? chord.bass : chord.root); on = !!n && n.acc === arg; dim = !chord; }
    else if (action === 'slash') { on = S.bassMode || !!(chord && chord.bass); dim = !chord; }
    else if (action === 'q') { on = !!chord && chord.quals.includes(arg); dim = !chord; b.classList.toggle('implied', on && arg === 'dom7' && !!chord.auto7); }
    else if (action === 'x') { on = !!chord && hasExt(chord, { kind: 'acc', i: parseInterval(arg) }); dim = !chord; }
    else if (['sus', 'add', 'omit'].includes(action)) { on = !!chord && hasExt(chord, { kind: action, i: parseInterval(arg) }); dim = !chord; }
    else if (action === 'nc') on = !!(c && c.nc);
    else if (action === 'type') on = !$('#typebar').hidden;
    else if (action === 'paste') dim = !S.clip;
    else if (action === 'undo') dim = !S.undo.length;
    else if (action === 'redo') dim = !S.redo.length;
    else if (action === 'enh') dim = !chord;
    else if (['rstart', 'rend', 'rtimes', 'ending'].includes(action)) {
      const bars = selBars(), mk = (x) => (S.chart.marks || {})[x] || {};
      if (action === 'rstart') on = !!mk(bars[0]).start;
      else if (action === 'rend') on = !!mk(bars[bars.length - 1]).end;
      else if (action === 'rtimes') { const t = mk(bars[bars.length - 1]).end; on = t > 2; b.textContent = '×' + (t > 2 ? t : 2); }
      else on = bars.every((x) => mk(x).ending === arg);
    }
    b.classList.toggle('on', on);
    b.classList.toggle('dim', dim);
  });
}

// ---------------------------------------------------------------- grid rendering
function chordHTML(c) {
  if (c.nc) return 'N.C.';
  // two parts: root + quality, then extensions + bass (a crowded symbol puts the second part underneath)
  let h = `<span class="r">${LETTERS[c.root.letter]}</span>`, h2 = '';
  const a = accStr(c.root.acc); if (a) h += `<span class="ra">${a}</span>`;
  const q = qualityText(c); if (q) h += `<span class="q">${esc(q)}</span>`;
  if (c.exts.length) h2 += `<span class="x">${esc(c.exts.map(extName).join(' '))}</span>`;
  if (c.bass) h2 += `<span class="b">/${esc(noteName(c.bass))}</span>`;
  return `<span class="l1">${h}</span>` + (h2 ? `<span class="l2">${h2}</span>` : '');
}

// rows grow to fill a tall chart area (the Duo's top half), never below the CSS height
function sizeRows(grid, ch) {
  grid.style.removeProperty('--cell-h');
  const wrap = $('#chart-wrap'), lines = Math.ceil(ch.cells.length / ch.cpl);
  const base = parseFloat(getComputedStyle(grid).getPropertyValue('--cell-h')) || 46;
  const room = wrap.clientHeight - 30;
  const h = Math.floor(room / lines - 15);
  if (h > base) grid.style.setProperty('--cell-h', Math.min(84, h) + 'px');
}

function renderGrid() {
  const ch = S.chart, grid = $('#grid');
  grid.style.setProperty('--cpl', ch.cpl);
  sizeRows(grid, ch);
  const out = [];
  // repeat signs by the cell they start at: { kind, width in cells }
  const signs = {};
  for (const [k, m] of Object.entries(ch.marks || {})) {
    if (!m.sim) continue;
    const b = +k, [a, z] = simSpan(ch, b, m.sim);
    const sameLine = Math.floor(a / ch.cpl) === Math.floor((z - 1) / ch.cpl);
    signs[a] = { kind: m.sim, w: sameLine ? z - a : ch.cpl - (a % ch.cpl) };
  }
  for (let i = 0; i < ch.cells.length; i++) {
    const col = i % ch.cpl;
    const cls = ['cell'];
    if (i % ch.bpb === 0 || col === 0) cls.push('bar');
    if (col === ch.cpl - 1) cls.push('line-end');
    const c = ch.cells[i];
    let inner = '';
    const bar = Math.floor(i / ch.bpb), m = (ch.marks || {})[bar] || {};
    if (i % ch.bpb === 0) {
      if (m.start) { cls.push('rep-start'); inner += '<span class="rs"></span>'; }
      if (m.ending) inner += `<span class="volta${col === 0 ? ' line-start' : ''}" style="width:calc(${ch.bpb * 100}% - 4px)">${m.ending}.</span>`;
    }
    if (i % ch.bpb === ch.bpb - 1 && m.end) { cls.push('rep-end'); inner += `<span class="re"></span>${m.end > 2 ? `<span class="rtimes">×${m.end}</span>` : ''}`; }
    if (col === 0 && !m.ending) inner += `<span class="barno">${barOf(i)}</span>`;
    const sg = signs[i];
    if (sg) inner += `<span class="sim sim-${sg.kind}" style="width:calc(${sg.w * 100}% - 4px)" title="${SIM_NAMES[sg.kind]}">${sg.kind === 'two' ? SIM_SVG.two : SIM_SVG.one}</span>`;
    if (c) {
      let span = 1;
      while (col + span < ch.cpl && span < ch.bpb * 2 && !ch.cells[i + span] && !signs[i + span]) span++;
      inner += `<span class="ch${c.nc ? ' nc' : ''}" style="width:calc(${span * 100}% - 6px)" title="${esc(chordText(c))}">${chordHTML(c)}</span>`;
    }
    out.push(`<div class="${cls.join(' ')}" data-i="${i}">${inner}</div>`);
  }
  out.push('<div id="loop-layer" aria-hidden="true"><div class="lh lh-start" data-h="start"></div><div class="lh lh-end" data-h="end"></div></div>');
  grid.innerHTML = out.join('');
  fitChordText();
  updateSelection();
  if (seq.playing && playingCell >= 0) { const el = cellEl(playingCell); if (el) el.classList.add('playing'); markPlayBar(playingCell); }
}
const cellEl = (i) => $(`#grid .cell[data-i="${i}"]`);

// chord symbols as big as the cell allows; one that won't fit on a line puts its extensions and bass on a
// second line; only if that still won't fit do the extensions hide (never the bass; the info strip has it all)
function fitChordText() {
  const cell = document.querySelector('#grid .cell');
  const base = Math.max(11, Math.min(26, (cell ? cell.clientWidth : 24) * 0.62, (cell ? cell.clientHeight : 46) * 0.37));
  fitChords([...document.querySelectorAll('#grid .ch')], base, cell && cell.clientWidth < 30 ? 8 : 10);   // narrow phone cells go smaller
}
function fitChords(els, base, min) {
  const over = (el) => Math.max(el.scrollWidth / el.clientWidth, el.scrollHeight / el.clientHeight, 1);
  els.forEach((el) => { el.style.fontSize = base + 'px'; el.classList.remove('two', 'cut'); });
  const r1 = els.map(over), two = [];                  // measure everything, then write (one layout pass each)
  els.forEach((el, k) => {
    if (r1[k] <= 1) return;
    if (r1[k] <= 1.25 || !el.querySelector('.x, .b')) el.style.fontSize = Math.max(min, base / r1[k]) + 'px';
    else { el.classList.add('two'); two.push(el); }
  });
  const r2 = two.map(over), cut = [];
  two.forEach((el, k) => {
    if (base / r2[k] < min && el.querySelector('.x')) { el.classList.add('cut'); cut.push(el); }
    else el.style.fontSize = Math.max(min, base / r2[k]) + 'px';
  });
  const r3 = cut.map(over);
  cut.forEach((el, k) => { el.style.fontSize = Math.max(min, base / r3[k]) + 'px'; });
}

function updateSelection() {
  const lo = selLo(), hi = selHi();
  document.querySelectorAll('#grid .cell').forEach((el) => {
    const i = +el.dataset.i;
    el.classList.toggle('sel', i === S.sel.a && !isRange());
    el.classList.toggle('range', isRange() && i >= lo && i <= hi);
    el.classList.toggle('selbar', !isRange() && Math.floor(i / S.chart.bpb) === Math.floor(S.sel.a / S.chart.bpb));
  });
  renderLoop();
}

// ---------------------------------------------------------------- loop bracket + handles
function renderLoop() {
  document.querySelectorAll('#grid .lp').forEach((el) => el.classList.remove('lp', 'lp-first', 'lp-last'));
  const layer = $('#loop-layer');
  const m = S.settings.loop ? activeMeta() : null;
  if (!layer) return;
  if (!m || m.whole) { layer.hidden = true; renderTransport(); return; }
  layer.hidden = false;
  for (let k = m.lo; k <= m.hi; k++) { const el = cellEl(k); if (el) el.classList.add('lp'); }
  const first = cellEl(m.lo), last = cellEl(m.hi);
  if (first) first.classList.add('lp-first');
  if (last) last.classList.add('lp-last');
  const hs = layer.querySelector('.lh-start'), he = layer.querySelector('.lh-end');
  if (first) { hs.style.left = (first.offsetLeft - 13) + 'px'; hs.style.top = (first.offsetTop - 13) + 'px'; }
  if (last) { he.style.left = (last.offsetLeft + last.offsetWidth - 13) + 'px'; he.style.top = (last.offsetTop - 13) + 'px'; }
  renderTransport();
}
// what is (or would be) playing: { whole } or { whole: false, lo, hi }
function activeMeta() {
  if (seq.playing && seq.range) return (seq.pending || seq.range).meta;
  const r = playRange(); return r ? r.meta : null;
}

function bindLoopHandles() {
  const grid = $('#grid');
  let drag = null;
  grid.addEventListener('pointerdown', (e) => {
    const h = e.target.closest('.lh'); if (!h) return;
    e.stopPropagation(); e.preventDefault();
    const m = activeMeta(); if (!m || m.whole) return;
    drag = { which: h.dataset.h, lo: m.lo, hi: m.hi };
    try { h.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  }, true);
  grid.addEventListener('pointermove', (e) => {
    if (!drag) return;
    e.preventDefault();
    const el = document.elementFromPoint(e.clientX, e.clientY + (drag.which ? 16 : 0))?.closest('.cell');
    if (!el) return;
    const i = +el.dataset.i;
    if (drag.which === 'start') drag.lo = Math.min(i, drag.hi); else drag.hi = Math.max(i, drag.lo);
    setSel(drag.lo, drag.hi);
  }, true);
  const end = () => { if (drag) { drag = null; hearIfOn(); } };
  grid.addEventListener('pointerup', end, true);
  grid.addEventListener('pointercancel', end, true);
}

// ---------------------------------------------------------------- info strip + mini piano
function rangeLabel() {
  const lo = selLo(), hi = selHi(), b0 = barOf(lo), b1 = barOf(hi), bpb = S.chart.bpb;
  if (b0 !== b1) return `Bars ${b0}–${b1}`;
  return lo % bpb === 0 && hi % bpb === bpb - 1 ? `Bar ${b0}` : `Bar ${b0} · beats ${(lo % bpb) + 1}–${(hi % bpb) + 1}`;
}
function renderInfo() {
  const c = selChord();
  const seg = soundingSeg(S.sel.a);
  const shown = c || (seg ? seg.chord : null);
  const label = isRange() ? rangeLabel() : '';
  if (!shown) {
    $('#info-chord').textContent = label || 'Empty cell';
    $('#info-notes').textContent = 'Tap a root note to add a chord';
    drawPiano(null);
    return;
  }
  const held = !c && seg;
  $('#info-chord').textContent = chordText(shown) + (held ? '  (held)' : '') + (label ? '  ·  ' + label : '');
  if (shown.nc) { $('#info-notes').textContent = 'No chord'; drawPiano(null); return; }
  const notes = chordNotes(shown).map(noteName).join(' ');
  const ivs = chordIntervals(shown).map(ivlName).join(' ');
  $('#info-notes').innerHTML = `${esc(notes)}${shown.bass ? ' / ' + esc(noteName(shown.bass)) : ''}<span class="iv">${esc(ivs)}</span>`;
  drawPiano(seg && seg.chord === shown ? seg.v : voiceChord(shown, S.settings.voicing));
}

function drawPiano(v) {
  const svg = $('#piano');
  const lo = 36, hi = 84;                       // C2..C6
  const whites = [];
  for (let m = lo; m <= hi; m++) if (![1, 3, 6, 8, 10].includes(m % 12)) whites.push(m);
  const w = 280 / whites.length;
  const on = new Set(v ? v.upper : []), bass = v ? v.bass : null;
  let s = '';
  whites.forEach((m, k) => {
    const fill = m === bass ? '#ff9f0a' : on.has(m) ? '#0a84ff' : '#f2f2f7';
    s += `<rect x="${k * w}" y="0" width="${w - 0.6}" height="44" rx="1.5" fill="${fill}"/>`;
  });
  whites.forEach((m, k) => {
    const b = m + 1;
    if (b <= hi && [1, 3, 6, 8, 10].includes(b % 12)) {
      const fill = b === bass ? '#ff9f0a' : on.has(b) ? '#0a84ff' : '#1c1c1e';
      s += `<rect x="${k * w + w * 0.62}" y="0" width="${w * 0.72}" height="27" rx="1" fill="${fill}"/>`;
    }
  });
  svg.innerHTML = s;
}

// ---------------------------------------------------------------- audio actions
function audition(i, force = false) {
  if (!force && !S.settings.audition) return;
  const seg = soundingSeg(i);
  if (!seg || !seg.v) return;
  const s0 = S.settings;
  if (!engine.isLoaded(s0.chordInst) && !engine.failed[s0.chordInst]
      || (s0.bassPattern !== 'off' && !engine.isLoaded(s0.bassInst) && !engine.failed[s0.bassInst])) {
    // first tap after opening: wait for the instrument (once) instead of playing a stand-in sound
    const want = S.sel.a;
    instrumentsReady().then(() => { if (S.sel.a === want) audition(i, force); });
    return;
  }
  const ctx = engine.ensureContext();
  const t = ctx.currentTime + 0.005;
  S.auditionVoices.forEach((h) => h && h.release(t));
  const s = S.settings, dur = 1.6;
  const voices = seg.v.upper.map((m) => engine.note(s.chordInst, m, t, dur, 0.8, 'chord'));
  if (s.bassPattern !== 'off') voices.push(engine.note(s.bassInst, seg.v.bass, t, dur, 0.85, 'bass'));
  else voices.push(engine.note(s.chordInst, seg.v.bass, t, dur, 0.7, 'chord'));
  S.auditionVoices = voices;
}

// end of the last bar that has a chord in it (-1 if the chart is empty)
function songEnd() {
  const cells = S.chart.cells;
  for (let k = cells.length - 1; k >= 0; k--) if (cells[k]) return barStart(k) + S.chart.bpb;
  return -1;
}
// every cell of the song in the order it's played (repeats and endings unrolled)
function fullOrder() {
  const end = songEnd();
  if (end < 0) return [];
  let bars = end / S.chart.bpb;
  for (const k of Object.keys(S.chart.marks || {})) if (+k < S.chart.cells.length / S.chart.bpb) bars = Math.max(bars, +k + 1);
  return barsToCells(unrollBars(bars, S.chart.marks), S.chart.bpb, S.chart.cells.length);
}
// What Play plays.
//   A range is selected: just that section (with its repeats), looped if loop is on.
//   Otherwise: the whole song from the selected bar (looping back to the top if loop is on).
function playRange() {
  const full = fullOrder();
  if (!full.length) return null;
  if (isRange()) {
    const lo = selLo(), hi = selHi();
    let order = full.filter((c) => c >= lo && c <= hi);
    // a selection inside a repeat ends where its last cell last plays (not part-way into another time through)
    if (order.length) order = order.slice(0, order.lastIndexOf(Math.max(...order)) + 1);
    if (!order.length) order = Array.from({ length: hi - lo + 1 }, (_, k) => lo + k);
    return { order, from: 0, meta: { whole: false, lo, hi } };
  }
  const from = Math.max(0, full.indexOf(barStart(S.sel.a)));
  return { order: full, from, meta: { whole: true } };
}
function rangeHasSound(r) {
  return r.order.some((k) => { const s = soundingSeg(k); return s && s.v; });
}
// make sure the current instruments are decoded before sound is needed (no stand-in synth)
async function instrumentsReady() {
  const s = S.settings, ids = [s.chordInst];
  if (s.bassPattern !== 'off') ids.push(s.bassInst);
  const missing = ids.filter((id) => !engine.isLoaded(id) && !engine.failed[id]);
  if (!missing.length) return true;
  const slow = setTimeout(() => toast('Loading sounds…'), 250);
  try { await Promise.all(missing.map((id) => engine.load(id))); } catch (e) { toast("Couldn't load a sound; using a simple synth"); }
  clearTimeout(slow);
  return true;
}

let startToken = 0;
async function togglePlay() {
  engine.unlock();
  if (seq.playing || startToken) { startToken = 0; seq.stop(); clearPlayhead(); renderLoop(); return; }
  const r = playRange();
  if (!r) { toast('Add some chords first'); return; }
  if (!rangeHasSound(r)) { toast('No chord here to play'); return; }
  const token = startToken = Date.now();
  $('#btn-play').textContent = '…';
  await instrumentsReady();
  if (startToken !== token) return;              // Stop pressed while loading
  startToken = 0;
  S.auditionVoices.forEach((h) => h && h.release(engine.ctx.currentTime));
  seq.start({ order: r.order, loop: S.settings.loop, meta: r.meta }, r.from);
  renderLoop();
  requestAnimationFrame(playheadLoop);
}

// while looping, the loop follows the selection (switching at the next bar line)
function followSelection() {
  if (!seq.playing || !seq.range || !S.settings.loop) { renderLoop(); return; }
  const r = playRange();
  if (!r) return;
  seq.setRange({ order: r.order, loop: true, meta: r.meta });
  renderLoop();
}
function onLoopToggle() {
  S.settings.loop = !S.settings.loop;
  if (seq.playing && seq.range) {
    if (S.settings.loop) {
      // loop the selection (or the whole song) from here on
      const r = playRange();
      seq.range.loop = true;
      if (r) seq.setRange({ order: r.order, loop: true, meta: r.meta });
    } else {
      // stop looping: carry on to the end of the song from where we are, no restart
      seq.pending = null;
      if (!isRange()) {
        const full = fullOrder(), at = full.indexOf(seq.currentCell());
        if (at >= 0) { seq.range = { order: full, loop: false, meta: { whole: true } }; seq.beat = at; }
      }
      seq.range.loop = false;
    }
  }
  persistSoon(); renderLoop();
}

let playingCell = -1, lastRange = null;
function clearPlayhead() {
  document.querySelectorAll('#grid .playing, #grid .playbar').forEach((el) => el.classList.remove('playing', 'playbar'));
  playingCell = -1;
}
function markPlayBar(cell) {
  const bar = Math.floor(cell / S.chart.bpb);
  document.querySelectorAll('#grid .playbar').forEach((el) => el.classList.remove('playbar'));
  for (let i = bar * S.chart.bpb; i < (bar + 1) * S.chart.bpb; i++) { const e = cellEl(i); if (e) e.classList.add('playbar'); }
}
function playheadLoop() {
  const cur = seq.poll();
  if (cur && cur.cell !== playingCell) {
    const old = cellEl(playingCell); if (old) old.classList.remove('playing');
    const el = cellEl(cur.cell);
    if (el) { el.classList.add('playing'); el.scrollIntoView({ block: 'nearest' }); }
    markPlayBar(cur.cell);
    playingCell = cur.cell;
    // the sequencer may have switched to a pending range
    if (seq.range !== lastRange) { lastRange = seq.range; renderLoop(); }
  }
  if (seq.playing) requestAnimationFrame(playheadLoop);
  else setTimeout(() => { if (!seq.playing) { clearPlayhead(); renderLoop(); } }, 300);
}

function applyAudioSettings() {
  const s = S.settings;
  engine.setVolume('chord', s.volChord); engine.setVolume('bass', s.volBass); engine.setVolume('click', s.volClick);
  engine.setReverb(s.reverb);
}
function loadInstrument(id, announce) {
  const keep = [S.settings.chordInst, S.settings.bassInst];
  if (engine.isLoaded(id)) { engine.trim(keep); return; }
  const meta = engine.index.find((x) => x.id === id);
  if (announce && meta) toast(`Loading ${meta.label}…`);
  engine.load(id).then(() => { engine.trim(keep); if (announce && meta) toast(`${meta.label} ready`); })
    .catch(() => toast(`Couldn't load ${meta ? meta.label : id}; using a synth`));
}

// ---------------------------------------------------------------- transport strip
function renderTransport() {
  const chip = $('#loop-chip'); if (!chip) return;
  const s = S.settings;
  const switching = seq.playing && seq.pending && s.loop;
  const m = activeMeta();
  let main, sub;
  if (!m) { main = s.loop ? 'Loop on' : 'Loop off'; sub = 'add chords'; }
  else {
    const b0 = m.whole ? 0 : barOf(m.lo), b1 = m.whole ? 0 : barOf(m.hi);
    const span = m.whole ? 'Whole song' : b0 === b1 ? `Bar ${b0}` : `Bars ${b0}–${b1}`;
    if (s.loop) { main = span; sub = switching ? 'from next bar' : m.whole ? 'drag to loop a part' : 'looping selection'; }
    else { main = 'Loop off'; sub = m.whole ? 'plays to the end' : `plays ${span.toLowerCase()}`; }
  }
  chip.classList.toggle('on', s.loop);
  chip.querySelector('.lc-main').textContent = main;
  chip.querySelector('.lc-sub').textContent = sub;
  const play = $('#btn-play');
  play.textContent = seq.playing ? '■' : '▶';
  play.classList.toggle('on', seq.playing);
  play.setAttribute('aria-label', seq.playing ? 'Stop' : 'Play');
  $('#bpm-val').textContent = s.tempo;
}

function setTempo(t) { S.settings.tempo = Math.max(30, Math.min(320, Math.round(t) || 120)); renderTransport(); persistSoon(); }

function bindTransport() {
  fastTap($('#btn-play'), () => togglePlay());
  // tapping the chord shown above the keyboard plays it
  fastTap($('#info'), () => {
    engine.unlock(); audition(S.sel.a, true);
    const el = $('#info'); el.classList.add('pressed'); setTimeout(() => el.classList.remove('pressed'), 150);
  });
  $('#loop-chip').addEventListener('click', onLoopToggle);
  // − / + : tap for 1 BPM, hold to keep going (speeding up to 5 BPM steps)
  for (const [id, dir] of [['#tempo-down', -1], ['#tempo-up', 1]]) {
    const b = $(id);
    let timer = null, t0 = 0;
    const stop = () => { clearTimeout(timer); timer = null; };
    const repeat = () => { const fast = performance.now() - t0 > 1200; setTempo(S.settings.tempo + dir * (fast ? 5 : 1)); timer = setTimeout(repeat, fast ? 110 : 90); };
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); b._downAt = performance.now(); t0 = b._downAt; setTempo(S.settings.tempo + dir); timer = setTimeout(repeat, 420); });
    b.addEventListener('click', () => { if (!(performance.now() - (b._downAt || 0) < 800)) setTempo(S.settings.tempo + dir); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => b.addEventListener(ev, stop));
  }
  // tap tempo
  let taps = [];
  fastTap($('#bpm'), () => {
    engine.unlock();
    const now = performance.now();
    if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
    taps.push(now); if (taps.length > 5) taps.shift();
    if (engine.ctx) engine.click(engine.ctx.currentTime + 0.005, taps.length === 1);
    if (taps.length >= 2) {
      const gaps = taps.slice(1).map((t, k) => t - taps[k]);
      setTempo(60000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length));
    } else toast('Keep tapping the beat');
  });
}

// ---------------------------------------------------------------- grid gestures
function bindGrid() {
  const grid = $('#grid');
  let press = null, lastTap = null;
  grid.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.lh')) return;
    const el = e.target.closest('.cell'); if (!el) return;
    engine.unlock();
    const i = +el.dataset.i, now = performance.now();
    if (lastTap && lastTap.i === i && now - lastTap.t < 330) {     // double tap: select the bar
      const b0 = barStart(i);
      setSel(b0, Math.min(b0 + S.chart.bpb - 1, S.chart.cells.length - 1));
      lastTap = null; return;
    }
    lastTap = { i, t: now };
    setSel(i);
    hearIfOn();
    press = { i, x: e.clientX, y: e.clientY, selecting: false };
    // holding briefly also starts selecting, so the drag can go up/down across lines
    press.timer = setTimeout(() => { if (press) press.selecting = true; }, 250);
  });
  grid.addEventListener('pointermove', (e) => {
    if (!press) return;
    const dx = e.clientX - press.x, dy = e.clientY - press.y;
    if (!press.selecting) {
      if (Math.abs(dx) > 8 && Math.abs(dx) >= Math.abs(dy)) press.selecting = true;      // sideways drag: select now
      else if (Math.abs(dy) > 8) { clearTimeout(press.timer); press = null; return; }     // vertical: let the page scroll
      else return;
    }
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('.cell');
    if (el && +el.dataset.i !== S.sel.b) setSel(press.i, +el.dataset.i);
  });
  // while selecting, stop the page scrolling so the drag can cross lines
  grid.addEventListener('touchmove', (e) => { if (press && press.selecting) e.preventDefault(); }, { passive: false });
  const end = () => { if (press) clearTimeout(press.timer); press = null; };
  grid.addEventListener('pointerup', end);
  grid.addEventListener('pointercancel', end);
  grid.addEventListener('contextmenu', (e) => e.preventDefault());
}

// ---------------------------------------------------------------- text entry
function toggleTypebar(force) {
  const bar = $('#typebar');
  const show = force !== undefined ? force : bar.hidden;
  bar.hidden = !show;
  if (show) {
    const c = selChord();
    const inp = $('#type-input');
    inp.value = c ? compactText(c) : '';
    previewType();
    inp.focus(); inp.select();
  } else {
    $('#type-input').blur();
    document.body.classList.remove('typing');
  }
  updateKeys();
}
function describePlan(plan) {
  if (plan.clear) return 'Clears this cell';
  if (plan.single) return plan.single.nc ? 'N.C.' : `${chordText(plan.single)}  →  ${chordNotes(plan.single).map(noteName).join(' ')}`;
  if (plan.beats) return `${plan.beats.length} beat${plan.beats.length > 1 ? 's' : ''} from bar ${barOf(S.sel.a)}, beat ${(S.sel.a % S.chart.bpb) + 1}`;
  return `${plan.bars.length} bar${plan.bars.length > 1 ? 's' : ''} from bar ${barOf(S.sel.a)}`;
}
function previewType() {
  const v = $('#type-input').value.trim(), msg = $('#type-msg');
  msg.classList.remove('err');
  if (!v) { msg.textContent = '. = hold a beat · | = bar line · % = repeat bar'; return; }
  try { msg.textContent = describePlan(planText(v)); } catch (e) { msg.textContent = e.message; msg.classList.add('err'); }
}
// Typed text →
//   one chord            replaces the selected cell ("." clears it, "%" repeats the previous bar here)
//   tokens with "."      one token per beat from the selected cell ("." = hold)
//   several chords       one chord per bar from the selected bar
//   bars split by "|"    chords spread evenly over each bar ("." = hold, "%" = repeat previous bar, empty bar = hold)
const capTok = (t) => t.replace(/^[a-g]/, (x) => x.toUpperCase()).replace(/\/([a-g])(?=[#b♯♭]?$)/, (m, x) => '/' + x.toUpperCase());
function planText(v) {
  const bpb = S.chart.bpb;
  const parse = (t) => (t === '.' ? null : t === '%' || t === '%%' ? t : parseChord(capTok(t)));
  if (!v.includes('|')) {
    const toks = splitTokens(v);
    if (toks.length === 1) {
      if (toks[0] === '.') return { clear: true };
      if (toks[0] === '%' || toks[0] === '%%') return { bars: [[toks[0]]] };
      return { single: parseChord(capTok(toks[0])) };
    }
    if (toks.includes('.')) {
      if (toks.some((x) => x.startsWith('%'))) throw new Error('"%" repeats a bar — use it between "|" bar lines');
      return { beats: toks.map(parse) };
    }
    return { bars: toks.map((t) => [parse(t)]) };
  }
  const parts = v.split('|').map((p) => p.trim());
  if (parts[0] === '') parts.shift();
  if (parts.length && parts[parts.length - 1] === '') parts.pop();
  const bars = parts.map((p, k) => {
    const toks = splitTokens(p).map(parse);
    if (toks.length > bpb) throw new Error(`Bar ${k + 1} has ${toks.length} items but only ${bpb} beats`);
    if (toks.includes('%%') && toks.length > 1) throw new Error(`"%%" (repeat two bars) must be on its own in bar ${k + 1}`);
    const at = toks.indexOf('%');
    if (at >= 0 && toks.length > 1 && !(toks.length === 2 && at === 1 && toks[0] && bpb % 2 === 0)) {
      throw new Error(`In bar ${k + 1}, "%" goes on its own (repeat the bar before) or second of two ("C7 %": repeat the half bar)`);
    }
    return toks;
  });
  return { bars };
}
function placeBar(toks) {
  const bpb = S.chart.bpb, out = new Array(bpb).fill(null);
  if (!toks.length) return out;
  const explicit = toks.includes(null);
  toks.forEach((c, j) => { const pos = explicit ? j : Math.floor((j * bpb) / toks.length); if (c) out[pos] = cloneChord(c); });
  return out;
}
function applyType() {
  const v = $('#type-input').value.trim();
  if (!v) return;
  let plan;
  try { plan = planText(v); } catch (e) { $('#type-msg').textContent = e.message; $('#type-msg').classList.add('err'); return; }
  const cells = S.chart.cells, bpb = S.chart.bpb;
  if (plan.clear) { edit(() => { cells[S.sel.a] = null; }, { audition: false }); toggleTypebar(false); return; }
  if (plan.single) { setSelChord(plan.single); toggleTypebar(false); return; }
  if (plan.beats) {
    const at = S.sel.a;
    edit(() => { ensureLength(at + plan.beats.length); plan.beats.forEach((c, k) => { cells[at + k] = c ? cloneChord(c) : null; }); }, { audition: false });
    setSel(at, at + plan.beats.length - 1);
    toggleTypebar(false); return;
  }
  const start = barStart(S.sel.a), b0 = start / bpb;
  const nBars = plan.bars.reduce((n, toks) => n + (toks[0] === '%%' ? 2 : 1), 0);
  const fail = (msg) => { $('#type-msg').textContent = msg; $('#type-msg').classList.add('err'); };
  if (plan.bars[0][0] === '%' && plan.bars[0].length === 1 && b0 < 1) { fail('Nothing before this bar to repeat'); return; }
  if (plan.bars[0][0] === '%%' && b0 < 2) { fail('A two-bar repeat needs two bars before it'); return; }
  if (!S.chart.marks) S.chart.marks = {};
  edit(() => {
    ensureLength(start + nBars * bpb);
    let b = b0;
    plan.bars.forEach((toks) => {
      const m = markOf(b); delete m.sim;
      if (toks[0] === '%' && toks.length === 1) m.sim = 'bar';
      else if (toks[0] === '%%') { m.sim = 'two'; if (S.chart.marks[b + 1]) delete S.chart.marks[b + 1].sim; }
      else if (toks[1] === '%') m.sim = 'half';
      const placed = m.sim === 'bar' || m.sim === 'two' ? new Array(bpb * (m.sim === 'two' ? 2 : 1)).fill(null)
        : m.sim === 'half' ? placeBar([toks[0], ...new Array(bpb / 2 - 1).fill(null)]).map((c, j) => (j < bpb / 2 ? c : null))
        : placeBar(toks);
      placed.forEach((c, j) => { cells[b * bpb + j] = c; });
      b += m.sim === 'two' ? 2 : 1;
    });
  }, { audition: false });
  setSel(start, start + nBars * bpb - 1);
  toggleTypebar(false);
  toast(`Entered ${nBars} bar${nBars > 1 ? 's' : ''}`);
}

// ---------------------------------------------------------------- top bar, sheets, shortcuts
const sheetOpen = () => [...document.querySelectorAll('.sheet')].some((s) => !s.hidden);
function bindTopbar() {
  $('#btn-settings').addEventListener('click', () => openSheet('settings'));
  $('#btn-charts').addEventListener('click', () => openSheet('charts'));
  $('#title').addEventListener('click', () => openSheet('charts'));
  const inp = $('#type-input');
  inp.addEventListener('input', previewType);
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); applyType(); } if (e.key === 'Escape') toggleTypebar(false); });
  // while the iOS keyboard is up, hide the chord keyboard and transport so the type bar stays visible
  inp.addEventListener('focus', () => document.body.classList.add('typing'));
  inp.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== inp) document.body.classList.remove('typing'); }, 150));
  $('#type-go').addEventListener('click', applyType);
  $('#type-close').addEventListener('click', () => toggleTypebar(false));
  document.querySelectorAll('.sheet').forEach((sh) => sh.addEventListener('click', (e) => { if (e.target === sh || e.target.hasAttribute('data-close')) closeSheets(); }));
  document.addEventListener('keydown', (e) => {               // hardware keyboard shortcuts (iPad / Mac)
    if (sheetOpen()) { if (e.key === 'Escape') closeSheets(); return; }
    const t = e.target;
    if (t && t !== document.body && (t.closest('input, textarea, select, button, [role=button], [contenteditable]'))) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if ((e.metaKey || e.ctrlKey) && k === 'z') { e.preventDefault(); keyAction(e.shiftKey ? 'redo' : 'undo'); return; }
    if ((e.metaKey || e.ctrlKey) && k === 'y') { e.preventDefault(); keyAction('redo'); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === ' ') { e.preventDefault(); togglePlay(); }
    else if (e.key === 'ArrowLeft') keyAction('left');
    else if (e.key === 'ArrowRight') keyAction('right');
    else if (e.key === 'ArrowUp') { e.preventDefault(); keyAction('up'); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); keyAction('down'); }
    else if (e.key === 'Backspace' || e.key === 'Delete') keyAction('clear');
    else if (e.key === 'Enter') { e.preventDefault(); toggleTypebar(true); }
  });
}
function updateTopbar() {
  $('#title').textContent = S.chart.title;
  renderTransport();
  updateSyncLabel();
}
// ---- backups: every chart in one file (each Home Screen app keeps its own charts, so this moves them)
function backupText() {
  syncCurrent();
  return JSON.stringify({ app: 'ifake', kind: 'backup', version: 1, saved: new Date().toISOString(), charts: S.charts }, null, 1);
}
async function saveBackup() {
  const name = `iFake charts ${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([backupText()], name, { type: 'application/json' });
  try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
// a chart already here keeps whichever copy was changed last; restored charts are no longer "deleted"
function restoreBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error("That isn't a backup file"); }
  const charts = data && Array.isArray(data.charts) ? data.charts : null;
  if (!charts) throw new Error("That isn't an iFake backup");
  syncCurrent();
  let added = 0, updated = 0;
  for (const c of charts) {
    if (!c || !c.id || !Array.isArray(c.cells)) continue;
    try { deserialise(c); } catch (e) { continue; }
    delete S.deleted[c.id];
    const i = S.charts.findIndex((x) => x.id === c.id);
    if (i < 0) { S.charts.push(c); added++; }
    else if ((c.updatedAt || 0) > (S.charts[i].updatedAt || 0)) { S.charts[i] = c; updated++; }
  }
  const cur = S.charts.find((x) => x.id === S.chart.id);
  if (cur) { S.chart = deserialise(cur); invalidate(); }
  persist(); renderAll(); renderCharts();
  toast(added || updated ? `Restored: ${added} new, ${updated} updated` : 'Nothing new in that backup');
}
function updateSyncLabel() {
  const el = $('#sync-status');
  if (!el) return;
  const st = store.status;
  el.textContent = st === 'synced' ? 'Saved to your account' : st === 'syncing' ? 'Saving to your account…'
    : st === 'sync failed' ? 'Account sync failed — saved in this browser' : st === 'unsaved' ? 'Not saved — this browser blocks storage' : 'Saved in this browser';
  el.classList.toggle('warn', st === 'unsaved' || st === 'sync failed');
}

function closeSheets() { document.querySelectorAll('.sheet').forEach((s) => { s.hidden = true; }); }
function openSheet(which) {
  closeSheets();
  if (which === 'settings') renderSettings(); else renderCharts();
  $('#sheet-' + which).hidden = false;
}

function optionList(items, cur) { return items.map((o) => `<option value="${o.id}"${String(o.id) === String(cur) ? ' selected' : ''}>${esc(o.label)}</option>`).join(''); }
function instrumentOptions(cur, bass) {
  const groups = {};
  const all = [...SYNTHS, ...engine.index];
  for (const x of all) {
    if (bass ? !(x.bass || x.group === 'Built-in synths') : x.bass) continue;
    (groups[x.group] = groups[x.group] || []).push(x);
  }
  return Object.entries(groups).map(([g, xs]) => `<optgroup label="${esc(g)}">${optionList(xs, cur)}</optgroup>`).join('');
}
// cells per line must hold whole bars
const cplChoices = (bpb) => { const out = []; for (let n = bpb * 2; n <= 32; n += bpb) out.push(n); return out; };

function renderSettings() {
  const s = S.settings, ch = S.chart;
  const range = (id, label, min, max, step, val) => `<div class="row"><label for="${id}">${label}</label><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${val}"><span class="val" id="${id}-v">${Math.round(val * 100)}%</span></div>`;
  $('#settings-body').innerHTML = `
    <div class="group"><h3>Sound</h3>
      <div class="row"><label for="st-chord">Chord sound</label><select id="st-chord">${instrumentOptions(s.chordInst, false)}</select></div>
      <div class="row"><label for="st-comp">Rhythm</label><select id="st-comp">${optionList(COMP_PATTERNS, s.compPattern)}</select></div>
      <div class="row"><label for="st-voicing">Voicing</label><select id="st-voicing">${optionList(VOICINGS, s.voicing)}</select></div>
      <div class="row"><label for="st-bpat">Bass line</label><select id="st-bpat">${optionList(BASS_PATTERNS, s.bassPattern)}</select></div>
      <div class="row"><label for="st-bass">Bass sound</label><select id="st-bass">${instrumentOptions(s.bassInst, true)}</select></div>
      ${range('st-swing', 'Swing', 0, 1, 0.05, s.swing)}
      ${range('st-reverb', 'Reverb', 0, 0.6, 0.01, s.reverb)}
    </div>
    <div class="group"><h3>Tempo, click &amp; count-in</h3>
      <div class="row"><label for="st-tempo">Tempo (BPM)</label><input id="st-tempo" type="number" inputmode="numeric" min="30" max="320" value="${s.tempo}"></div>
      <div class="row"><label for="st-click">Click during playback</label><input id="st-click" type="checkbox"${s.click ? ' checked' : ''}></div>
      <div class="row"><label for="st-count">Count-in</label><select id="st-count">${optionList([{ id: '0', label: 'None' }, { id: '1', label: '1 bar' }, { id: '2', label: '2 bars' }], String(s.countIn))}</select></div>
    </div>
    <div class="group"><h3>Volume</h3>
      ${range('st-vchord', 'Chords', 0, 1, 0.01, s.volChord)}
      ${range('st-vbass', 'Bass', 0, 1, 0.01, s.volBass)}
      ${range('st-vclick', 'Click', 0, 1, 0.01, s.volClick)}
    </div>
    <div class="group"><h3>Chart</h3>
      <div class="row"><label for="st-title">Title</label><input id="st-title" type="text" value="${esc(ch.title)}"></div>
      <div class="row"><label for="st-bpb">Beats per bar</label><select id="st-bpb">${optionList([2, 3, 4, 5, 6, 7, 8].map((n) => ({ id: String(n), label: String(n) })), String(ch.bpb))}</select></div>
      <div class="row"><label for="st-cpl">Cells per line</label><select id="st-cpl">${optionList(cplChoices(ch.bpb).map((n) => ({ id: String(n), label: `${n} (${n / ch.bpb} bars)` })), String(ch.cpl))}</select></div>
      <div class="row"><label for="st-aud">Play chords while editing</label><input id="st-aud" type="checkbox"${s.audition ? ' checked' : ''}></div>
    </div>
    <div class="group"><h3>Gestures</h3>
      <dl class="howto">
        <dt>Tap cell</dt><dd>select + hear</dd>
        <dt>Drag across</dt><dd>select a range (hold first to cross lines)</dd>
        <dt>Double-tap</dt><dd>select bar</dd>
        <dt>Blue handles</dt><dd>resize loop</dd>
        <dt>Loop on</dt><dd>loops the song, or the selection</dd>
        <dt>Tap ♪ strip</dt><dd>hear chord</dd>
        <dt>Tap BPM</dt><dd>tap tempo</dd>
        <dt>/ then letter</dt><dd>bass note</dd>
        <dt>⌨</dt><dd>type a chord, or bars: D-7 G7 | C^7</dd>
        <dt>−½ +½</dt><dd>transpose range or chart</dd>
      </dl>
    </div>`;
  const on = (id, ev, fn) => $('#' + id).addEventListener(ev, fn);
  const setS = (k, v, retime = false) => { S.settings[k] = v; if (retime) invalidate(); applyAudioSettings(); persistSoon(); };
  on('st-chord', 'change', (e) => { setS('chordInst', e.target.value); loadInstrument(e.target.value, true); });
  on('st-bass', 'change', (e) => { setS('bassInst', e.target.value); loadInstrument(e.target.value, true); });
  on('st-comp', 'change', (e) => setS('compPattern', e.target.value));
  on('st-bpat', 'change', (e) => { setS('bassPattern', e.target.value); if (e.target.value !== 'off') loadInstrument(S.settings.bassInst, true); });
  on('st-voicing', 'change', (e) => { setS('voicing', e.target.value, true); renderInfo(); });
  on('st-tempo', 'change', (e) => setTempo(+e.target.value));
  on('st-click', 'change', (e) => setS('click', e.target.checked));
  on('st-count', 'change', (e) => setS('countIn', +e.target.value));
  on('st-aud', 'change', (e) => setS('audition', e.target.checked));
  for (const [id, key] of [['st-swing', 'swing'], ['st-reverb', 'reverb'], ['st-vchord', 'volChord'], ['st-vbass', 'volBass'], ['st-vclick', 'volClick']]) {
    on(id, 'input', (e) => { setS(key, +e.target.value); $('#' + id + '-v').textContent = Math.round(e.target.value * 100) + '%'; });
  }
  on('st-title', 'change', (e) => { S.chart.title = e.target.value.trim() || 'Untitled'; updateTopbar(); persistSoon(); });
  on('st-cpl', 'change', (e) => { edit(() => { S.chart.cpl = +e.target.value; padCells(S.chart); }, { audition: false }); S.settings.lastCpl = S.chart.cpl; });
  on('st-bpb', 'change', (e) => {
    const bpb = +e.target.value;
    let dropped = 0;
    edit(() => {
      const old = S.chart.bpb, cells = [], at = (i) => Math.floor(i / old) * bpb + Math.min(i % old, bpb - 1);
      for (let b = 0; b * old < S.chart.cells.length; b++) {
        const bar = S.chart.cells.slice(b * old, b * old + old);
        for (let k = 0; k < bpb; k++) cells.push(bar[k] || null);
        dropped += bar.slice(bpb).filter(Boolean).length;
      }
      if (S.sel) S.sel = { ...S.sel, a: at(S.sel.a), b: at(S.sel.b) };
      S.chart.cells = cells; S.chart.bpb = bpb;
      if (S.chart.cpl % bpb) {                        // keep whole bars on each line
        const choices = cplChoices(bpb);
        S.chart.cpl = choices.reduce((best, n) => (Math.abs(n - S.chart.cpl) < Math.abs(best - S.chart.cpl) ? n : best), choices[0]);
        padCells(S.chart);
      }
    }, { audition: false });
    S.settings.lastBpb = bpb; S.settings.lastCpl = S.chart.cpl;
    if (dropped) toast(`${dropped} chord${dropped > 1 ? 's' : ''} past beat ${bpb} removed · Undo brings ${dropped > 1 ? 'them' : 'it'} back`);
    renderSettings();
  });
}

function renderCharts() {
  persist();
  const items = S.charts.map((c) => `
    <div class="chart-item${c.id === S.chart.id ? ' current' : ''}" data-id="${c.id}">
      <span class="name" data-open>${esc(c.title)}</span>
      <button data-dup>Duplicate</button><button data-del class="del">Delete</button>
    </div>`).join('');
  $('#charts-body').innerHTML = `
    <div class="btn-row"><button class="btn" id="ch-new">New chart</button></div>
    <div class="group">${items}</div>
    <p class="hint" id="sync-status"></p>
    <details class="group more"><summary>Export, import and backup</summary>
      <h3>This chart as text</h3>
      <textarea class="io" id="ch-export" readonly>${esc(chartToText(S.chart))}</textarea>
      <div class="btn-row"><button class="btn secondary" id="ch-copy">Copy</button></div>
      <h3>Import</h3>
      <textarea class="io" id="ch-import" placeholder="Title: My tune&#10;Cells: 16/line, 4/bar&#10;| C-7 . . . | F7 . . . | B♭Δ7 . . . | . . . . |"></textarea>
      <div class="btn-row"><button class="btn secondary" id="ch-import-go">Import</button></div>
      <p class="hint" id="ch-import-msg"></p>
      <h3>All charts</h3>
      <p class="hint">A backup holds every chart, to move them to another device or to the app at a new address.</p>
      <div class="btn-row"><button class="btn secondary" id="ch-backup">Save a backup</button><button class="btn secondary" id="ch-backup-copy">Copy backup</button>
        <label class="btn secondary file">Restore a backup…<input type="file" id="ch-restore" accept=".json,application/json,text/plain" hidden></label></div>
      <div class="btn-row"><button class="btn secondary" id="ch-demo">Add the demo chart</button></div>
    </details>`;
  updateSyncLabel();
  $('#charts-body').querySelectorAll('.chart-item').forEach((row) => {
    const id = row.dataset.id;
    row.querySelector('[data-open]').addEventListener('click', () => { switchChart(id); closeSheets(); });
    row.querySelector('[data-dup]').addEventListener('click', () => {
      const src = id === S.chart.id ? deserialise(serialise(S.chart)) : deserialise(S.charts.find((c) => c.id === id));
      src.id = uid(); src.title += ' (copy)';
      S.charts.unshift({ ...serialise(src), updatedAt: Date.now() }); switchChart(src.id); renderCharts();
    });
    row.querySelector('[data-del]').addEventListener('click', () => {
      if (row.dataset.confirm !== '1') { row.dataset.confirm = '1'; row.querySelector('[data-del]').textContent = 'Delete?'; return; }
      S.charts = S.charts.filter((c) => c.id !== id);
      S.deleted[id] = Date.now();
      if (!S.charts.length) S.charts = [{ ...serialise(blankChart()), updatedAt: Date.now() }];
      if (id === S.chart.id) switchChart(S.charts[0].id, { saveCurrent: false }); else persist();
      renderCharts();
    });
  });
  $('#ch-new').addEventListener('click', () => { const c = blankChart(); S.charts.unshift({ ...serialise(c), updatedAt: Date.now() }); switchChart(c.id); closeSheets(); });
  $('#ch-demo').addEventListener('click', () => { const c = demoChart(); S.charts.unshift({ ...serialise(c), updatedAt: Date.now() }); switchChart(c.id); closeSheets(); });
  $('#ch-copy').addEventListener('click', async () => {
    const ta = $('#ch-export');
    try { await navigator.clipboard.writeText(ta.value); toast('Copied'); } catch (e) { ta.focus(); ta.select(); toast('Select all and copy'); }
  });
  $('#ch-backup').addEventListener('click', saveBackup);
  $('#ch-backup-copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(backupText()); toast('Backup copied'); } catch (e) { toast("Couldn't copy: use Save a backup"); } });
  $('#ch-restore').addEventListener('change', async (e) => { const f = e.target.files[0]; if (f) { try { restoreBackup(await f.text()); } catch (err) { toast(err.message); } } });
  $('#ch-import-go').addEventListener('click', () => {
    try {
      if (/^\s*\{/.test($('#ch-import').value)) { restoreBackup($('#ch-import').value); return; }     // a backup pasted in
      const c = textToChart($('#ch-import').value);
      if (!c.cells.some(Boolean)) throw new Error('No chords found — bars must start with "|"');
      S.charts.unshift({ ...serialise(c), updatedAt: Date.now() }); switchChart(c.id); closeSheets(); toast('Imported');
    } catch (e) { $('#ch-import-msg').textContent = e.message; }
  });
}

function switchChart(id, opts = {}) {
  if (opts.saveCurrent !== false) syncCurrent();
  if (seq.playing) seq.stop();
  const target = S.charts.find((c) => c.id === id) || S.charts[0];
  S.chart = deserialise(target);
  S.undo = []; S.redo = []; invalidate();
  S.sel = { a: 0, b: 0 };
  renderAll(); persist();
}

// ---------------------------------------------------------------- toast
let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 1700);
}

// ---------------------------------------------------------------- boot
function renderAll() { renderGrid(); renderInfo(); updateKeys(); updateTopbar(); }

async function boot() {
  const local = store.loadLocal();
  loadData(local);
  buildKeyboard(); bindGrid(); bindLoopHandles(); bindTopbar(); bindTransport();
  renderAll();
  if (!store.localOk) { warnedUnsaved = true; toast("This browser isn't saving — use Charts → Export to keep your work"); }
  window.addEventListener('resize', () => { fitChordText(); renderLoop(); });
  // save straight away when the page is hidden or closed (the normal save waits 0.4 s)
  const flush = () => { if (persistTimer) persist(); store.flushNow(); };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  // audio: create the context early so samples decode before the first tap
  try { engine.ensureContext(); } catch (e) { /* no Web Audio */ }
  applyAudioSettings();
  await engine.loadIndex();
  loadInstrument(S.settings.chordInst, false);
  if (S.settings.bassPattern !== 'off') loadInstrument(S.settings.bassInst, false);
  const unlockOnce = () => engine.unlock();
  ['pointerdown', 'touchend', 'click', 'keydown'].forEach((ev) => document.addEventListener(ev, unlockOnce, { passive: true }));
  store.watchTabs();
  store.connectRemote(() => libraryData()).then(updateSyncLabel);
  // offline / Home Screen install when served from its own site (not inside claude.ai)
  if ('serviceWorker' in navigator && window.self === window.top && (location.protocol === 'https:' || location.hostname === 'localhost') && !location.hostname.endsWith('claude.ai')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
    watchForUpdates();
  }
  window.__chordpad = { S, engine, seq, store, timeline, keyAction, setSel, applyType, planText, playRange, persist, libraryData, chartToText, textToChart };   // for testing
}
boot();

// A Home Screen app is resumed rather than reloaded, so look for a new build whenever it comes back to the
// front; when one has taken over, offer a reload.
function watchForUpdates() {
  const sw = navigator.serviceWorker, had = !!sw.controller;
  sw.addEventListener('controllerchange', () => { if (had) showUpdateBar(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sw.getRegistration().then((r) => r && r.update()).catch(() => {});
  });
}
function showUpdateBar() {
  if (document.getElementById('update-bar')) return;
  const b = document.createElement('button');
  b.id = 'update-bar'; b.textContent = 'Update ready · tap to reload';
  b.onclick = () => { try { persist(); } catch (e) { /* saved already */ } location.reload(); };
  document.body.appendChild(b);
}
