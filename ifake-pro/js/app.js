// app.js — Lead Sheet: melody (MuseScore-style entry) + chords (Chord Pad keys) + bars (repeats, structure).
import {
  LETTERS, note, noteName, parseChord, chordText, chordNotes, chordIntervals, ivlName, ivlSemis, NC,
  toggleQual, toggleExt, hasExt, parseInterval, transposeChord, enharmonic, cloneChord, notePC, accStr, qualityText, extName,
} from './chords.js';
import { voiceChord, VOICINGS } from './voicing.js';
import { AudioEngine, Sequencer, SYNTHS, COMP_PATTERNS, BASS_PATTERNS } from './audio.js';
import { Store } from './store.js';
import { shiftMarks } from './form.js';
import {
  TPQ, beatTicks, positions, evTicks, enter, toRest, normCursor, eventAt, midiOf, spellMidi, respell, pitchName,
  playableNotes, parseMelody, setMelody, melodyText, emptyMeasure, restsFor, cloneEv, keyAccidental, KEY_NAMES,
} from './melody.js';
import { nameChord, chordKeys, nameTable } from './recognise.js';
import { layoutGrid } from './grid.js';
import { newSong, songFromText, songToText, serialiseSong, deserialiseSong, cellMap, playOrder, parseChordBars, barNumber,
  hasChords, slotList, beatGrid, getSlot, setSlot, setDivision, copyChords, mapChords, fillChords,
  simFits, simCover, clearUnderSim, tidySims, playedMeasures, slashMark, syncSlashes } from './song.js';
import { renderScore, hitTest } from './score.js';
import { DEMO_SONG_TEXT } from './demo.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const mod = (a, n) => ((a % n) + n) % n;
const SOUND_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path class="w" d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path class="x" d="M16 9l6 6M22 9l-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
// the sound button: a speaker; struck through (orange) when the sound isn't running. Tapping it starts the
// sound afresh (for when iOS has left it silent or late after the app was away)
function updateSoundBtn() { const b = document.getElementById('btn-sound'); if (b) b.classList.toggle('off', !engine.ok); }


const DEFAULT_SETTINGS = {
  loop: true, melodyInst: 'altosax', chordInst: 'piano', bassInst: 'upbass', compPattern: 'block', bassPattern: 'off',
  voicing: 'smooth', swing: 0, swingOn: true, swingAmt: 0.8, click: false, countIn: 0, reverb: 0.15,
  volMelody: 0.9, volChord: 0.65, volBass: 0.8, volClick: 0.5, audition: true, playMelody: true, playChords: true, scoreBars: 'auto', gridBars: 4, evenChords: false, split: 'auto', foldAdjust: 0, pianoMode: 'draft', draftLatchChords: true, draftLatchMelody: false, draftFollowChords: true, draftFollowMelody: false,
};

// ---------------------------------------------------------------- state
const S = {
  settings: { ...DEFAULT_SETTINGS }, settingsAt: 0,
  charts: [], deleted: {},            // song library (serialised)
  song: null,
  layer: 'melody',
  cursor: { m: 0, pos: 0 },           // where the next note goes
  sel: null,                          // { m, i } selected / last entered event
  picked: false,                      // the selection was tapped (durations then change it)
  dur: { b: 4, d: 0 }, tup: 0,        // current entry duration and tuplet
  bigBase: 48,                        // split layout: big piano's lowest C
  ck: { notes: [], dirty: false, slot: '', text: '' }, strikes: [],   // Chords + Edit: the latched keys (see chordEdit)
  sketch: { notes: [] },              // Draft + Latch not following the selection: a free sketchpad
  nk: { notes: [], dirty: false, key: '' },   // Draft + Latch following the selected note (Melody tab)
  held: new Map(),                    // draft mode: pointerId → { midi, h } for keys held down
  pianoBase: 60,                      // lowest C on the piano strip
  cs: { m: 0, beat: 0 },              // selected chord cell
  bars: null,                         // { a, b } bar range (loop / bar tools)
  bassMode: false, target: 'root',
  undo: [], redo: [], clip: null,
  layout: null, tl: null, auditionVoices: [],
};

const engine = new AudioEngine('samples/');
const seq = new Sequencer(engine, () => timeline(), () => playSettings(), () => {});
const store = new Store((merged) => applyExternal(merged), 'leadsheet.v1');

// ---------------------------------------------------------------- persistence
function loadData(data) {
  if (data && data.charts && data.charts.length) {
    S.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
    S.settingsAt = data.settingsAt || 0;
    S.charts = data.charts; S.deleted = data.deleted || {};
    S.song = deserialiseSong(S.charts.find((c) => c.id === data.currentId) || S.charts[0]);
  } else {
    S.charts = [demoChart()];
    S.song = deserialiseSong(S.charts[0]);
    S.deleted = {};
  }
  S.lastSettingsJSON = JSON.stringify(S.settings);
  resetSelection();
  applyAudioSettings();
}
// The test chart shown when there are no songs yet. It has a fixed id and an old date, so it never
// outranks a real copy, and tidyLibrary drops it once real songs arrive (from the account or GitHub).
const DEMO_ID = 'demo-stella';
function demoChart() { const s = songFromText(DEMO_SONG_TEXT); s.id = DEMO_ID; return { ...serialiseSong(s), updatedAt: 1 }; }
const normChart = (c) => { try { const o = serialiseSong(deserialiseSong(c)); delete o.id; return JSON.stringify(o); } catch (e) { return null; } };
// Unedited copies of the test chart pile up when an empty browser meets the account copy: keep one.
function tidyLibrary() {
  syncCurrent();
  const demo = normChart(demoChart());
  const copies = S.charts.filter((c) => !c.gh && normChart(c) === demo);     // GitHub songs are left alone
  if (!copies.length) return false;
  const others = S.charts.length - copies.length;
  const real = copies.filter((c) => c.id !== DEMO_ID);
  const keep = others && !real.length ? null
    : (copies.find((c) => c.id === S.song.id && c.id !== DEMO_ID) || real.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0] || copies[0]);
  const drop = copies.filter((c) => c !== keep);
  if (!drop.length) return false;
  const now = Date.now();
  for (const c of drop) S.deleted[c.id] = now;
  S.charts = S.charts.filter((c) => !drop.includes(c));
  if (!S.charts.some((c) => c.id === S.song.id)) { S.song = deserialiseSong(S.charts.find((c) => c === keep) || S.charts[0]); resetSelection(); }
  return true;
}

// ---- songs from GitHub: ifake-pro/songs/*.txt (listed in songs/index.json by tools/stamp.py) are added
// to the library. A song changed on GitHub replaces the copy here, unless that copy was edited here: then
// the edited copy is kept alongside as "… (my edits)". Deleting a GitHub song here keeps it deleted.
let repoSyncing = false;
async function syncRepoSongs() {
  if (repoSyncing) return;
  repoSyncing = true;
  try { await syncRepoSongsNow(); } finally { repoSyncing = false; }
}
async function syncRepoSongsNow() {
  if (/[?&]nosongs\b/.test(location.search)) return;          // tests start from the test chart
  let list;
  try { const r = await fetch('songs/index.json', { cache: 'no-cache' }); if (!r.ok) return; list = (await r.json()).songs || []; } catch (e) { return; }
  const added = [], updated = [], kept = [], failed = [];
  for (const e of list) {
    const id = 'gh:' + e.file.replace(/\.txt$/, '');
    if (S.deleted[id]) continue;
    syncCurrent();
    const local = S.charts.find((c) => c.id === id);
    if (local && local.gh === e.hash) continue;
    let s;
    try { const r = await fetch('songs/' + encodeURIComponent(e.file) + '?v=' + e.hash); if (!r.ok) continue; s = songFromText(await r.text()); }
    catch (err) { failed.push(e.title || e.file); continue; }
    s.id = id;
    const now = Date.now(), chart = { ...serialiseSong(s), gh: e.hash, ghAt: now, updatedAt: now };
    syncCurrent();
    const idx = S.charts.findIndex((c) => c.id === id), cur = idx >= 0 ? S.charts[idx] : null;
    if (!cur) { S.charts.push(chart); added.push(s.title); continue; }
    if ((cur.updatedAt || 0) > (cur.ghAt || 0)) {          // edited here since it last came from GitHub
      const mine = { ...cur, id: uid(), title: cur.title + ' (my edits)', updatedAt: now };
      delete mine.gh; delete mine.ghAt;
      S.charts.splice(idx + 1, 0, mine); kept.push(mine.title);
    }
    S.charts[idx] = chart; updated.push(s.title);
    if (S.song.id === id) {                      // the open song changed underneath: fresh undo, right tab
      S.song = deserialiseSong(chart); S.undo = []; S.redo = [];
      if (S.song.chartOnly && S.layer === 'melody') S.layer = 'chords';
      clampSelection(); invalidate();
    }
  }
  const tidied = tidyLibrary();
  if (failed.length) toast(`Couldn't read ${failed.length > 1 ? `${failed.length} GitHub songs` : `"${failed[0]}" from GitHub`}`);
  if (!added.length && !updated.length && !tidied) return;
  persist(); renderAll();
  const n = added.length + updated.length;
  if (n) toast(kept.length ? `${n} song${n > 1 ? 's' : ''} from GitHub · your edits kept as "${kept[0]}"` : `${n} song${n > 1 ? 's' : ''} from GitHub`);
}
function resetSelection() {
  S.cursor = { m: S.song.pickup ? 0 : 0, pos: 0 }; S.sel = null; S.picked = false; S.cs = { m: S.song.pickup ? 1 : 0, beat: 0 };
  S.bars = null; S.undo = []; S.redo = []; S.tl = null;
  if (S.cs.m >= S.song.measures.length) S.cs.m = 0;
}
function syncCurrent() {
  const ser = serialiseSong(S.song);
  const idx = S.charts.findIndex((c) => c.id === S.song.id);
  const old = idx >= 0 ? S.charts[idx] : null;
  if (old && old.gh) { ser.gh = old.gh; ser.ghAt = old.ghAt; }
  const strip = (c) => JSON.stringify({ ...c, updatedAt: 0 });
  ser.updatedAt = old && strip(old) === strip(ser) ? old.updatedAt : Date.now();
  if (idx >= 0) S.charts[idx] = ser; else S.charts.unshift(ser);
  const sj = JSON.stringify(S.settings);
  if (sj !== S.lastSettingsJSON) { S.settingsAt = Date.now(); S.lastSettingsJSON = sj; }
}
const libraryData = () => { syncCurrent(); return { version: 1, currentId: S.song.id, charts: S.charts, deleted: S.deleted, settings: S.settings, settingsAt: S.settingsAt }; };
let persistTimer = null, warnedUnsaved = false;
function persist() {
  clearTimeout(persistTimer); persistTimer = null;
  const ok = store.save(libraryData());
  if (!ok && !warnedUnsaved) { warnedUnsaved = true; toast("This browser isn't saving — use Songs → Export"); }
  updateSyncLabel();
}
const persistSoon = () => { clearTimeout(persistTimer); persistTimer = setTimeout(persist, 400); };
function applyExternal(merged) {
  syncCurrent();
  const mine = S.charts.find((c) => c.id === S.song.id);
  S.charts = merged.charts.length ? merged.charts : S.charts;
  S.deleted = merged.deleted || S.deleted;
  if ((merged.settingsAt || 0) > S.settingsAt && merged.settings) {
    S.settings = { ...DEFAULT_SETTINGS, ...merged.settings }; S.settingsAt = merged.settingsAt; S.lastSettingsJSON = JSON.stringify(S.settings);
    applyAudioSettings(); invalidate(); preloadInstruments();
  }
  const theirs = S.charts.find((c) => c.id === S.song.id);
  if (!theirs) { S.song = deserialiseSong(S.charts[0]); resetSelection(); }
  else if (!mine || (theirs.updatedAt || 0) > (mine.updatedAt || 0)) { S.song = deserialiseSong(theirs); clampSelection(); invalidate(); }
  if (tidyLibrary()) persistSoon();
  renderAll();
  toast('Songs updated from another device or tab');
}

// ---------------------------------------------------------------- editing helpers
function snapshot() { return JSON.stringify(serialiseSong(S.song)); }
function edit(fn, opts = {}) {
  const before = snapshot();
  let r;
  try { r = fn(); } catch (e) {               // a failed edit leaves the song exactly as it was
    const id = S.song.id; S.song = deserialiseSong(JSON.parse(before)); S.song.id = id; clampSelection(); invalidate(); throw e;
  }
  if (r === false) return;
  tidySims(S.song); syncSlashes(S.song);
  S.undo.push(before); if (S.undo.length > 200) S.undo.shift(); S.redo = [];
  afterEdit(opts);
}
function afterEdit(opts = {}) {
  invalidate();
  if (opts.hear) opts.hear();
  render();
  persistSoon();
  followBars();
}
function undoRedo(which) {
  const from = which === 'undo' ? S.undo : S.redo, to = which === 'undo' ? S.redo : S.undo;
  if (!from.length) { toast(`Nothing to ${which}`); return; }
  to.push(snapshot());
  const id = S.song.id;
  S.song = deserialiseSong(JSON.parse(from.pop())); S.song.id = id;
  clampSelection(); afterEdit();
}
function clampSelection() {
  const n = S.song.measures.length;
  S.cursor = normCursor(S.song, { m: Math.min(S.cursor.m, n - 1), pos: S.cursor.pos });
  if (S.sel && (S.sel.m >= n || !S.song.measures[S.sel.m].ev[S.sel.i])) S.sel = null;
  S.cs.m = Math.min(S.cs.m, n - 1);
  const cm = S.song.measures[S.cs.m];
  S.cs.beat = Math.min(S.cs.beat, cm.ch.length - 1);
  if (beatGrid(cm, S.cs.beat).n === 0) S.cs.beat--;                     // inside a quarter-note triplet: its first beat
  S.cs.k = Math.min(S.cs.k || 0, beatGrid(cm, S.cs.beat).n - 1);
  if (S.bars) { S.bars.a = Math.min(S.bars.a, n - 1); S.bars.b = Math.min(S.bars.b, n - 1); }
}
const selEv = () => (S.sel && S.song.measures[S.sel.m] ? S.song.measures[S.sel.m].ev[S.sel.i] : null);
// the selected chord slot: bar m, beat, slot k within the beat's division
const csMeas = () => S.song.measures[S.cs.m];
const csChord = () => getSlot(csMeas(), S.cs.beat, S.cs.k || 0);
const csPos = () => { const x = slotList(csMeas()).find((y) => y.b === S.cs.beat && y.k === (S.cs.k || 0)); return x ? x.pos : S.cs.beat; };
function selectSlot(m, b, k = 0) { S.cs = { m, beat: b, k }; S.bassMode = false; S.target = 'root'; }
const FRAC = [[1 / 4, '¼'], [1 / 3, '⅓'], [1 / 2, '½'], [2 / 3, '⅔'], [3 / 4, '¾']];
const posLabel = (pos) => { const b = Math.floor(pos + 1e-9), f = FRAC.find(([v]) => Math.abs(v - (pos - b)) < 1e-6); return `beat ${b + 1}${f ? f[1] : ''}`; };
const selStart = () => (S.sel ? positions(S.song.measures[S.sel.m])[S.sel.i]?.start ?? 0 : 0);
const barLabel = (m) => (barNumber(S.song, m) === 0 ? 'pickup' : `bar ${barNumber(S.song, m)}`);

// ---------------------------------------------------------------- timeline for the accompaniment
function timeline() {
  if (S.tl) return S.tl;
  const song = S.song, cm = cellMap(song), n = cm.total;
  // chord changes in time order; one that falls inside a beat goes in mid[cell] (off = fraction of the beat)
  const events = [];
  playedMeasures(song).forEach((meas, m) => slotList(meas).forEach((x) => {
    if (!x.chord) return;
    const beat = Math.floor(x.pos + 1e-9);
    events.push({ cell: cm.start[m] + beat, off: x.pos - beat, chord: x.chord });
  }));
  const segs = [], info = new Array(n), mid = {};
  let cur = -1, e = 0;
  for (let i = 0; i < n; i++) {
    if (e < events.length && events[e].cell === i && events[e].off < 1e-9) { segs.push({ chord: events[e].chord }); cur = segs.length - 1; e++; }
    const start = cur;
    while (e < events.length && events[e].cell === i) { segs.push({ chord: events[e].chord }); cur = segs.length - 1; (mid[i] = mid[i] || []).push({ off: events[e].off, seg: cur }); e++; }
    info[i] = { seg: start, endSeg: cur };
  }
  let prev = null;
  for (const s of segs) {
    if (s.chord.nc) { s.v = null; continue; }
    s.v = voiceChord(s.chord, S.settings.voicing, prev);
    if (s.v.upper.length) prev = s.v.upper;
    s.bassMidi = s.v.bass; s.rootBass = 36 + notePC(s.chord.root);
    s.toneSemis = chordIntervals(s.chord).map(ivlSemis);
  }
  // melody notes by the beat (cell) they start in
  const TPB = beatTicks(song.time.den);
  const byCell = {};
  for (const n2 of playableNotes(song)) {
    const cell = cm.start[n2.m] + Math.floor(n2.start / TPB);
    (byCell[cell] = byCell[cell] || []).push({ off: (n2.start % TPB) / TPB, beats: n2.ticks / TPB, midi: n2.midi, tup: !!(n2.ev && n2.ev.tup) });
  }
  S.tl = {
    beatsPerBar: song.time.num, cells: info, segs, mid, byCell, cm,
    beatInBar: (c) => c - cm.start[cm.ofCell[c]],
  };
  return S.tl;
}
const invalidate = () => { S.tl = null; };
function playSettings() {
  const s = S.settings;
  // swing: eighths played long-short (quarter-note beats only; triplets and other tuplets stay as written)
  const swing = s.swingOn && S.song.time.den === 4 ? s.swingAmt : 0;
  return { tempo: S.song.tempo || 120, swing, click: s.click, countIn: s.countIn,
    compPattern: s.playChords ? s.compPattern : 'none', bassPattern: s.playChords ? s.bassPattern : 'off',
    chordInst: s.chordInst, bassInst: s.bassInst };
}
// the melody part, scheduled beat by beat by the sequencer
seq.onCell = (cell, beatStart, beatDur, swingAt) => {
  if (!S.settings.playMelody || S.song.chartOnly) return [];
  const list = timeline().byCell[cell];
  if (!list) return [];
  const swingPos = (x) => { const k = Math.floor(x + 1e-9); return k + swingAt(x - k); };
  return list.map((n) => {
    const at = n.tup ? (x) => x : swingAt, pos = n.tup ? (x) => x : swingPos;      // tuplets are played as written
    const when = beatStart + at(n.off) * beatDur, end = beatStart + pos(n.off + n.beats) * beatDur;
    melHits.push({ midi: n.midi, t0: when, t1: when + Math.max(0.05, (end - when) * 0.96) });
    return engine.note(S.settings.melodyInst, n.midi, when, Math.max(0.08, (end - when) * 0.96), 0.85, 'melody');
  });
};
let melHits = [];          // melody notes scheduled while playing: { midi, t0, t1 } in audio time
let melNow = new Set();    // melody keys sounding now (kept while paused)

// ---------------------------------------------------------------- audio helpers
function applyAudioSettings() {
  const s = S.settings;
  engine.setVolume('melody', s.volMelody); engine.setVolume('chord', s.volChord); engine.setVolume('bass', s.volBass); engine.setVolume('click', s.volClick);
  engine.setReverb(s.reverb);
}
const neededInstruments = () => { const s = S.settings, ids = [s.melodyInst, s.chordInst]; if (s.bassPattern !== 'off') ids.push(s.bassInst); return ids; };
function preloadInstruments() {
  for (const id of neededInstruments()) if (!id.startsWith('syn-')) engine.load(id).then(() => engine.trim(neededInstruments(), 4)).catch(() => {});
}
async function instrumentsReady() {
  const missing = neededInstruments().filter((id) => !engine.isLoaded(id) && !engine.failed[id]);
  if (!missing.length) return;
  const slow = setTimeout(() => toast('Loading sounds…'), 250);
  try { await Promise.all(missing.map((id) => engine.load(id))); } catch (e) { toast("Couldn't load a sound; using a simple synth"); }
  clearTimeout(slow);
  engine.trim(neededInstruments(), 4);
}
function hearNote(midi, beats = 1) {
  if (!S.settings.audition) return;
  const go = () => {
    const ctx = engine.ensureContext(), t = ctx.currentTime + 0.005;
    S.auditionVoices.forEach((h) => h && h.release(t));
    const dur = Math.min(1.2, Math.max(0.25, beats * 60 / (S.song.tempo || 120)));
    S.auditionVoices = [engine.note(S.settings.melodyInst, midi, t, dur, 0.85, 'melody')];
  };
  if (!engine.isLoaded(S.settings.melodyInst) && !engine.failed[S.settings.melodyInst]) instrumentsReady().then(go); else go();
}
// the chord sounding at a position (bar m, pos in beats)
function segAt(m, pos) {
  const tl = timeline(), beat = Math.floor(pos + 1e-9), cell = tl.cm.start[m] + beat, info = tl.cells[cell];
  if (!info) return null;
  let k = info.seg;
  for (const c of tl.mid[cell] || []) if (c.off <= pos - beat + 1e-9) k = c.seg;
  return k >= 0 ? tl.segs[k] : null;
}
function hearChordAt(m, pos, force = false) {
  if (!force && !S.settings.audition) return;
  const seg = segAt(m, pos);
  if (!seg || !seg.v) return;
  // with the piano keys on screen a chord sounds exactly as its keys light (plus its bass note), however it's
  // played: selecting it, tapping its name, or the keys themselves. The voice-led voicing is for playback
  if (bigPianoShown() && seg.chord) { strikeChord(chordSoundKeys(seg, m), true, seg.chord); return; }
  const go = () => {
    const ctx = engine.ensureContext(), t = ctx.currentTime + 0.005, s = S.settings;
    cutChordSound(t);
    const v = seg.v.upper.map((x) => engine.note(s.chordInst, x, t, 1.6, 0.8, 'chord'));
    v.push(s.bassPattern !== 'off' ? engine.note(s.bassInst, seg.v.bass, t, 1.6, 0.85, 'bass') : engine.note(s.chordInst, seg.v.bass, t, 1.6, 0.7, 'chord'));
    S.auditionVoices = v;
  };
  if (neededInstruments().some((id) => !engine.isLoaded(id) && !engine.failed[id])) instrumentsReady().then(go); else go();
}

// ---------------------------------------------------------------- rendering
// the even chord grid (Chord Pad spacing) for chord charts, and in the Chords tab when "Even" is on
const gridView = () => !!S.song.chartOnly || (S.layer === 'chords' && !!S.settings.evenChords);
function render() {
  const el = $('#score');
  const w = $('#score-wrap').clientWidth;
  S.view = gridView() ? 'grid' : 'score';
  document.body.classList.toggle('grid-view', S.view === 'grid');
  try {
    if (S.view === 'grid') {
      el.innerHTML = '';
      S.layout = layoutGrid(S.song, w, S.settings.gridBars || 4, $('#score-wrap').clientHeight);
      el.style.height = S.layout.height + 'px';
    } else {
      el.style.height = '';
      // bars per line: Auto fits the music (fewer on small screens), or exactly the number chosen
      const sb = S.settings.scoreBars, exact = sb !== 'auto' && sb !== undefined;
      const per = exact ? +sb : w < 520 ? 2 : w < 900 ? 3 : 4;
      S.layout = renderScore(el, S.song, { width: w, barsPerLine: per, exact, barNumber: (m) => barNumber(S.song, m) || '' });
    }
  } catch (e) { console.error(e); toast('Could not draw the score: ' + e.message); }
  updateHeader();
  renderChordGrid(); renderOverlay(); renderInfo(); updatePanel(); renderTransport(); $('#title').textContent = S.song.title;
  updateBigPiano();
}
function box(cls, x, y, w, h, extra = '') { return `<div class="ov ${cls}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;${extra}"></div>`; }
function renderOverlay() {
  checkPause();
  const L = S.layout; if (!L) return;
  const ov = $('#overlay');
  ov.style.height = L.height + 'px';
  let h = '';
  // bar range
  const grid = S.layer === 'chords' && S.grid;
  if (S.bars) {
    if (!grid) for (let m = S.bars.a; m <= S.bars.b; m++) { const M = L.measures[m]; if (M) h += box('bars', M.x, M.top - 4, M.w, M.bottom - M.top + 8); }
    const E = L.measures[S.bars.b];
    if (E) h += `<button class="ov-clear" id="ov-clear" style="left:${E.x + E.w - 14}px;top:${E.top - 34}px" aria-label="Clear bar selection">✕</button>`;
  }
  if (S.layer === 'melody') {
    const M = L.measures[S.cursor.m];
    if (M) {
      const n = M.notes.find((q) => Math.abs(q.start - S.cursor.pos) < 1);
      const cx = n ? n.x - 4 : M.endX - 6;
      h += box('cursor', cx, M.top - 12, 3, M.bottom - M.top + 24);
    }
    if (S.sel) {
      const M2 = L.measures[S.sel.m];
      const n = M2 && M2.notes[S.sel.i];
      if (n) h += box('sel', n.x - 5, Math.min(n.y, M2.top) - 10, 22, Math.max(M2.bottom, n.y) - Math.min(n.y, M2.top) + 20);
    }
  } else if (S.layer === 'chords' && !grid) {
    const M = L.measures[S.cs.m], sc = L.scale || 1;
    // the chord symbol's baseline sits 34 (unscaled) px above the staff
    if (M) h += box('chordsel', M.beatX[S.cs.beat] - 5, M.top - 53 * sc, 64 * sc, 26 * sc);
  }
  if (playingAt && !grid) { const M = L.measures[playingAt.m]; if (M && M.beatX[playingAt.beat] !== undefined) h += box(paused ? 'play paused' : 'play', M.beatX[playingAt.beat] - 2, M.top - 10, 4, M.bottom - M.top + 20); }
  ov.innerHTML = h;
  updateChordGrid();
  updateBigPiano();
  const clr = $('#ov-clear');
  if (clr) clr.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); S.bars = null; renderOverlay(); renderTransport(); followBars(); });
}
// ---------------------------------------------------------------- split layout (iPhone Duo)
// Half-folded like a laptop, iPhone Duo reports two viewport segments stacked top/bottom (Viewport Segments
// API; in iOS 27.1 behind Safari's feature flags). Then the chart goes on the upright half and a big piano +
// the keys on the flat half, with nothing under the fold. Settings → Split can also force it on (e.g. inside
// apps that don't pass the fold through) or off.
function foldSegments() {
  try {
    const sg = window.viewport && window.viewport.segments;
    if (sg && sg.length === 2 && Math.abs(sg[0].left - sg[1].left) < 2 && sg[1].top > sg[0].top) return sg;   // stacked
  } catch (e) { /* no API */ }
  return null;
}
// where the hinge (the middle of the screen) falls in this page. The page reaches the bottom of the screen;
// above it there may be browser bars, or the Claude app's bar.
const CLAUDE_APP_BAR = 82;     // the Claude iOS app's bar above an artifact (measured on iPhone Duo)
function hingeEstimate(h) {
  try {
    // the screen's size is known (Safari, a Home Screen web app): its middle
    const land = matchMedia('(orientation: landscape)').matches, sw = screen.width, sh = screen.height;
    const tall = land ? Math.min(sw, sh) : Math.max(sw, sh);
    if (tall > h + 20) { const y = Math.round(h - tall / 2); if (y > h * 0.25 && y < h * 0.75) return y; }
  } catch (e) { /* no screen info */ }
  // inside the Claude app the page only sees its own size: allow for the app's bar above it
  try { if (window.self !== window.top) return Math.round((h - CLAUDE_APP_BAR) / 2); } catch (e) { return Math.round((h - CLAUDE_APP_BAR) / 2); }
  return null;
}
// move the split: a line across the screen to drag (Reset puts it back on the fold, or the screen's middle)
function alignFold() {
  if (!document.body.classList.contains('split')) { S.settings.split = 'on'; persistSoon(); applySplit(); render(); }
  const fl = $('#foldline');
  fl.hidden = false;
  let start = null;
  fl.onpointerdown = (e) => {
    if (e.target.closest('button')) return;
    e.preventDefault(); fl.setPointerCapture(e.pointerId);
    start = { y: e.clientY, adj: S.settings.foldAdjust || 0 };
  };
  fl.onpointermove = (e) => {
    if (!start) return;
    S.settings.foldAdjust = Math.round(start.adj + e.clientY - start.y);
    applySplit();
  };
  fl.onpointerup = (e) => {                     // where the finger lifts is what counts
    if (!start) return;
    S.settings.foldAdjust = Math.round(start.adj + e.clientY - start.y);
    start = null; applySplit(); persistSoon(); render();
  };
  fl.onpointercancel = () => { if (start) { start = null; persistSoon(); render(); } };
  fl.querySelector('[data-fl="done"]').onclick = () => { fl.hidden = true; persistSoon(); render(); };
  fl.querySelector('[data-fl="reset"]').onclick = () => { S.settings.foldAdjust = 0; applySplit(); persistSoon(); render(); };
}
// Without the fold APIs (Safari has them behind feature flags), recognise the iPhone Duo's inner screen
// (669 × 951 points; inside the Claude app the page sees 669 × ~870): held upright, it folds across the middle.
// A posture of "folded" also counts ("continuous" is what non-foldables report, so it can't rule the Duo out).
function foldableScreen() {
  try {
    if (navigator.devicePosture && navigator.devicePosture.type === 'folded') return true;
    const a = Math.min(screen.width, screen.height), b = Math.max(screen.width, screen.height);
    return a >= 640 && a <= 700 && b >= 820 && b <= 1000 && window.innerWidth < window.innerHeight;
  } catch (e) { return false; }
}
// the Home Screen app fills the screen from its top edge (under the status bar)
const standalone = () => { try { return navigator.standalone === true || matchMedia('(display-mode: standalone)').matches; } catch (e) { return false; } };
// measure a CSS height (env(), vh) with a throwaway element
function cssHeight(v) {
  const d = document.createElement('div');
  d.style.cssText = `position:fixed;top:0;left:0;width:1px;height:${v};visibility:hidden;pointer-events:none`;
  document.body.appendChild(d); const h = d.getBoundingClientRect().height; d.remove(); return h;
}
// how tall the status-bar band is (0 in Safari or inside another app)
const safeTop = () => cssHeight('env(safe-area-inset-top)');
// the whole screen's height. A Home Screen app on iOS (page under the status bar) reports its page a status bar
// short (innerHeight), and anything position: fixed stops there, leaving a strip at the bottom; 100vh is the
// whole screen, and ordinary (not fixed) content draws all the way down
const screenHeight = () => (standalone() ? Math.max(window.innerHeight, Math.round(cssHeight('100vh'))) : window.innerHeight);
function applySplit() {
  const mode = S.settings.split || 'auto', sg = foldSegments();
  let on = mode === 'on' || (mode === 'auto' && (!!sg || foldableScreen()));
  const root = document.documentElement.style;
  const adj = S.settings.foldAdjust || 0;
  // the app fills the whole screen (it isn't position: fixed, so it isn't cut off a status bar short)
  const h = screenHeight();
  root.setProperty('--app-h', h + 'px');
  document.documentElement.classList.toggle('split', on);
  if (on && standalone()) {
    // a Home Screen app: the line is placed on the screen (its middle plus your offset), so it stays put
    // whether the phone is folded or flat and whether or not iOS has shrunk the page; the fold reported
    // while folded only switches the split on
    const top = Math.max(150, Math.min(h - 150, Math.round(screenHeight() / 2) + adj));
    root.setProperty('--seg0', top + 'px'); root.setProperty('--hinge', '0px'); root.setProperty('--seg1', h - top + 'px');
  } else if (on && sg && mode !== 'off') {
    const a = Math.max(150 - sg[0].height, Math.min(sg[1].height - 150, adj));
    root.setProperty('--seg0', sg[0].height + a + 'px');
    root.setProperty('--hinge', Math.max(0, sg[1].top - sg[0].top - sg[0].height) + 'px');
    root.setProperty('--seg1', sg[1].height - a + 'px');
  } else if (on) {
    // no fold reported (e.g. inside an app that doesn't pass it through): the screen's halfway line; either way
    // moved by the user's own adjustment (Settings → Split line)
    const h = window.innerHeight;
    const top = Math.max(150, Math.min(h - 150, (hingeEstimate(h) ?? Math.round(h / 2)) + adj));
    root.setProperty('--seg0', top + 'px'); root.setProperty('--hinge', '0px'); root.setProperty('--seg1', h - top + 'px');
  }
  const was = document.body.classList.contains('split');
  document.body.classList.toggle('split', on);
  // a tall status-bar band (the Duo's): the song title, ☰, Even and ⚙ move up into it, left of the status circle
  document.body.classList.toggle('head-up', on && safeTop() >= 40);
  // a narrow screen (the folded phone's cover screen: ~380 pt across beside its status column): ☰, Even and ⚙
  // move beside the tabs and the control row tightens up
  const usableW = window.innerWidth - cssHeight('env(safe-area-inset-left)') - cssHeight('env(safe-area-inset-right)');
  document.body.classList.toggle('narrow', on && usableW < 440);
  $('#bigpiano').hidden = !on;
  if (on && (!was || S.bigOct !== bigOctaves())) buildBigPiano();
  return on !== was;
}

// ---- the big piano (split layout). Melody: enters notes. Chords: shows the selected chord, and you build
// a chord by pressing notes — the lowest note is the root; the name is written into the selected slot.
// as many octaves as fit with comfortable keys (white keys ~40–65 px): 2 on a narrow screen, 3 on a wide one
const bigOctaves = () => (window.innerWidth >= 860 ? 3 : 2);
// the big piano is one strip of keys from C1 to C7 that slides sideways; the window shows 2 (or 3) octaves'
// worth of white keys starting at S.bigBase (any white key: a swipe snaps to the nearest one)
const PIANO_LO = 24, PIANO_HI = 96;
const isBlack = (m) => [1, 3, 6, 8, 10].includes(mod(m, 12));
const pianoWhites = (() => { const w = []; for (let m = PIANO_LO; m <= PIANO_HI; m++) if (!isBlack(m)) w.push(m); return w; })();
const visWhites = () => 7 * (S.bigOct || bigOctaves()) + 1;
const maxBaseIdx = () => pianoWhites.length - visWhites();
function baseIdx() {
  let i = pianoWhites.indexOf(S.bigBase);
  if (i < 0) i = pianoWhites.findIndex((m) => m >= S.bigBase);
  return Math.max(0, Math.min(maxBaseIdx(), i < 0 ? 0 : i));
}
// the lowest and highest keys in the window
function bigRange() { const i = baseIdx(); return [pianoWhites[i], pianoWhites[i + visWhites() - 1]]; }
function setBigBase(m) { S.bigBase = pianoWhites[Math.max(0, Math.min(maxBaseIdx(), pianoWhites.indexOf(m) >= 0 ? pianoWhites.indexOf(m) : pianoWhites.findIndex((w) => w >= m)))]; }
// slide the strip to S.bigBase (smoothly when it moved)
let stripAt = null;
function positionStrip(animate = true) {
  const strip = $('#bigpiano .bp-strip'); if (!strip) return;
  const i = baseIdx(), moved = stripAt !== null && stripAt !== i;
  strip.style.transition = animate && moved ? 'transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none';
  strip.style.transform = `translateX(${(-i * 100) / visWhites()}%)`;
  stripAt = i;
}
function buildBigPiano() {
  const el = $('#bigpiano');
  S.bigOct = bigOctaves();
  setBigBase(S.bigBase);
  let keys = '';
  const ww = 100 / visWhites();
  pianoWhites.forEach((m, k) => {
    const isC = mod(m, 12) === 0, lbl = isC ? 'C' + (Math.floor(m / 12) - 1) : S.settings.keyNames === 'all' ? 'CDEFGAB'[[0, 2, 4, 5, 7, 9, 11].indexOf(mod(m, 12))] : '';
    keys += `<div class="pk w${isC ? ' c' : ''}" data-midi="${m}" style="left:${k * ww}%;width:${ww}%">${lbl}</div>`;
    if (m + 1 <= PIANO_HI && isBlack(m + 1)) keys += `<div class="pk b" data-midi="${m + 1}" style="left:${(k + 0.66) * ww}%;width:${ww * 0.68}%"></div>`;
  });
  stripAt = null;
  el.innerHTML = `<div class="bp-bar">
    <div class="bp-mode" role="group" aria-label="Piano mode"><button data-bp="edit">Edit</button><button data-bp="draft">Draft</button></div>
    <button data-bp="latch" class="bp-tog" data-tip="Latch: keys stay down until tapped again">L</button>
    <button data-bp="follow" class="bp-tog">F</button>
    <button data-bp="down" class="bp-oct" aria-label="Octave down">‹</button><div class="bp-name" data-bp="name" role="button" aria-label="Play these keys again"></div><button data-bp="up" class="bp-oct" aria-label="Octave up">›</button>
    <button data-bp="write" class="bp-write" aria-label="Write the chord into the selected slot">Write</button>
    <button data-bp="clear" class="bp-tog" data-tip="Clear: lift all the keys">C</button></div>
    <div class="bp-keys"><div class="bp-strip">${keys}</div></div>`;
  positionStrip(false);
  updateBigPiano();
}
// Chords + Edit: keys latch (tap on, tap again off). Selecting a slot loads its chord onto the keys (an empty
// slot: no keys), unless you've built something you haven't written yet — then it stays, ready to Write there.
function chordEdit() {
  const ck = S.ck, slot = `${S.cs.m}:${S.cs.beat}:${S.cs.k || 0}`, own = csChord(), text = own ? chordText(own) : '';
  // selecting another chord starts again from it (changes not yet written are dropped, with a note); in
  // Draft, selecting an empty slot keeps the keys as they are, ready to Write there
  if (slot !== ck.slot && ck.slot) {
    if (own) ck.dirty = false;                       // the selected chord loads (quietly: no toast)
    else if (draftMode()) { ck.slot = slot; ck.text = text; return ck; }
  }
  if (!ck.dirty && (slot !== ck.slot || text !== ck.text)) ck.notes = own ? chordKeys(own, S.bigBase) : [];
  ck.slot = slot; ck.text = text;
  return ck;
}
// Draft + Latch can start from the selection: the selected chord's keys (Chords tab, on by default) or the
// selected note (Melody tab, off by default); Follow in the piano bar switches it per tab. Not following,
// the keys are a free sketchpad. Keys you change stay as they are until Write or Clear.
// Latch (keys stay down until tapped again) is set per tab: on for chords, off for melody
const latchOn = () => (S.layer === 'melody' ? !!S.settings.draftLatchMelody : S.settings.draftLatchChords !== false);
const followSel = () => (S.layer === 'chords' ? S.settings.draftFollowChords !== false : S.layer === 'melody' ? !!S.settings.draftFollowMelody : false);
function noteEdit() {
  const nk = S.nk, e = selEv(), key = S.sel ? `${S.sel.m}:${S.sel.i}:${e && !e.r ? midiOf(e.p) : 'r'}` : '';
  // selecting another note starts again from it
  const at = S.sel ? `${S.sel.m}:${S.sel.i}` : '';
  if (at !== nk.at && nk.dirty && nk.at) nk.dirty = false;
  nk.at = at;
  if (!nk.dirty && key !== nk.key) {
    nk.notes = e && !e.r ? [midiOf(e.p)] : [];
    // keep the note on the keyboard: move the piano by octaves if it's off either end
    const n = nk.notes[0], [lo, hi] = bigRange();
    if (n !== undefined && (n < lo || n > hi)) {
      setBigBase(12 * Math.floor(n / 12) - 12);
      queueMicrotask(buildBigPiano);
    }
  }
  nk.key = key;
  return nk;
}
const latchSet = () => (!followSel() ? S.sketch : S.layer === 'chords' ? chordEdit() : noteEdit());
function bigPianoNotes() {
  if (S.layer === 'chords') return chordEdit().notes;
  const e = selEv();
  return e && !e.r ? [midiOf(e.p)] : [];
}
const draftMode = () => S.settings.pianoMode !== 'edit';
const heldNotes = () => [...new Set([...S.held.values()].map((x) => x.midi))].sort((a, b) => a - b);
function updateBigPiano() {
  const el = $('#bigpiano');
  if (el.hidden || !el.firstChild) return;
  const draft = draftMode();
  el.querySelector('[data-bp="edit"]').classList.toggle('on', !draft);
  el.querySelector('[data-bp="draft"]').classList.toggle('on', draft);
  el.classList.toggle('draft', draft);
  // while playing (or paused) the keys show what's playing; the selection shows again when it stops. Keys you
  // play yourself show too, and once you play keys while paused they take over until ▶ carries on
  const mine = !!playingAt && !!S.keysTouched, takeover = mine && !!paused;
  const playback = !!playingAt && !takeover;
  const on = new Set(playback && !mine ? [] : draft ? (latchOn() ? latchSet().notes : heldNotes()) : bigPianoNotes());
  // Draft without latch, with Follow on: the selected chord (or note) is marked on the keys, which stay free to play
  const hint = new Set(draft && !latchOn() && followSel() && !playback ? followKeys() : []);
  const playSeg = playback ? segAt(playingAt.m, playingAt.beat) : null;
  const play = new Set(playSeg && playSeg.chord ? chordKeys(playSeg.chord, S.bigBase) : []);
  const mel = takeover ? new Set() : melNow;
  el.classList.toggle('playing', playback);
  el.querySelectorAll('.pk').forEach((k) => {
    const m = +k.dataset.midi;
    k.classList.toggle('on', on.has(m)); k.classList.toggle('play', play.has(m)); k.classList.toggle('mel', mel.has(m));
    k.classList.toggle('fmark', hint.has(m));   // not 'hint': that's the grey hint-text style
  });
  // something sounding beyond the keys: light the octave arrow on that side (orange melody, green chord)
  if (!pianoDrag) positionStrip();
  const [lo, hi] = bigRange();
  for (const [sel, off] of [['[data-bp="down"]', (m) => m < lo], ['[data-bp="up"]', (m) => m > hi]]) {
    const b = el.querySelector(sel);
    const m = [...mel].some(off), pl = !m && [...play].some(off);
    b.classList.toggle('off-mel', m); b.classList.toggle('off-play', pl);
    b.classList.toggle('off-on', !m && !pl && ([...on].some(off) || (!on.size && [...hint].some(off))));
  }
  const name = el.querySelector('.bp-name');
  const latchBtn = el.querySelector('[data-bp="latch"]');
  latchBtn.hidden = !draft; latchBtn.classList.toggle('on', latchOn());
  latchBtn.title = latchBtn.ariaLabel = latchBtn.dataset.tip;
  const followBtn = el.querySelector('[data-bp="follow"]');
  followBtn.hidden = !(draft && (S.layer === 'chords' || S.layer === 'melody'));
  followBtn.classList.toggle('on', followSel());
  const what = S.layer === 'chords' ? 'chord' : 'note';
  followBtn.title = followBtn.ariaLabel = followBtn.dataset.tip = latchOn() ? `Follow: the keys start from the selected ${what}` : `Follow: mark the selected ${what} on the keys`;
  const clearBtn = el.querySelector('[data-bp="clear"]'); clearBtn.title = clearBtn.ariaLabel = clearBtn.dataset.tip;
  if (draft) {
    // draft: just playing — keys latch (tap on/off) or sound while held, and the chord is named. Nothing
    // goes into the song unless you tap Write (Chords tab): then it goes into the selected slot
    const latch = latchOn(), held = latch ? latchSet().notes : heldNotes();
    const down = held.length || !hint.size ? held : [...hint];   // nothing held: name the marked chord
    const built = S.draftSet && S.draftSet.key === down.join() ? S.draftSet.chord : null;
    const c = built || ((latch || !held.length) && ownName(down)) || (down.length > 1 ? nameChord(down, S.song.key.fifths) : null), own = csChord();
    S.draftChord = c;
    const txt = c ? chordText(c) : '';
    if (txt !== S.draftText) { S.draftText = txt; if (S.layer === 'chords') queueMicrotask(updatePanel); }
    name.className = 'bp-name' + (c ? '' : ' none');
    name.textContent = c ? chordText(c) : '';                 // just the name: no hint lines
    const write = el.querySelector('[data-bp="write"]'), same = c && own && chordText(c) === chordText(own);
    write.hidden = S.layer !== 'chords';
    write.disabled = !c || same;
    write.classList.toggle('ready', !!c && !same);
    el.querySelector('[data-bp="clear"]').hidden = !latch;
    markRoot(el, on.size ? on : hint, playback || S.layer !== 'chords' ? null : c);
    if (playback) showPlaying(el, playSeg);
    return;
  }
  const chords = S.layer === 'chords', write = el.querySelector('[data-bp="write"]');
  for (const b of el.querySelectorAll('[data-bp="clear"], [data-bp="write"]')) b.hidden = !chords;
  if (chords) {
    const ck = chordEdit(), own = csChord();
    const c = (own && !own.nc && !own.rep && !ck.dirty && ck.text === chordText(own) ? own : null) || (ck.notes.length > 1 ? nameChord(ck.notes, S.song.key.fifths) : null);
    const same = c && own && chordText(c) === chordText(own);
    name.className = 'bp-name' + (c ? '' : ' none');
    name.textContent = c ? chordText(c) : '';
    // Edit writes as you go, so its Write button isn't needed
    write.hidden = true; write.disabled = !c || same;
    write.classList.toggle('ready', !!c && !same);
    markRoot(el, on, playback ? null : c);
  } else { name.className = 'bp-name none'; name.textContent = ''; markRoot(el, on, null); }
  if (playback) showPlaying(el, playSeg);
}
// the keys Follow marks when latch is off: the selected chord as it loads onto the keys (or the selected note)
function followKeys() {
  if (S.layer === 'melody') return noteEdit().notes;
  if (S.layer !== 'chords') return [];
  const ck = chordEdit(), own = csChord();
  if (!own || own.nc || own.rep) return [];
  return ck.dirty ? chordKeys(own, S.bigBase) : ck.notes;
}
// keys straight from the selected chord (not changed since) are named as that chord, not re-read from scratch:
// the same notes can have several names (G-7(♯5) and E♭(add9)/G), and the chart's own one should show
function ownName(keys) {
  if (S.layer !== 'chords' || !followSel()) return null;
  const ck = S.ck, own = csChord();
  return own && !own.nc && !own.rep && !ck.dirty && ck.text === chordText(own) && ck.notes.join() === keys.join() ? own : null;
}
// the chord's root on the keys (its lowest key) is a darker blue with a dot
function markRoot(el, on, c) {
  const pc = c && !c.nc && c.root ? notePC(c.root) : null;
  const key = pc == null ? null : [...on].sort((a, b) => a - b).find((m) => mod(m - pc, 12) === 0);
  el.querySelectorAll('.pk').forEach((k) => k.classList.toggle('root', +k.dataset.midi === key));
}
// playing or paused: the bar names the chord playing (tap it to hear it), and Write / Clear wait until it stops
function showPlaying(el, seg) {
  const name = el.querySelector('.bp-name'), c = seg && seg.chord;
  name.className = 'bp-name playing' + (c ? '' : ' none');
  name.textContent = c ? chordText(c) : paused ? 'Paused' : 'Playing';
  for (const b of el.querySelectorAll('[data-bp="write"], [data-bp="clear"]')) { b.disabled = true; b.classList.remove('ready'); }
}
const bigPianoShown = () => { const bp = $('#bigpiano'); return !!bp && !bp.hidden && !!bp.firstChild && document.body.classList.contains('split'); };
// the keys a chord lights: the loaded keys when they are this selected chord, untouched; else the chord at the keyboard
function chordSoundKeys(seg, m) {
  if (S.layer === 'chords' && S.cs && S.cs.m === m && (!draftMode() || followSel())) {
    const ck = chordEdit(), own = csChord();
    if (own && !own.nc && !own.rep && chordText(own) === chordText(seg.chord) && !ck.dirty && ck.text === chordText(own) && ck.notes.length) return ck.notes;
  }
  return chordKeys(seg.chord, S.bigBase);
}
// the piano bar's one-letter buttons: hold one to see what it does
let tipHold = null, tipTimer = 0;
function showTip(b) {
  const bp = $('#bigpiano'); let tip = bp.querySelector('.bp-tip');
  if (!tip) { tip = document.createElement('div'); tip.className = 'bp-tip'; bp.appendChild(tip); }
  clearTimeout(tipTimer); tip.textContent = b.dataset.tip; tip.hidden = false;
  const box = bp.getBoundingClientRect(), r = b.getBoundingClientRect(), w = tip.offsetWidth;
  tip.style.left = `${Math.max(4, Math.min(box.width - w - 4, r.left - box.left + r.width / 2 - w / 2))}px`;
}
function hideTipSoon() { clearTimeout(tipTimer); tipTimer = setTimeout(() => { const t = $('#bigpiano .bp-tip'); if (t) t.hidden = true; }, 1500); }
// a new chord sound cuts the last one, whichever way it was played
function cutChordSound(t) {
  for (const h of S.strikes) if (h) h.release(t);
  for (const h of S.auditionVoices) if (h) h.release(t);
  S.strikes = []; S.auditionVoices = [];
}
// play the latched keys together, cutting the previous strike
function strikeChord(notes, asChord = false, chord = null) {
  const mel = S.layer === 'melody' && !asChord, s = S.settings;
  const go = () => {
    const ctx = engine.ensureContext(), t = ctx.currentTime + 0.005;
    cutChordSound(t);
    S.strikes = notes.map((m) => engine.note(mel ? s.melodyInst : s.chordInst, m, t, 2.5, mel ? 0.72 : 0.8, mel ? 'melody' : 'chord'));
    // a chord sounds the way it does when you select one: with its bass note (the slash bass, else the root, from
    // the name the keys get; unnamed keys use their lowest note) down in the bass, on the bass instrument,
    // and always below the keys so it is heard as the bass
    if (!mel && notes.length > 1) {
      const c = chord || nameChord(notes, S.song.key.fifths);
      const pc = c && !c.nc && c.root ? notePC(c.bass || c.root) : mod(Math.min(...notes), 12);
      let low = 36 + pc;
      while (low >= Math.min(...notes) && low >= 36) low -= 12;
      S.strikes.push(s.bassPattern !== 'off' ? engine.note(s.bassInst, low, t, 2.5, 0.85, 'bass') : engine.note(s.chordInst, low, t, 2.5, 0.7, 'chord'));
    }
  };
  // wait for the samples (as selecting does) rather than drop a note that is still loading
  const ids = mel ? [s.melodyInst] : [s.chordInst, ...(s.bassPattern !== 'off' ? [s.bassInst] : [])];
  if (notes.length && ids.some((id) => !engine.isLoaded(id) && !engine.failed[id])) instrumentsReady().then(go); else go();
}
// the keys are the selected chord, untouched: then they sound exactly as selecting it does
function keysAreOwn(keys) {
  if (S.layer !== 'chords' || !keys.length) return false;
  const ck = S.ck, own = csChord();
  return !!(own && !own.nc && !own.rep && !ck.dirty && ck.text === chordText(own) && ck.notes.join() === keys.join());
}
function hearKey(midi) {
  const ctx = engine.ensureContext(), t = ctx.currentTime + 0.005;
  engine.note(S.layer === 'chords' ? S.settings.chordInst : S.settings.melodyInst, midi, t, 0.9, 0.8, S.layer === 'chords' ? 'chord' : 'melody');
}
function bigPianoKey(midi) {
  if (playingAt) S.keysTouched = true;
  if (draftMode()) {                                  // Draft + Latch: nothing is written until Write
    const ls = latchSet(), set = new Set(ls.notes);
    if (set.has(midi)) set.delete(midi); else set.add(midi);
    ls.notes = [...set].sort((a, b) => a - b); ls.dirty = true;
    strikeChord(ls.notes); updateBigPiano();
    return;
  }
  if (S.layer === 'melody') { enterPitch(midi); return; }
  if (S.layer !== 'chords') { hearKey(midi); return; }
  // Edit: toggle the key and write the chord straight into the selected slot (no Write needed). Keys that
  // make no chord name wait (shown as such) until they do; taking every key off empties the slot.
  const ck = chordEdit(), set = new Set(ck.notes);
  if (set.has(midi)) set.delete(midi); else set.add(midi);
  ck.notes = [...set].sort((a, b) => a - b);
  strikeChord(ck.notes);
  const c = ck.notes.length > 1 ? nameChord(ck.notes, S.song.key.fifths) : null, own = csChord();
  if (c || !ck.notes.length) {
    // note what's being written first, so redrawing after the edit keeps these keys (not the symbol's own
    // voicing, which would bring back a note the name leaves out, like the 5th)
    ck.dirty = false; ck.text = c ? chordText(c) : '';
    if (!(c && own && chordText(c) === chordText(own)) && (c || own)) edit(() => { setSlot(csMeas(), S.cs.beat, S.cs.k || 0, c || null); });
  } else ck.dirty = true;
  updateBigPiano();
}
// draft mode: keys sound while held (several at once), and a finger sliding across the keys glides
function draftDown(e, k) {
  const midi = +k.dataset.midi, ctx = engine.ensureContext(), t = ctx.currentTime + 0.003;
  const inst = S.layer === 'melody' ? S.settings.melodyInst : S.settings.chordInst, bus = S.layer === 'melody' ? 'melody' : 'chord';
  const h = engine.note(inst, midi, t, 8, 0.8, bus);
  S.held.set(e.pointerId, { midi, h, k });
  k.classList.add('down');
  updateBigPiano();
}
function draftUp(id) {
  const x = S.held.get(id); if (!x) return;
  if (x.h && engine.ctx) x.h.release(engine.ctx.currentTime + 0.01);
  x.k.classList.remove('down');
  S.held.delete(id);
  updateBigPiano();
}
function bigPianoBar(what) {
  if (what === 'edit' || what === 'draft') {
    S.settings.pianoMode = what; persistSoon();
    for (const id of [...S.held.keys()]) draftUp(id);
    toast(what === 'edit' ? (S.layer === 'melody' ? 'Edit: keys enter notes' : 'Edit: keys change the selected chord') : 'Draft: keys just play, nothing is written');
    updateBigPiano(); updatePanel(); return;
  }
  if (what === 'write' && draftMode()) {               // draft: put the drafted chord in the selected slot
    if (!S.draftChord || S.layer !== 'chords') return;
    const c = cloneChord(S.draftChord);
    if (latchOn()) { const ck = chordEdit(); ck.dirty = false; ck.text = chordText(c); }   // first, so the keys stay as they are
    edit(() => { setSlot(csMeas(), S.cs.beat, S.cs.k || 0, c); });
    toast(`${chordText(c)} → ${barLabel(S.cs.m)}, ${posLabel(csPos())}`);
    updateBigPiano(); return;
  }
  if (what === 'name') {                              // the chord name: play the keys again (named or not)
    const nm = $('#bigpiano .bp-name'); nm.classList.add('hit'); setTimeout(() => nm.classList.remove('hit'), 160);
    if (!(playingAt && !(paused && S.keysTouched))) {
      const keys = draftMode() ? latchSet().notes : S.layer === 'chords' ? chordEdit().notes : [];
      if (keysAreOwn(keys)) { hearChordAt(S.cs.m, csPos(), true); return; }   // same sound as tapping the chord in the chart
    }
    if (draftMode() && !latchOn()) { const h = heldNotes(); if (h.length) strikeChord(h); return; }
    what = 'strike';
  }
  if (what === 'strike' && playingAt && !(paused && S.keysTouched)) {   // playing or paused: hear the chord at the playhead
    hearChordAt(playingAt.m, playingAt.beat, true);                       // exactly as it plays in the song
    return;
  }
  if (playingAt && !(paused && S.keysTouched) && (what === 'write' || what === 'clear')) return;
  if (what === 'up' || what === 'down') { setBigBase(S.bigBase + (what === 'up' ? 12 : -12)); updateBigPiano(); return; }
  if (what === 'follow') {
    const k = S.layer === 'chords' ? 'draftFollowChords' : 'draftFollowMelody', on = !followSel();
    S.settings[k] = on; persistSoon();
    if (on) { const ls = latchSet(); ls.dirty = false; ls.key = ''; ls.slot = ''; }   // pick up the selection now
    const what2 = S.layer === 'chords' ? 'chord' : 'note';
    toast(!latchOn() ? (on ? `Follow: the selected ${what2} is marked on the keys` : 'Follow off') : on ? `Draft starts from the selected ${what2}` : 'Draft keys are a free sketch');
    updateBigPiano(); return;
  }
  if (what === 'latch') {
    const lk = S.layer === 'melody' ? 'draftLatchMelody' : 'draftLatchChords';
    S.settings[lk] = !latchOn(); persistSoon();
    for (const id of [...S.held.keys()]) draftUp(id);
    toast(latchOn() ? 'Latch: keys stay down until tapped again' : 'Keys play while held');
    updateBigPiano(); updatePanel(); return;
  }
  if (draftMode()) {
    const ls = latchSet();
    if (what === 'strike') strikeChord(ls.notes);
    // following the selection, Clear also lets the next selection load again
    if (what === 'clear') { ls.notes = []; ls.dirty = !followSel(); strikeChord([]); }
    updateBigPiano(); return;
  }
  if (S.layer !== 'chords') { if (what === 'strike' && S.layer === 'melody') { const n = noteEdit().notes; if (n.length) strikeChord(n); } return; }
  const ck = chordEdit();
  if (what === 'strike') strikeChord(ck.notes);
  if (what === 'clear') { ck.notes = []; ck.dirty = false; strikeChord([]); }
  if (what === 'write') {
    const c = ck.notes.length > 1 ? nameChord(ck.notes, S.song.key.fifths) : null;
    if (!c) return;
    edit(() => { setSlot(csMeas(), S.cs.beat, S.cs.k || 0, c); });
    ck.dirty = false; ck.text = chordText(c);
  }
  updateBigPiano();
}

// ---------------------------------------------------------------- chords mode grid
// In the Chords layer the score fades and the chords are drawn as Chord Pad cells over it: one cell
// per chord slot (a beat, or part of a divided beat), each starting just before the note at that point,
// so a chord sits over the notes it plays under.
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
function gridCells(L) {
  const sc = L.scale || 1, out = [];
  L.measures.forEach((M, m) => {
    if (!M) return;
    const sl = M.slots, last = sl.length - 1, y = M.top - 17 * sc, h = M.bottom - M.top + 34 * sc;
    sl.forEach((q, j) => {
      const x0 = j === 0 ? Math.max(M.x, M.startX - 10 * sc) : q.x - 6 * sc;
      const x1 = j === last ? M.x + M.w : sl[j + 1].x - 6 * sc;
      out.push({ m, b: q.b, k: q.k, pos: q.pos, n: q.n, line: M.line, last: j === last, x: x0, y, w: Math.max(6, x1 - x0), h });
    });
  });
  return out;
}
// header and tabs: the "Even" switch (Chords tab of a lead sheet); no Melody tab in a chord chart
function updateHeader() {
  const ev = $('#btn-even'), chart = !!S.song.chartOnly;
  ev.hidden = chart || S.layer !== 'chords';
  ev.classList.toggle('on', !!S.settings.evenChords);
  const mt = $('#tabs [data-layer="melody"]');
  if (mt) mt.hidden = chart;
}
const SIM_SVG = {
  one: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="7.5" r="2.4"/><circle cx="18" cy="16.5" r="2.4"/><path d="M4 21h3.6L20 3h-3.6z"/></svg>',
  two: '<svg viewBox="0 0 36 30" aria-hidden="true"><text x="18" y="8" text-anchor="middle" font-size="9" font-weight="700">2</text><circle cx="5.5" cy="15" r="2.4"/><circle cx="30.5" cy="26" r="2.4"/><path d="M4 30h3.4l10.4-18h-3.4zM15.4 30h3.4l10.4-18h-3.4z"/></svg>',
};
const SIM_NAMES = { bar: 'Repeat the bar before', two: 'Repeat the two bars before' };
const BEAT_SVG = '<svg viewBox="0 0 12 24" aria-hidden="true"><path d="M1.5 22.5h3.4L10.5 1.5H7.1z"/></svg>';
function renderChordGrid() {
  const g = $('#chordgrid'), L = S.layout, on = (S.layer === 'chords' || S.view === 'grid') && !!L;
  $('#score-wrap').classList.toggle('chords-mode', on);
  if (!on) { if (S.grid) { g.innerHTML = ''; S.grid = null; } return; }
  const song = S.song, cells = gridCells(L), bpb = song.time.num;
  g.style.height = L.height + 'px';
  let h = '';
  // repeat signs: by the cell they start in, with the width they cover (to the end of their bars on that line)
  const signs = new Map();
  for (const [k, mk] of Object.entries(song.marks || {})) {
    if (!mk.sim || !simFits(song, +k, mk.sim)) continue;
    const cov = simCover(song, +k, mk.sim);
    const startIdx = cells.findIndex((c) => c.m === +k && c.pos >= cov[0].from - 1e-9);
    if (startIdx < 0) continue;
    const c0 = cells[startIdx];
    let endIdx = startIdx;
    for (let j = startIdx; j < cells.length && cells[j].line === c0.line && cov.some((v) => v.m === cells[j].m); j++) endIdx = j;
    signs.set(startIdx, { kind: mk.sim, w: cells[endIdx].x + cells[endIdx].w - c0.x });
  }
  cells.forEach((c, k) => {
    const mk = song.marks[c.m] || {}, prev = cells[k - 1], next = cells[k + 1];
    const lineStart = !prev || prev.line !== c.line, lineEnd = !next || next.line !== c.line;
    const cls = ['cell'];
    let inner = '';
    if (c.k > 0) cls.push('sub');                       // a later slot of a divided beat
    if (c.k === 0 && c.n === 3) {                       // triplet bracket over the group
      const g = cells[k + 2];
      inner += `<span class="tup3" style="width:${g.x + g.w - c.x - 8}px"></span>`;
    }
    if (c.b === 0 && c.k === 0) {
      if (mk.start) { cls.push('rep-start'); inner += '<span class="rs"></span>'; } else cls.push('bar');
      if (mk.ending) {
        const pm = song.marks[c.m - 1] || {};
        const label = pm.ending !== mk.ending || lineStart;
        const M = L.measures[c.m];
        inner += `<span class="volta" style="width:${M.x + M.w - c.x - 4}px${label ? '' : ';border-left:0'}">${label ? mk.ending + '.' : ''}</span>`;
      } else if (lineStart && barNumber(song, c.m)) {
        // in the even grid with a pickup, the left margin holds the bar numbers
        inner += L.gutter >= 16 ? `<span class="barno gut" style="left:${-L.gutter + 2}px;width:${L.gutter - 8}px">${barNumber(song, c.m)}</span>`
          : `<span class="barno">${barNumber(song, c.m)}</span>`;
      }
    }
    if (c.last && mk.end) { cls.push('rep-end'); inner += `<span class="re"></span>${mk.end > 2 ? `<span class="rtimes">×${mk.end}</span>` : ''}`; }
    else if (lineEnd) cls.push('line-end');
    const chord = getSlot(song.measures[c.m], c.b, c.k);
    if (chord && chord.rep) inner += `<span class="beat">${BEAT_SVG}</span>`;
    else if (chord) {
      // the symbol may run on over the empty cells after it (up to two bars, same line)
      let j = k + 1;
      while (j < cells.length && cells[j].pos + (cells[j].m - c.m) * bpb - c.pos < 2 * bpb && cells[j].line === c.line && !getSlot(song.measures[cells[j].m], cells[j].b, cells[j].k) && !signs.has(j)) j++;
      const right = cells[j - 1].x + cells[j - 1].w;
      inner += `<span class="ch${chord.nc ? ' nc' : ''}" style="width:${Math.max(10, right - c.x - (mk.start && c.b === 0 ? 14 : 8))}px">${chordHTML(chord)}</span>`;
    }
    const sg = signs.get(k);
    if (sg) inner += `<span class="sim sim-${sg.kind}" style="width:${sg.w - 4}px" title="${SIM_NAMES[sg.kind]}">${sg.kind === 'two' ? SIM_SVG.two : SIM_SVG.one}</span>`;
    h += `<div class="${cls.join(' ')}" data-m="${c.m}" data-b="${c.b}" data-k="${c.k}" style="left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${c.h}px">${inner}</div>`;
  });
  g.innerHTML = h;
  S.grid = { cells, els: [...g.querySelectorAll('.cell')], key: '' };
  fitGridText(g);
}
// same rule as Chord Pad: shrink a symbol to fit the space before the next chord; below 11 px,
// hide the bracketed extensions behind "…" (the full symbol is in the info strip)
// chord symbols as big as the cells allow (bigger rows on a short chart); one that won't fit on a line puts its
// extensions and bass on a second line; only if that still won't fit do the extensions hide (never the bass)
function fitGridText(g) {
  const L = S.layout, base = L && L.grid ? Math.max(17, Math.min(28, (L.cellH || 50) * 0.4)) : 19;
  fitChords([...g.querySelectorAll('.ch')], base, 9);
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
function updateChordGrid() {
  const G = S.grid; if (!G) return;
  const key = `${S.layer}|${S.cs.m}:${S.cs.beat}:${S.cs.k || 0}|${S.bars ? S.bars.a + '-' + S.bars.b : ''}|${playingAt ? playingAt.m + ':' + playingAt.beat : ''}`;
  if (key === G.key) return;
  G.key = key;
  G.els.forEach((el, j) => {
    const { m, b, k, pos } = G.cells[j];
    el.classList.toggle('sel', S.layer === 'chords' && m === S.cs.m && b === S.cs.beat && k === (S.cs.k || 0));
    el.classList.toggle('lp', !!S.bars && m >= S.bars.a && m <= S.bars.b);
    el.classList.toggle('playing', !!playingAt && playingAt.m === m && Math.floor(pos + 1e-9) === playingAt.beat);
    el.classList.toggle('selbar', S.layer === 'chords' && m === S.cs.m);            // the whole bar, faintly
    el.classList.toggle('playbar', !!playingAt && playingAt.m === m);
  });
}
// which slot of bar m is at x (chords mode)
function gridSlot(m, x) {
  const cs = S.grid ? S.grid.cells.filter((c) => c.m === m) : [];
  if (!cs.length) return null;
  let best = cs[0];
  for (const c of cs) if (x >= c.x) best = c;
  return { b: best.b, k: best.k, pos: best.pos };
}

function scrollIntoViewY(y, h = 60) {
  const wrap = $('#score-wrap');
  if (y < wrap.scrollTop + 10) wrap.scrollTop = Math.max(0, y - 30);
  else if (y + h > wrap.scrollTop + wrap.clientHeight - 10) wrap.scrollTop = y + h - wrap.clientHeight + 30;
}

const DUR_NAMES = { 1: 'whole', 2: 'half', 4: 'quarter', 8: 'eighth', 16: 'sixteenth', 32: '32nd', 64: '64th' };
const durName = (e) => `${e.d === 2 ? 'double-dotted ' : e.d === 1 ? 'dotted ' : ''}${DUR_NAMES[e.b]}${e.tup ? ` (${e.tup.n}:${e.tup.m})` : ''}`;
function chordAt(m, pos) { const seg = segAt(m, pos); return seg ? seg.chord : null; }
function renderInfo() {
  let main = '—', sub = '';
  if (playingAt) {                                  // playing or paused: the chord at the playhead, in every tab
    const seg = segAt(playingAt.m, playingAt.beat), c = seg && seg.chord;
    $('#info-main').textContent = c ? chordText(c) : 'No chord';
    $('#info-sub').textContent = `${paused ? 'Paused' : 'Playing'} · ${barLabel(playingAt.m)}, beat ${playingAt.beat + 1}` + (c && !c.nc ? ` · ${chordNotes(c).map(noteName).join(' ')}` : '');
    return;
  }
  if (S.layer === 'melody') {
    const e = selEv();
    if (e) {
      main = e.r ? `Rest · ${durName(e)}` : `${pitchName(e.p)} · ${durName(e)}${e.tie ? ' · tied' : ''}`;
      const at = selStart() / beatTicks(S.song.time.den), beat = Math.floor(at);
      const c = chordAt(S.sel.m, at);
      sub = `${barLabel(S.sel.m)}, beat ${beat + 1}${c && !c.nc ? ` · over ${chordText(c)}` : ''}`;
    } else { main = 'Tap a note or a piano key'; }
    sub += `${sub ? ' · ' : ''}next: ${S.dur.d === 2 ? 'double-dotted ' : S.dur.d ? 'dotted ' : ''}${DUR_NAMES[S.dur.b]}${S.tup ? `, ${S.tup}-tuplet` : ''}`;
  } else if (S.layer === 'chords' && playingAt) {
    const seg = segAt(playingAt.m, playingAt.beat), c = seg && seg.chord;   // (any tab while playing: see below)
    main = c ? chordText(c) : 'No chord';
    sub = `${paused ? 'Paused' : 'Playing'} · ${barLabel(playingAt.m)}, beat ${playingAt.beat + 1}`;
    if (c && !c.nc) sub += ` · ${chordNotes(c).map(noteName).join(' ')}`;
  } else if (S.layer === 'chords') {
    const own = csChord();
    const c = own || chordAt(S.cs.m, csPos());
    main = c ? chordText(c) + (own ? '' : '  (held)') : 'No chord';
    sub = `${barLabel(S.cs.m)}, ${posLabel(csPos())}`;
    if (c && !c.nc) sub += ` · ${chordNotes(c).map(noteName).join(' ')} · ${chordIntervals(c).map(ivlName).join(' ')}`;
  } else {
    const r = S.bars || { a: S.cursor.m, b: S.cursor.m };
    main = r.a === r.b ? barLabel(r.a)[0].toUpperCase() + barLabel(r.a).slice(1) : `Bars ${barNumber(S.song, r.a)}–${barNumber(S.song, r.b)}`;
    sub = `${S.song.measures.length} bars · key ${KEY_NAMES[S.song.key.fifths].replace('b', '♭').replace('#', '♯')} · ${S.song.time.num}/${S.song.time.den}`;
  }
  $('#info-main').textContent = main; $('#info-sub').textContent = sub;
}

// ---------------------------------------------------------------- panels
const NOTE_SVG = (b) => {
  const open = b <= 2, stem = b >= 2, flags = { 8: 1, 16: 2, 32: 3, 64: 4 }[b] || 0;
  let s = `<svg viewBox="0 0 26 30" aria-hidden="true"><ellipse class="${open ? 'open' : ''}" cx="9" cy="23" rx="5.5" ry="4" transform="rotate(-20 9 23)"/>`;
  if (stem) s += '<line x1="14" y1="22" x2="14" y2="3" stroke-width="1.6"/>';
  for (let k = 0; k < flags; k++) s += `<path d="M14 ${3 + k * 4.5} q 7 3 6 10 q -1 -5 -6 -6.5 z"/>`;
  return s + '</svg>';
};
// small rhythm pictures for the beat-division keys (1, 2, 3 = triplet, 4, 't' = quarter-note triplet)
const RHYTHM_SVG = (d) => {
  const xs = { 1: [20], 2: [13, 27], 3: [9, 20, 31], 4: [6, 15, 24, 33], t: [9, 20, 31] }[d];
  const beams = { 2: 1, 3: 1, 4: 2 }[d] || 0, top = d === 3 || d === 't' ? 9 : 5;
  let s = `<svg viewBox="0 0 42 28" aria-hidden="true" class="rh">`;
  for (const x of xs) s += `<ellipse cx="${x}" cy="23" rx="3.7" ry="2.7" transform="rotate(-20 ${x} 23)"/><line x1="${x + 3.2}" y1="22" x2="${x + 3.2}" y2="${top}" stroke-width="1.4"/>`;
  for (let k = 0; k < beams; k++) s += `<path d="M${xs[0] + 2.5} ${top + k * 3.6}H${xs[xs.length - 1] + 3.9}v2.4H${xs[0] + 2.5}z"/>`;
  if (d === 3) s += `<text x="${(xs[0] + xs[2]) / 2 + 3.2}" y="6.5" text-anchor="middle">3</text>`;
  if (d === 't') s += `<path class="br" d="M${xs[0] + 1} 7V4.5H${xs[0] + 9}M${xs[2] - 2.6} 4.5H${xs[2] + 5.4}V7"/><text x="${xs[1] + 3.2}" y="7" text-anchor="middle">3</text>`;
  return s + '</svg>';
};
const DIV_KEYS = [[1, 'One chord slot per beat'], [2, 'Split the beat in two'], [3, 'Triplet: three slots in the beat'],
  [4, 'Split the beat in four'], ['t', 'Quarter-note triplet: three slots over two beats']];
const PANELS = {
  melody: [
    [[1, 'dur', 'whole'], [2, 'dur', 'half'], [4, 'dur', 'quarter'], [8, 'dur', 'eighth'], [16, 'dur', 'sixteenth'], [32, 'dur', '32nd'], [64, 'dur', '64th'],
      ['dot', 'dot', 'Dot'], ['tup', 'tup', 'Tuplet'], ['rest', 'rest', 'Rest']],
    'piano',
    [['◀', 'prev', 'Previous note'], ['▶', 'next', 'Next note'], ['↑', 'up', 'Semitone up'], ['↓', 'down', 'Semitone down'], ['♭', 'acc', 'Flat', -1],
      ['♮', 'acc', 'Natural', 0], ['♯', 'acc', 'Sharp', 1], ['Tie', 'tie', 'Tie'], ['8va', 'oct', 'Octave up', 1], ['8vb', 'oct', 'Octave down', -1]],
    [['−oct', 'pianoShift', 'Piano down an octave', -12], ['+oct', 'pianoShift', 'Piano up an octave', 12], ['⇄', 'respell', 'Respell'], ['⌫', 'del', 'Delete (make a rest)'],
      ['↶', 'undo', 'Undo'], ['↷', 'redo', 'Redo'], ['⌨', 'type', 'Type notes'], ['♪', 'hearSel', 'Hear']],
  ],
  chords: [
    // (no beat-split row: chords off the beat are typed as groups, e.g. [C7 F7] for the two halves of a beat)
    [...LETTERS.map((l) => [l, 'root', l, l]), ['♭', 'cacc', 'Flat', -1], ['♯', 'cacc', 'Sharp', 1], ['/', 'slash', 'Bass note']],
    [['–', 'q', 'Minor', 'min'], ['Δ', 'q', 'Major 7', 'maj'], ['+', 'q', 'Augmented', 'aug'], ['ø', 'q', 'Half-diminished', 'hdim'], ['o', 'q', 'Diminished', 'dim'],
      ['6', 'q', '6', 'six'], ['7', 'q', '7', 'dom7'], ['9', 'q', '9', 'dom9'], ['11', 'q', '11', 'dom11'], ['13', 'q', '13', 'dom13']],
    [['♭9', 'x', '♭9', '♭9'], ['♯9', 'x', '♯9', '♯9'], ['♯11', 'x', '♯11', '♯11'], ['♭13', 'x', '♭13', '♭13'], ['♭5', 'x', '♭5', '♭5'],
      ['♯5', 'x', '♯5', '♯5'], ['sus4', 'sus', 'sus4', '4'], ['sus2', 'sus', 'sus2', '2'], ['6/9', 'q', '6/9', 'sixnine'], ['alt', 'q', 'alt', 'alt']],
    [['add9', 'add', 'add9', '9'], ['add11', 'add', 'add11', '11'], ['omit3', 'omit', 'omit3', '3'], ['⇄', 'cenh', 'Respell root'], ['N.C.', 'nc', 'No chord'], ['/', 'beat', 'Repeat the chord on this beat (a beat slash)'],
      ['⌨', 'type', 'Type chords'], ['⌫', 'cdel', 'Clear'], ['◀', 'cprev', 'Previous beat'], ['▶', 'cnext', 'Next beat'], ['↶', 'undo', 'Undo'], ['↷', 'redo', 'Redo']],
  ],
  bars: [
    [['|:', 'rstart', 'Repeat start'], [':|', 'rend', 'Repeat end'], ['×2', 'rtimes', 'Times to play'], ['1.', 'ending', '1st ending', 1], ['2.', 'ending', '2nd ending', 2],
      ['3.', 'ending', '3rd ending', 3], ['%', 'sim', 'Repeat the bar before', 'bar'],
      ['2 %', 'sim', 'Repeat the two bars before', 'two'], ['+bar', 'insbar', 'Add a bar after'], ['−bar', 'delbar', 'Delete bars']],
    [['Dup', 'dupbar', 'Duplicate bars'], ['All', 'whole', 'Whole song'], ['Pickup', 'pickup', 'Pickup bar on/off'], ['Key ♭', 'key', 'One flat more', -1], ['Key ♯', 'key', 'One sharp more', 1],
      ['−½', 'transpose', 'Transpose down', -1], ['+½', 'transpose', 'Transpose up', 1], ['Copy', 'bcopy', 'Copy bars'], ['Paste', 'bpaste', 'Paste bars'],
      ['↶', 'undo', 'Undo'], ['↷', 'redo', 'Redo']],
  ],
};

function buildPanel() {
  const p = $('#panel');
  p.innerHTML = '';
  PANELS[S.layer].forEach((row) => {
    if (row === 'piano') { p.appendChild(buildPiano()); return; }
    if (row === 'div') {
      const r = document.createElement('div');
      r.className = 'krow divrow';
      for (const [d, title] of DIV_KEYS) {
        const b = document.createElement('button');
        b.className = 'key div'; b.dataset.action = 'div'; b.dataset.arg = d; b.innerHTML = RHYTHM_SVG(d);
        b.title = title; b.setAttribute('aria-label', title);
        r.appendChild(b);
      }
      p.appendChild(r); return;
    }
    const r = document.createElement('div');
    r.className = 'krow' + ([8, 11, 12].includes(row.length) ? ` k${row.length}` : '') + (row.some((k) => k[1] === 'pianoShift') ? ' oct-row' : '');
    row.forEach(([label, action, title, arg]) => {
      const b = document.createElement('button');
      b.className = 'key' + (['root', 'cacc', 'slash'].includes(action) ? ' root' : '') + (String(label).length > 5 ? ' tiny' : String(label).length > 3 ? ' small' : '');
      if (action === 'dur') { b.innerHTML = NOTE_SVG(label); b.dataset.arg = label; } else b.textContent = label;
      if (action === 'sim') { b.innerHTML = arg === 'two' ? SIM_SVG.two : SIM_SVG.one; b.classList.remove('small', 'tiny'); }
      if (action === 'beat') b.innerHTML = BEAT_SVG;
      b.dataset.action = action; if (arg !== undefined) b.dataset.arg = arg;
      b.title = title || label; b.setAttribute('aria-label', title || label);
      r.appendChild(b);
    });
    p.appendChild(r);
  });
  document.querySelectorAll('#tabs button').forEach((t) => t.classList.toggle('on', t.dataset.layer === S.layer));
  updatePanel();
}
function buildPiano() {
  const wrap = document.createElement('div');
  wrap.id = 'piano-strip';
  const whites = [];
  for (let m = S.pianoBase; m <= S.pianoBase + 24; m++) if (![1, 3, 6, 8, 10].includes(mod(m, 12))) whites.push(m);
  const ww = 100 / whites.length;
  whites.forEach((m, k) => {
    const d = document.createElement('div');
    d.className = 'pk w'; d.dataset.midi = m;
    d.style.left = k * ww + '%'; d.style.width = ww + '%';
    if (mod(m, 12) === 0) d.textContent = 'C' + (Math.floor(m / 12) - 1);
    wrap.appendChild(d);
    const bm = m + 1;
    if (bm <= S.pianoBase + 24 && [1, 3, 6, 8, 10].includes(mod(bm, 12))) {
      const b = document.createElement('div');
      b.className = 'pk b'; b.dataset.midi = bm;
      b.style.left = (k + 0.68) * ww + '%'; b.style.width = ww * 0.64 + '%';
      wrap.appendChild(b);
    }
  });
  wrap.addEventListener('pointerdown', (e) => {
    const k = e.target.closest('.pk'); if (!k) return;
    e.preventDefault(); engine.unlock();
    k.classList.add('down'); setTimeout(() => k.classList.remove('down'), 140);
    enterPitch(+k.dataset.midi);
  });
  return wrap;
}
function updatePanel() {
  const e = selEv();
  document.querySelectorAll('#panel .key').forEach((b) => {
    const a = b.dataset.action, arg = b.dataset.arg;
    let on = false, dim = false;
    if (a === 'dur') on = +arg === S.dur.b;
    else if (a === 'dot') { on = S.dur.d > 0; b.textContent = S.dur.d === 2 ? '••' : '•'; }
    else if (a === 'tup') { on = !!S.tup; if (S.tup) b.textContent = `${S.tup}:${{ 3: 2, 5: 4, 6: 4, 7: 4 }[S.tup]}`; else b.innerHTML = RHYTHM_SVG(3); }
    else if (a === 'div') { const cm = csMeas(); on = String(beatGrid(cm, S.cs.beat).d) === arg; dim = arg === 't' && S.cs.beat >= cm.ch.length - 1; }
    else if (['up', 'down', 'oct', 'acc', 'respell', 'del', 'tie', 'hearSel'].includes(a)) { dim = !e || (a !== 'del' && e.r); if (a === 'acc' && e && !e.r) on = e.p.a === +arg; if (a === 'tie') on = !!(e && e.tie); }
    else if (a === 'undo') dim = !S.undo.length;
    else if (a === 'redo') dim = !S.redo.length;
    else if (S.layer === 'chords') {
      const c = draftChords() ? S.draftChord : csChord(), chord = c && !c.nc ? c : null;
      if (a === 'root') on = !!chord && !S.bassMode && LETTERS[chord.root.letter] === arg;
      else if (a === 'cacc') { const n = chord && (S.target === 'bass' && chord.bass ? chord.bass : chord.root); on = !!n && n.acc === +arg; dim = !chord; }
      else if (a === 'slash') { on = S.bassMode || !!(chord && chord.bass); dim = !chord; }
      else if (a === 'q') { on = !!chord && chord.quals.includes(arg); dim = !chord; b.classList.toggle('implied', on && arg === 'dom7' && !!chord.auto7); }
      else if (a === 'x') { on = !!chord && hasExt(chord, { kind: 'acc', i: parseInterval(arg) }); dim = !chord; }
      else if (['sus', 'add', 'omit'].includes(a)) { on = !!chord && hasExt(chord, { kind: a, i: parseInterval(arg) }); dim = !chord; }
      else if (a === 'nc') on = !!(c && c.nc);
    } else if (S.layer === 'bars') {
      const r = barRange(), mk = (x) => S.song.marks[x] || {};
      if (a === 'rstart') on = !!mk(r.a).start;
      else if (a === 'rend') on = !!mk(r.b).end;
      else if (a === 'rtimes') { const t = mk(r.b).end; on = t > 2; b.textContent = '×' + (t > 2 ? t : 2); }
      else if (a === 'ending') { on = true; for (let x = r.a; x <= r.b; x++) if (mk(x).ending !== +arg) on = false; }
      else if (a === 'pickup') on = !!S.song.pickup;
      else if (a === 'bpaste') dim = !S.clip;
      else if (a === 'whole') on = !S.bars;
    }
    b.classList.toggle('on', on); b.classList.toggle('dim', dim);
  });
  document.querySelectorAll('#piano-strip .pk').forEach((k) => k.classList.toggle('cur', !!(e && !e.r && midiOf(e.p) === +k.dataset.midi)));
  updateStripMelody();
}
function updateStripMelody() { document.querySelectorAll('#piano-strip .pk').forEach((k) => k.classList.toggle('mel', melNow.has(+k.dataset.midi))); }

function bindPanel() {
  const p = $('#panel');
  p.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.key'); if (!b) return;
    e.preventDefault(); engine.unlock();
    b.classList.add('pressed'); setTimeout(() => b.classList.remove('pressed'), 120);
    b._downAt = performance.now();
    if (b.dataset.action !== 'type') keyAction(b.dataset.action, b.dataset.arg);
  });
  p.addEventListener('click', (e) => {
    const b = e.target.closest('.key'); if (!b) return;
    if (b.dataset.action === 'type') toggleTypebar();
    else if (!(performance.now() - (b._downAt || 0) < 800)) keyAction(b.dataset.action, b.dataset.arg);
  });
  document.querySelectorAll('#tabs button').forEach((t) => t.addEventListener('click', () => setLayer(t.dataset.layer)));
}
function setLayer(layer) {
  if (layer === 'melody' && S.song.chartOnly) layer = 'chords';
  S.layer = layer; S.bassMode = false; document.body.dataset.layer = layer;
  if (S.view !== (gridView() ? 'grid' : 'score')) { buildPanel(); render(); return; }
  buildPanel(); updateHeader(); renderChordGrid(); renderOverlay(); renderInfo();
}

// ---------------------------------------------------------------- melody actions
function enterPitch(midi) {
  const p = spellMidi(midi, S.song.key.fifths);
  enterEvent(p);
  hearNote(midi, beatsOf(S.dur));
}
const beatsOf = (d) => (4 / d.b) * (d.d === 1 ? 1.5 : d.d === 2 ? 1.75 : 1) * (S.song.time.den / 4);
function enterEvent(pitch) {
  edit(() => {
    // a tapped note takes the new pitch/duration in place (MuseScore: retype over the selection)
    const at = S.picked && S.sel ? { m: S.sel.m, pos: selStart() } : S.cursor;
    const r = enter(S.song, at, pitch, S.dur, S.tup);
    if (r.error) { toast(r.error); return false; }
    S.cursor = r.cursor; S.sel = r.sel; S.picked = false;
  });
  const M = S.layout && S.layout.measures[S.cursor.m]; if (M) scrollIntoViewY(M.sysTop, M.sysH);
}
function movePitch(fn) {
  const e = selEv(); if (!e || e.r) return;
  edit(() => { fn(e); }, { hear: () => hearNote(midiOf(e.p), 0.5) });
}
function selectEvent(m, i, picked = true) {
  const meas = S.song.measures[m]; if (!meas || !meas.ev[i]) return;
  S.sel = { m, i }; S.picked = picked;
  S.cursor = { m, pos: positions(meas)[i].start };
  renderOverlay(); renderInfo(); updatePanel();
}
function stepEvent(dir) {
  let { m, i } = S.sel || { m: S.cursor.m, i: Math.max(0, eventAt(S.song, S.cursor.m, S.cursor.pos)) };
  i += dir;
  while (m >= 0 && m < S.song.measures.length && (i < 0 || i >= S.song.measures[m].ev.length)) {
    if (i < 0) { m--; if (m >= 0) i = S.song.measures[m].ev.length - 1; } else { m++; i = 0; }
  }
  if (m < 0 || m >= S.song.measures.length) return;
  selectEvent(m, i);
  const e = selEv(); if (e && !e.r) hearNote(midiOf(e.p), 0.5);
}

function keyAction(action, arg) {
  const song = S.song;
  switch (action) {
    // ----- melody
    case 'dur': {
      S.dur = { b: +arg, d: S.dur.d && +arg < 64 ? S.dur.d : 0 };
      if (S.picked && selEv()) { const e = selEv(); enterEvent(e.r ? null : e.p); }   // change the tapped note's length
      else { updatePanel(); renderInfo(); }
      return;
    }
    case 'dot': S.dur.d = (S.dur.d + 1) % 3; if (S.dur.b === 64) S.dur.d = 0; if (S.picked && selEv()) { const e = selEv(); enterEvent(e.r ? null : e.p); } else { updatePanel(); renderInfo(); } return;
    case 'tup': { const seqT = [0, 3, 5, 6, 7]; S.tup = seqT[(seqT.indexOf(S.tup) + 1) % seqT.length]; updatePanel(); renderInfo(); if (S.tup) toast(`${S.tup}-tuplets: the next notes fill a ${S.tup}-tuplet`); return; }
    case 'rest': enterEvent(null); return;
    case 'prev': stepEvent(-1); return;
    case 'next': stepEvent(1); return;
    case 'up': case 'down': {
      const dir = action === 'up' ? 1 : -1;
      movePitch((e) => {
        const midi = midiOf(e.p) + dir;
        const inKey = spellMidi(midi, song.key.fifths);
        const diatonic = inKey && inKey.a === keyAccidental(song.key.fifths, inKey.l);
        e.p = diatonic ? inKey : (spellMidi(midi, dir > 0 ? 1 : -1) || inKey);   // chromatic: ♯ going up, ♭ going down
      });
      return;
    }
    case 'oct': movePitch((e) => { e.p.o += +arg; }); return;
    case 'acc': movePitch((e) => { e.p.a = +arg; }); return;
    case 'respell': movePitch((e) => { const a = respell(e.p, 1), b = respell(e.p, -1); e.p = Math.abs(a.a) <= Math.abs(b.a) && a !== e.p ? a : b; }); return;
    case 'tie': {
      const e = selEv(); if (!e || e.r) return;
      const ps = positions(song.measures[S.sel.m]);
      let nx = song.measures[S.sel.m].ev[S.sel.i + 1] || (song.measures[S.sel.m + 1] || { ev: [] }).ev[0];
      if (nx && !nx.r && midiOf(nx.p) === midiOf(e.p)) { edit(() => { e.tie = !e.tie; }); return; }
      // otherwise add a tied note of the same pitch after it (current duration)
      edit(() => {
        e.tie = true;
        const r = enter(song, { m: S.sel.m, pos: ps[S.sel.i].end }, { ...e.p }, S.dur, S.tup);
        if (r.error) { e.tie = false; toast(r.error); return false; }
        S.cursor = r.cursor; S.sel = r.sel; S.picked = false;
      });
      return;
    }
    case 'pianoShift': S.pianoBase = Math.max(24, Math.min(84, S.pianoBase + +arg)); buildPanel(); toast(`Piano from C${Math.floor(S.pianoBase / 12) - 1}`); return;
    case 'del': { if (!S.sel) return; edit(() => { toRest(song, S.sel); if (!song.measures[S.sel.m].ev[S.sel.i]) S.sel = { m: S.sel.m, i: 0 }; }); return; }
    case 'hearSel': { const e = selEv(); if (e && !e.r) hearNote(midiOf(e.p), 1); return; }
    case 'undo': case 'redo': undoRedo(action); return;
    // ----- chords
    case 'root': case 'cacc': case 'slash': case 'q': case 'x': case 'sus': case 'add': case 'omit': case 'cenh': case 'nc': case 'cdel':
      chordKey(action, arg); return;
    case 'cprev': case 'cnext': moveChordCell(action === 'cnext' ? 1 : -1); return;
    case 'beat': {
      const c = getSlot(csMeas(), S.cs.beat, S.cs.k || 0);
      if (c && c.rep) { edit(() => { setSlot(csMeas(), S.cs.beat, S.cs.k || 0, null); }); toast('Beat slash removed'); return; }
      const pm = playedMeasures(S.song), pos = csPos();
      let before = null;
      for (let k = S.cs.m; k >= 0 && !before; k--) { const sl = slotList(pm[k]).filter((y) => y.chord && (k < S.cs.m || y.pos < pos - 1e-9)); if (sl.length) before = sl[sl.length - 1].chord; }
      if (!before || before.nc) { toast('No chord before this beat to repeat'); return; }
      edit(() => { setSlot(csMeas(), S.cs.beat, S.cs.k || 0, slashMark()); }, { hear: () => hearChordAt(S.cs.m, csPos()) });
      moveChordCell(1);
      return;
    }
    case 'div': divideBeat(arg); return;
    // ----- bars
    default: barKey(action, arg);
  }
}

// ---------------------------------------------------------------- chord actions (Chord Pad rules)
function setSlotChord(c) { edit(() => { setSlot(csMeas(), S.cs.beat, S.cs.k || 0, c); }, { hear: () => hearChordAt(S.cs.m, csPos()) }); }
const setCell = setSlotChord;
function divideBeat(arg) {
  const meas = csMeas(), b = S.cs.beat, d = arg === 't' ? 't' : +arg;
  if (d === 't' && b >= meas.ch.length - 1) { toast('A quarter-note triplet needs this beat and the next'); return; }
  if (beatGrid(meas, b).d === d) return;
  let dropped = 0;
  // after a split, select the new slot after the beat (the usual place for the next chord)
  edit(() => { dropped = setDivision(meas, b, d); S.cs.k = d === 1 ? 0 : 1; });
  if (dropped > 0) toast(`${dropped} chord${dropped > 1 ? 's' : ''} had no slot left`);
}
// Draft (latched keys, Chords tab, piano showing): the chord keys show the drafted chord and change it,
// rebuilding the keys; Write puts it in the slot. Otherwise they edit the selected slot.
const draftChords = () => S.layer === 'chords' && draftMode() && latchOn() && !$('#bigpiano').hidden;
function setDraft(d) {
  if (playingAt) S.keysTouched = true;
  const ls = latchSet(), notes = d ? chordKeys(d, S.bigBase) : [];
  ls.notes = notes; ls.dirty = true;
  S.draftSet = d ? { key: notes.join(), chord: cloneChord(d) } : null;   // keep the spelling as built
  strikeChord(notes); updateBigPiano(); updatePanel();
}
function chordKey(action, arg) {
  const drafting = draftChords() && !['nc', 'cdel'].includes(action);
  const c = drafting ? S.draftChord : csChord();
  const setCell = drafting ? setDraft : setSlotChord;
  const need = () => { if (!c) { toast('Tap a root note first'); return null; } if (c.nc) { toast('N.C. — tap a root to make it a chord'); return null; } return c; };
  switch (action) {
    case 'root': {
      const letter = LETTERS.indexOf(arg);
      if (S.bassMode && c && !c.nc) { const d = cloneChord(c); d.bass = note(letter, 0); S.bassMode = false; S.target = 'bass'; setCell(d); return; }
      S.target = 'root';
      if (c && !c.nc) { const d = cloneChord(c); d.root = note(letter, 0); setCell(d); } else setCell(parseChord(arg));
      return;
    }
    case 'cacc': { if (!need()) return; const d = cloneChord(c), k = S.target === 'bass' && d.bass ? 'bass' : 'root', n = d[k]; d[k] = note(n.letter, n.acc === +arg ? 0 : +arg); setCell(d); return; }
    case 'slash': { if (!need()) return; if (c.bass) { const d = cloneChord(c); d.bass = null; S.target = 'root'; setCell(d); return; } S.bassMode = !S.bassMode; updatePanel(); if (S.bassMode) toast('Tap the bass note'); return; }
    case 'q': if (need()) setCell(toggleQual(c, arg)); return;
    case 'x': if (need()) setCell(toggleExt(c, { kind: 'acc', i: parseInterval(arg) })); return;
    case 'sus': case 'add': case 'omit': if (need()) setCell(toggleExt(c, { kind: action, i: parseInterval(arg) })); return;
    case 'cenh': { if (!need()) return; const d = cloneChord(c); const useB = S.target === 'bass' && d.bass; const n = useB ? d.bass : d.root; if (n.acc === 0) { toast('Only sharps and flats can be respelled'); return; } if (useB) d.bass = enharmonic(n); else d.root = enharmonic(n); setCell(d); return; }
    case 'nc': edit(() => { setSlot(csMeas(), S.cs.beat, S.cs.k || 0, c && c.nc ? null : NC()); }); return;
    case 'cdel': edit(() => { setSlot(csMeas(), S.cs.beat, S.cs.k || 0, null); }); return;
  }
}
function moveChordCell(dir) {
  let m = S.cs.m, list = slotList(S.song.measures[m]);
  let j = list.findIndex((x) => x.b === S.cs.beat && x.k === (S.cs.k || 0)) + dir;
  if (j < 0) { if (m === 0) return; m--; list = slotList(S.song.measures[m]); j = list.length - 1; }
  else if (j >= list.length) { if (m >= S.song.measures.length - 1) return; m++; list = slotList(S.song.measures[m]); j = 0; }
  selectSlot(m, list[j].b, list[j].k);
  renderOverlay(); renderInfo(); updatePanel(); hearChordAt(m, list[j].pos);
}

// ---------------------------------------------------------------- bar actions
const barRange = () => S.bars || (S.layer === 'chords' ? { a: S.cs.m, b: S.cs.m } : { a: S.cursor.m, b: S.cursor.m });
const mark = (m) => (S.song.marks[m] = S.song.marks[m] || {});
const tidyMarks = () => { for (const [k, v] of Object.entries(S.song.marks)) if (!v.start && !v.end && !v.ending) delete S.song.marks[k]; };
const copyMeasure = (meas) => copyChords(meas, { len: meas.len, ev: meas.ev.map(cloneEv), ch: new Array(meas.ch.length).fill(null) }, cloneChord);
function barKey(action, arg) {
  const song = S.song, r = barRange();
  const bt = beatTicks(song.time.den), full = song.time.num * bt;
  switch (action) {
    case 'rstart': edit(() => { const k = mark(r.a); k.start = !k.start; tidyMarks(); }); return;
    case 'rend': edit(() => { const k = mark(r.b); k.end = k.end ? 0 : 2; tidyMarks(); }); return;
    case 'rtimes': edit(() => { const k = mark(r.b); k.end = !k.end ? 3 : k.end >= 4 ? 2 : k.end + 1; tidyMarks(); toast(`Play ${k.end} times`); }); return;
    case 'ending': edit(() => {
      let all = true; for (let x = r.a; x <= r.b; x++) if ((song.marks[x] || {}).ending !== +arg) all = false;
      for (let x = r.a; x <= r.b; x++) mark(x).ending = all ? 0 : +arg;
      tidyMarks();
    }); return;
    case 'insbar': edit(() => {
      song.measures.splice(r.b + 1, 0, emptyMeasure(full, song.time.num));
      song.marks = shiftMarks(song.marks, r.b + 1, 1);
      S.cursor = { m: r.b + 1, pos: 0 }; S.sel = null; S.cs = { m: r.b + 1, beat: 0, k: 0 }; if (S.bars) S.bars = { a: r.b + 1, b: r.b + 1 };
    }); return;
    case 'delbar': {
      if (song.measures.length - (r.b - r.a + 1) < 1) { toast("A song needs at least one bar"); return; }
      edit(() => {
        song.measures.splice(r.a, r.b - r.a + 1);
        song.marks = shiftMarks(song.marks, r.a, -(r.b - r.a + 1));
        if (song.pickup && r.a === 0) song.pickup = 0;
        S.bars = null; S.sel = null; clampSelection();
      });
      return;
    }
    case 'dupbar': edit(() => {
      const copies = song.measures.slice(r.a, r.b + 1).map(copyMeasure).map((x) => (x.len === full ? x : copyChords(x, emptyMeasure(full, song.time.num))));
      song.measures.splice(r.b + 1, 0, ...copies);
      song.marks = shiftMarks(song.marks, r.b + 1, copies.length);
      S.bars = { a: r.b + 1, b: r.b + copies.length };
    }); return;
    case 'sim': {                                   // a repeat sign on the selected bars (the first, for two bars), or off
      const kind = arg, targets = kind === 'two' ? [r.a] : Array.from({ length: r.b - r.a + 1 }, (_, k) => r.a + k);
      const off = targets.every((m) => (song.marks[m] || {}).sim === kind);
      if (!off && targets.some((m) => !simFits(song, m, kind))) {
        toast(kind === 'two' ? 'A two-bar repeat needs two bars before it and a bar after' : 'No bar of the same length before this one');
        return;
      }
      edit(() => targets.forEach((m) => {
        const mk = (song.marks[m] = song.marks[m] || {});
        if (off) { delete mk.sim; return; }
        mk.sim = kind; clearUnderSim(song, m, kind);
        if (kind === 'two' && song.marks[m + 1]) delete song.marks[m + 1].sim;
        if ((song.marks[m - 1] || {}).sim === 'two') delete song.marks[m - 1].sim;   // this bar was the second of a two-bar sign
      }));
      toast(off ? 'Repeat sign removed' : SIM_NAMES[kind]);
      return;
    }
    case 'whole': S.bars = null; renderOverlay(); renderInfo(); updatePanel(); followBars(); return;
    case 'pickup': edit(() => {
      if (song.pickup) dropPickup(song);
      else { song.pickup = 1; song.measures.unshift(emptyMeasure(bt, 1)); song.marks = shiftMarks(song.marks, 0, 1); }
      S.bars = null; S.sel = null; clampSelection();
      toast(song.pickup ? 'Pickup bar added (1 beat — change in Settings)' : 'Pickup bar removed');
    }); return;
    case 'key': edit(() => { song.key.fifths = Math.max(-7, Math.min(7, song.key.fifths + +arg)); toast(`Key signature: ${KEY_NAMES[song.key.fifths].replace('b', '♭').replace('#', '♯')} major`); }); return;
    case 'transpose': edit(() => transposeSong(+arg)); return;
    case 'bcopy': S.clip = song.measures.slice(r.a, r.b + 1).map(copyMeasure); toast(`Copied ${S.clip.length} bar${S.clip.length > 1 ? 's' : ''}`); updatePanel(); return;
    case 'bpaste': {
      if (!S.clip) return;
      edit(() => {
        S.clip.forEach((x, k) => {
          const m = r.a + k;
          while (song.measures.length <= m) song.measures.push(emptyMeasure(full, song.time.num));
          if (song.measures[m].len === x.len) song.measures[m] = copyMeasure(x);
        });
      });
      return;
    }
    case 'undo': case 'redo': undoRedo(action); return;
  }
}
// transpose melody and chords; the key signature moves to the nearest simple key
function transposeSong(semis) {
  const song = S.song;
  let f = song.key.fifths + 7 * semis;
  f = mod(f + 6, 12) - 6;                       // -6..5
  song.key.fifths = f;
  for (const meas of song.measures) {
    for (const e of meas.ev) if (!e.r) e.p = spellMidi(midiOf(e.p) + semis, f);
    mapChords(meas, (c) => (c.nc ? c : transposeChord(c, semis)));
  }
  toast(`Transposed ${semis > 0 ? 'up' : 'down'} a semitone · key ${KEY_NAMES[f].replace('b', '♭').replace('#', '♯')}`);
}

// ---------------------------------------------------------------- score gestures
function bindScore() {
  const wrap = $('#score-wrap');
  let press = null;
  const pt = (e) => { const r = $('#score').getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  wrap.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#ov-clear')) return;
    if (!S.layout) return;
    engine.unlock();
    const p = pt(e);
    const hit = hitTest(S.layout, p.x, p.y);
    if (hit && S.layer === 'chords' && S.grid) { const sl = gridSlot(hit.m, p.x); if (sl) { hit.slot = sl; hit.beat = sl.b; } }
    press = { x: e.clientX, y: e.clientY, hit, dragging: false };
    if (!hit) return;
    press.timer = setTimeout(() => { if (press) press.dragging = 'armed'; }, 250);
  });
  wrap.addEventListener('pointermove', (e) => {
    if (!press || !press.hit) return;
    const dx = e.clientX - press.x, dy = e.clientY - press.y;
    if (!press.dragging) {
      if (Math.abs(dx) > 10 && Math.abs(dx) >= Math.abs(dy)) press.dragging = true;
      else if (Math.abs(dy) > 10) { clearTimeout(press.timer); press = null; return; }
      else return;
    }
    if (press.dragging === 'armed' && Math.hypot(dx, dy) < 6) return;
    press.dragging = true;
    const p = pt(e), hit = hitTest(S.layout, p.x, p.y);
    if (hit) { const a = Math.min(press.hit.m, hit.m), b = Math.max(press.hit.m, hit.m); S.bars = { a, b }; renderOverlay(); renderInfo(); updatePanel(); renderTransport(); }
  });
  wrap.addEventListener('touchmove', (e) => { if (press && press.dragging) e.preventDefault(); }, { passive: false });
  const end = () => {
    if (!press) return;
    clearTimeout(press.timer);
    const { hit, dragging } = press; press = null;
    if (dragging === true) { followBars(); return; }
    if (!hit) return;
    tapScore(hit);
  };
  wrap.addEventListener('pointerup', end);
  wrap.addEventListener('pointercancel', () => { if (press) clearTimeout(press.timer); press = null; });
}
function tapSlot(hit) {
  const sl = hit.slot || { b: hit.beat, k: 0, pos: hit.beat };
  selectSlot(hit.m, sl.b, sl.k);
  renderOverlay(); renderInfo(); updatePanel(); hearChordAt(hit.m, sl.pos);
}
function tapScore(hit) {
  if (hit.above && S.layer !== 'bars') {                    // tapped the chord row: edit that chord
    if (S.layer !== 'chords') setLayer('chords');
    tapSlot(hit);
    return;
  }
  if (S.layer === 'melody') {
    if (hit.i >= 0) { selectEvent(hit.m, hit.i); const e = selEv(); if (e && !e.r) hearNote(midiOf(e.p), 0.6); }
  } else if (S.layer === 'chords') {
    tapSlot(hit);
  } else {
    S.bars = { a: hit.m, b: hit.m }; S.cursor = { m: hit.m, pos: 0 };
    renderOverlay(); renderInfo(); updatePanel(); renderTransport(); followBars();
  }
}

// ---------------------------------------------------------------- playback
function songHasSound() { return hasChords(S.song) || playableNotes(S.song).length > 0; }
function playRange() {
  if (S.bars) return { order: playOrder(S.song, S.bars.a, S.bars.b), from: 0, meta: { whole: false, lo: S.bars.a, hi: S.bars.b } };
  const order = playOrder(S.song), cm = cellMap(S.song);
  const m = S.layer === 'chords' ? S.cs.m : S.cursor.m;
  return { order, from: Math.max(0, order.indexOf(cm.start[m])), meta: { whole: true } };
}
let startToken = 0;
// Pause keeps the place (and the keys lit); ▶ carries on from there. Moving the selection while paused
// drops the place, so ▶ starts from the selection as usual.
let paused = null, lastCur = null;
let pianoDrag = null;                 // the keyboard being slid by a swipe
// a tap that only closed a popup mustn't also click whatever was under it
let swallowUntil = 0;
const swallowClick = () => { swallowUntil = performance.now() + 500; };
// run fn when the current tap is over (its click has gone to the element it started on)
function afterTap(fn) {
  let done = false;
  const go = () => { if (done) return; done = true; document.removeEventListener('click', late, true); setTimeout(fn, 0); };
  const late = () => go();
  document.addEventListener('click', late, true);
  setTimeout(go, 700);
}
const selKey = () => JSON.stringify([S.song.id, S.layer, S.cursor, S.cs, S.bars]);
function checkPause() {
  if (paused && paused.selKey !== selKey()) { paused = null; S.keysTouched = false; playingAt = null; setMelNow(new Set()); queueMicrotask(renderInfo); }
}
function setMelNow(set) {
  if (set.size === melNow.size && [...set].every((m) => melNow.has(m))) return;
  melNow = set; updateBigPiano(); updateStripMelody();
}
function pausePlay() {
  const idx = lastCur && lastCur.idx != null ? lastCur.idx : seq.beat;
  paused = { range: seq.range, idx, selKey: selKey() };
  seq.stop();
  renderOverlay(); renderTransport(); updateBigPiano();
}
function stopPlay() { paused = null; S.keysTouched = false; seq.stop(); playingAt = null; setMelNow(new Set()); renderOverlay(); renderTransport(); updateBigPiano(); }
async function togglePlay() {
  engine.unlock();
  if (startToken) { startToken = 0; renderTransport(); return; }
  if (seq.playing) { pausePlay(); return; }
  if (!songHasSound()) { toast('Add some notes or chords first'); return; }
  const r = playRange();
  const resume = !!(paused && paused.selKey === selKey() && paused.range.order.join() === r.order.join());
  const from = resume ? paused.idx : r.from, meta = resume ? paused.range.meta : r.meta;
  paused = null; S.keysTouched = false;
  const token = startToken = Date.now();
  $('#btn-play').textContent = '…';
  await instrumentsReady();
  if (startToken !== token) return;
  startToken = 0;
  S.auditionVoices.forEach((h) => h && h.release(engine.ctx.currentTime));
  melHits = []; lastCur = null;
  seq.start({ order: r.order, loop: S.settings.loop, meta }, from, { countIn: !resume });
  renderTransport();
  requestAnimationFrame(playheadLoop);
}
function followBars() {
  renderTransport();
  if (!seq.playing || !seq.range || !S.settings.loop) return;
  const r = playRange();
  seq.setRange({ order: r.order, loop: true, meta: r.meta });
  renderTransport();
}
function onLoopToggle() {
  S.settings.loop = !S.settings.loop;
  if (seq.playing && seq.range) {
    if (S.settings.loop) { const r = playRange(); seq.range.loop = true; seq.setRange({ order: r.order, loop: true, meta: r.meta }); }
    else {
      seq.pending = null;
      // already playing the whole song: carry on where it is (a repeat's second time stays the second time)
      if (!S.bars && !(seq.range.meta && seq.range.meta.whole)) { const full = playOrder(S.song), at = full.indexOf(seq.currentCell()); if (at >= 0) { seq.range = { order: full, loop: false, meta: { whole: true } }; seq.beat = at; } }
      seq.range.loop = false;
    }
  }
  persistSoon(); renderTransport();
}
let playingAt = null;
function playheadLoop() {
  const cur = seq.poll();
  if (cur) lastCur = cur;
  if (engine.ctx) {
    const now = engine.ctx.currentTime - (engine.ctx.outputLatency || engine.ctx.baseLatency || 0);
    if (melHits.length > 200) melHits = melHits.filter((h) => h.t1 > now - 1);
    setMelNow(new Set(melHits.filter((h) => h.t0 <= now && now < h.t1).map((h) => h.midi)));
  }
  if (cur) {
    const tl = timeline(), m = tl.cm.ofCell[cur.cell], beat = cur.cell - tl.cm.start[m];
    if (!playingAt || playingAt.m !== m || playingAt.beat !== beat) {
      playingAt = { m, beat };
      renderOverlay(); renderInfo();
      const M = S.layout && S.layout.measures[m]; if (M) scrollIntoViewY(M.sysTop, M.sysH);
      renderTransport();
    }
  }
  if (seq.playing) requestAnimationFrame(playheadLoop);
  else setTimeout(() => { if (!seq.playing && !paused) { playingAt = null; setMelNow(new Set()); renderOverlay(); renderTransport(); renderInfo(); } }, 300);
}
function activeMeta() { if (seq.playing && seq.range) return (seq.pending || seq.range).meta; return playRange().meta; }
function renderTransport() {
  const chip = $('#loop-chip'); if (!chip) return;
  const s = S.settings, m = activeMeta(), switching = seq.playing && seq.pending && s.loop;
  const span = m.whole ? 'Whole song' : m.lo === m.hi ? `Bar ${barNumber(S.song, m.lo)}` : `Bars ${barNumber(S.song, m.lo)}–${barNumber(S.song, m.hi)}`;
  const main = s.loop ? span : 'Loop off';
  checkPause();
  const sub = paused ? 'paused · ▶ carries on' : s.loop ? (switching ? 'from next bar' : m.whole ? 'drag bars to loop' : 'looping selection') : (m.whole ? 'plays to the end' : `plays ${span.toLowerCase()}`);
  chip.classList.toggle('on', s.loop);
  chip.querySelector('.lc-main').textContent = main; chip.querySelector('.lc-sub').textContent = sub;
  const play = $('#btn-play');
  if (!startToken) play.textContent = seq.playing ? '❚❚' : '▶';
  play.classList.toggle('on', seq.playing);
  play.setAttribute('aria-label', seq.playing ? 'Pause' : paused ? 'Carry on playing' : 'Play');
  const mc = $('#mel-chip');
  if (mc) { mc.hidden = !!S.song.chartOnly; mc.classList.toggle('on', !!s.playMelody); mc.querySelector('.mc-sub').textContent = s.playMelody ? 'on' : 'off'; }
  const sw = $('#swing-chip');
  if (sw) { sw.classList.toggle('on', !!s.swingOn); sw.querySelector('.sw-main').dataset.on = s.swingOn ? 'swing' : 'straight'; }
  $('#bpm-val').textContent = S.song.tempo || 120;
}
function setTempo(t) { S.song.tempo = Math.max(30, Math.min(320, Math.round(t) || 120)); renderTransport(); persistSoon(); }
function fastTap(el, fn) {
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); el._downAt = performance.now(); fn(e); });
  el.addEventListener('click', (e) => { if (!(performance.now() - (el._downAt || 0) < 800)) fn(e); });
}
function bindTransport() {
  fastTap($('#btn-play'), () => togglePlay());
  $('#loop-chip').addEventListener('click', onLoopToggle);
  $('#swing-chip').addEventListener('click', () => { S.settings.swingOn = !S.settings.swingOn; persistSoon(); renderTransport(); });
  $('#mel-chip').addEventListener('click', () => {
    S.settings.playMelody = !S.settings.playMelody; persistSoon(); renderTransport();
    toast(S.settings.playMelody ? 'Melody on' : 'Melody off: just the backing');
  });
  fastTap($('#info'), () => {
    engine.unlock();
    if (playingAt) hearChordAt(playingAt.m, playingAt.beat, true);
    else if (S.layer === 'chords') hearChordAt(S.cs.m, csPos(), true);
    else { const e = selEv(); if (e && !e.r) hearNote(midiOf(e.p), 1); }
    const el = $('#info'); el.classList.add('pressed'); setTimeout(() => el.classList.remove('pressed'), 150);
  });
  for (const [id, dir] of [['#tempo-down', -1], ['#tempo-up', 1]]) {
    const b = $(id); let timer = null, t0 = 0;
    const stop = () => { clearTimeout(timer); timer = null; };
    const repeat = () => { const fast = performance.now() - t0 > 1200; setTempo((S.song.tempo || 120) + dir * (fast ? 5 : 1)); timer = setTimeout(repeat, fast ? 110 : 90); };
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); b._downAt = performance.now(); t0 = b._downAt; setTempo((S.song.tempo || 120) + dir); timer = setTimeout(repeat, 420); });
    b.addEventListener('click', () => { if (!(performance.now() - (b._downAt || 0) < 800)) setTempo((S.song.tempo || 120) + dir); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => b.addEventListener(ev, stop));
  }
  let taps = [];
  fastTap($('#bpm'), () => {
    engine.unlock();
    const now = performance.now();
    if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
    taps.push(now); if (taps.length > 5) taps.shift();
    if (engine.ctx) engine.click(engine.ctx.currentTime + 0.005, taps.length === 1);
    if (taps.length >= 2) { const g = taps.slice(1).map((t, k) => t - taps[k]); setTempo(60000 / (g.reduce((a, b) => a + b, 0) / g.length)); } else toast('Keep tapping the beat');
  });
}

// ---------------------------------------------------------------- typing (melody bars or chords)
function toggleTypebar(force) {
  const bar = $('#typebar'), show = force !== undefined ? force : bar.hidden;
  bar.hidden = !show;
  const inp = $('#type-input');
  if (show) {
    if (S.layer === 'chords') {
      const c = csChord();
      inp.value = c ? chordText(c).replace(/,\s+/g, ',') : '';
      inp.placeholder = 'C-7b9  or bars: D-7 [G7 D♭7] | CΔ7';
    } else {
      inp.value = melodyText(S.song, S.cursor.m, S.cursor.m + 1);
      inp.placeholder = '8:Bb4 8:C5 4:D5 2:r | 1:F5';
    }
    previewType(); inp.focus(); inp.select();
  } else { inp.blur(); document.body.classList.remove('typing'); }
}
function previewType() {
  const v = $('#type-input').value.trim(), msg = $('#type-msg');
  msg.classList.remove('err');
  try {
    if (S.layer === 'chords') {
      if (!v) { msg.textContent = 'One chord, or bars split by | · [C F] splits a beat · 2[C D E] = quarter triplet'; return; }
      if (!v.includes('|') && !/\s/.test(v.replace(/\([^)]*\)/g, ''))) { const c = parseChord(v); msg.textContent = `${chordText(c)} → ${c.nc ? 'no chord' : chordNotes(c).map(noteName).join(' ')}`; return; }
      const bars = parseChordBars(v); msg.textContent = `${bars.length} bar${bars.length > 1 ? 's' : ''} from ${barLabel(S.cs.m)}`;
    } else {
      if (!v) { msg.textContent = 'value:pitch — 4:C5 8.:Bb4 16:r 2:F5~ (tie) 3[8:C5 8:D5 8:E5] · | between bars'; return; }
      const bars = parseMelody(v, S.song);
      const lens = bars.map((b) => b.reduce((s, e) => s + evTicks(e), 0));
      const bad = lens.findIndex((t, k) => { const meas = S.song.measures[S.cursor.m + k]; return Math.abs(t - (meas ? meas.len : S.song.time.num * beatTicks(S.song.time.den))) > 0.5; });
      if (bad >= 0) { const bt = beatTicks(S.song.time.den); msg.textContent = `Bar ${bad + 1} of your text has ${+(lens[bad] / bt).toFixed(3)} beats`; msg.classList.add('err'); return; }
      msg.textContent = `${bars.length} bar${bars.length > 1 ? 's' : ''} from ${barLabel(S.cursor.m)}`;
    }
  } catch (e) { msg.textContent = e.message; msg.classList.add('err'); }
}
// the iPhone keyboard types lowercase: "d-7" and "c/e" are fine
const capChord = (t) => t.replace(/^([\[{]*\d*\[?)([a-g])/, (m, pre, x) => pre + x.toUpperCase()).replace(/\/([a-g])(?=[#b♯♭]?\]?$)/, (m, x) => '/' + x.toUpperCase());
function applyType() {
  const v = $('#type-input').value.trim(); if (!v) return;
  const msg = $('#type-msg');
  try {
    if (S.layer === 'chords') {
      if (!v.includes('|') && !/\s/.test(v.replace(/\([^)]*\)/g, ''))) { setCell(parseChord(capChord(v))); toggleTypebar(false); return; }
      const bars = parseChordBars(v.split(/(\s+|\|)/).map(capChord).join(''));
      edit(() => {
        bars.forEach((b, k) => {
          const m = S.cs.m + k;
          while (S.song.measures.length <= m) S.song.measures.push(emptyMeasure(S.song.time.num * beatTicks(S.song.time.den), S.song.time.num));
          fillChords(S.song.measures[m], b.cells);
          if (Object.keys(b.mark).length) S.song.marks[m] = { ...(S.song.marks[m] || {}), ...b.mark };
        });
      });
    } else {
      const bars = parseMelody(v, S.song);
      edit(() => { setMelody(S.song, bars, S.cursor.m); S.sel = null; S.picked = false; });
    }
    toggleTypebar(false);
  } catch (e) { msg.textContent = e.message; msg.classList.add('err'); }
}

// ---------------------------------------------------------------- sheets
function closeSheets() { document.querySelectorAll('.sheet').forEach((s) => { s.hidden = true; }); }
function openSheet(which) { closeSheets(); if (which === 'settings') renderSettings(); else renderCharts(); $('#sheet-' + which).hidden = false; }
const optionList = (items, cur) => items.map((o) => `<option value="${o.id}"${String(o.id) === String(cur) ? ' selected' : ''}>${esc(o.label)}</option>`).join('');
function instrumentOptions(cur, kind) {
  const groups = {};
  for (const x of [...SYNTHS, ...engine.index]) {
    if (kind === 'bass' ? !(x.bass || x.group === 'Built-in synths') : x.bass) continue;
    (groups[x.group] = groups[x.group] || []).push(x);
  }
  const order = kind === 'melody' ? ['Melody', 'Keys', 'Mallets', 'Guitar', 'Organ', 'Ensemble', 'Synth', 'Built-in synths'] : Object.keys(groups);
  return order.filter((g) => groups[g]).map((g) => `<optgroup label="${esc(g)}">${optionList(groups[g], cur)}</optgroup>`).join('');
}
function renderSettings() {
  const s = S.settings, song = S.song;
  const range = (id, label, min, max, step, val) => `<div class="row"><label for="${id}">${label}</label><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${val}"><span class="val" id="${id}-v">${Math.round(val * 100)}%</span></div>`;
  const check = (id, label, v) => `<div class="row"><label for="${id}">${label}</label><input id="${id}" type="checkbox"${v ? ' checked' : ''}></div>`;
  const keys = Object.entries(KEY_NAMES).map(([f, n]) => ({ id: f, label: `${n.replace('b', '♭').replace('#', '♯')} major` })).sort((a, b) => a.id - b.id);
  $('#settings-body').innerHTML = `
    <div class="group"><h3>Song</h3>
      <div class="row"><label for="st-title">Title</label><input id="st-title" type="text" value="${esc(song.title)}"></div>
      <div class="row"><label for="st-comp">Composer</label><input id="st-comp" type="text" value="${esc(song.composer || '')}"></div>
      <div class="row"><label for="st-key">Key signature</label><select id="st-key">${optionList(keys, song.key.fifths)}</select></div>
      <div class="row"><label for="st-num">Time signature</label><select id="st-num">${optionList([2, 3, 4, 5, 6, 7, 9, 12].map((n) => ({ id: n, label: n })), song.time.num)}</select>
        <select id="st-den">${optionList([2, 4, 8].map((n) => ({ id: n, label: '/' + n })), song.time.den)}</select></div>
      ${check('st-chart', 'Chord chart (no melody)', !!song.chartOnly)}
      <div class="row"><label for="st-nbars">Bars</label><input id="st-nbars" type="number" inputmode="numeric" min="1" max="400" value="${song.measures.length - (song.pickup ? 1 : 0)}"></div>
      <div class="row"><label for="st-pick">Pickup beats</label><select id="st-pick">${optionList(Array.from({ length: song.time.num }, (_, k) => ({ id: k, label: k ? String(k) : 'None' })), song.pickup || 0)}</select></div>
    </div>
    <div class="group"><h3>Sound</h3>
      <div class="row"><label for="st-mel">Melody sound</label><select id="st-mel">${instrumentOptions(s.melodyInst, 'melody')}</select></div>
      <div class="row"><label for="st-chord">Chord sound</label><select id="st-chord">${instrumentOptions(s.chordInst, 'chord')}</select></div>
      <div class="row"><label for="st-compat">Rhythm</label><select id="st-compat">${optionList(COMP_PATTERNS, s.compPattern)}</select></div>
      <div class="row"><label for="st-voicing">Voicing</label><select id="st-voicing">${optionList(VOICINGS, s.voicing)}</select></div>
      <div class="row"><label for="st-bpat">Bass line</label><select id="st-bpat">${optionList(BASS_PATTERNS, s.bassPattern)}</select></div>
      <div class="row"><label for="st-bass">Bass sound</label><select id="st-bass">${instrumentOptions(s.bassInst, 'bass')}</select></div>
      ${check('st-pc', 'Play the chords', s.playChords)}
      ${range('st-swing', 'Swing amount', 0.1, 1, 0.05, s.swingAmt)}${range('st-reverb', 'Reverb', 0, 0.6, 0.01, s.reverb)}
      ${check('st-click', 'Click', s.click)}
      <div class="row"><label for="st-count">Count-in</label><select id="st-count">${optionList([{ id: 0, label: 'None' }, { id: 1, label: '1 bar' }, { id: 2, label: '2 bars' }], s.countIn)}</select></div>
    </div>
    <div class="group"><h3>Volume</h3>${range('st-vm', 'Melody', 0, 1, 0.01, s.volMelody)}${range('st-vc', 'Chords', 0, 1, 0.01, s.volChord)}${range('st-vb', 'Bass', 0, 1, 0.01, s.volBass)}${range('st-vk', 'Click', 0, 1, 0.01, s.volClick)}</div>
    <div class="group"><h3>Display &amp; editing</h3>
      <div class="row"><label for="st-split">Split (iPhone Duo half-folded)</label><select id="st-split">${optionList([{ id: 'auto', label: 'Auto' }, { id: 'on', label: 'On' }, { id: 'off', label: 'Off' }], s.split || 'auto')}</select></div>
      <div class="row"><label for="st-keynames">Piano key names</label><select id="st-keynames">${optionList([{ id: 'c', label: 'C only' }, { id: 'all', label: 'Every white key' }], s.keyNames || 'c')}</select></div>
      <div class="row"><label>Split line<span class="row-sub">${s.foldAdjust ? `moved ${Math.abs(s.foldAdjust)} pt ${s.foldAdjust > 0 ? 'down' : 'up'}` : 'on the fold'}</span></label><button class="btn" id="st-fold">Move…</button></div>
      <div class="row"><label for="st-bpl">Bars per line (score)</label><select id="st-bpl">${optionList([{ id: 'auto', label: 'Auto' }, ...[1, 2, 3, 4, 5, 6].map((n) => ({ id: String(n), label: n }))], String(s.scoreBars || 'auto'))}</select></div>
      <div class="row"><label for="st-gbl">Bars per line (chord grid)</label><select id="st-gbl">${optionList([1, 2, 3, 4, 5, 6, 8].map((n) => ({ id: String(n), label: n })), String(s.gridBars || 4))}</select></div>
      ${check('st-aud', 'Play notes while editing', s.audition)}
    </div>
    <details class="group more"><summary>Gestures</summary>
      <dl class="howto">
        <dt>Piano key</dt><dd>enter a note (current length)</dd>
        <dt>Tap a note</dt><dd>select; a length key then changes it</dd>
        <dt>Tap a chord</dt><dd>edit chords</dd>
        <dt>Drag across</dt><dd>select bars (loop / bar tools)</dd>
        <dt>Tuplet key</dt><dd>3 → 5 → 6 → 7 → off</dd>
        <dt>Tie</dt><dd>tie to the next note (adds one if needed)</dd>
        <dt>⌨</dt><dd>4:C5 8.:Bb4 16:r 3[8:C5 8:D5 8:E5] | …</dd>
      </dl>
    </details>`;
  const on = (id, ev, fn) => $('#' + id).addEventListener(ev, fn);
  const setS = (k, v, retime = false) => { S.settings[k] = v; if (retime) invalidate(); applyAudioSettings(); persistSoon(); };
  const songEdit = (fn) => { edit(fn); renderSettings(); };
  on('st-title', 'change', (e) => songEdit(() => { S.song.title = e.target.value.trim() || 'Untitled'; }));
  on('st-comp', 'change', (e) => songEdit(() => { S.song.composer = e.target.value.trim(); }));
  on('st-key', 'change', (e) => songEdit(() => { S.song.key.fifths = +e.target.value; }));
  on('st-num', 'change', (e) => songEdit(() => changeTime(+e.target.value, S.song.time.den)));
  on('st-den', 'change', (e) => songEdit(() => changeTime(S.song.time.num, +e.target.value)));
  on('st-pick', 'change', (e) => songEdit(() => setPickup(+e.target.value)));
  on('st-mel', 'change', (e) => { setS('melodyInst', e.target.value); preloadInstruments(); });
  on('st-chord', 'change', (e) => { setS('chordInst', e.target.value); preloadInstruments(); });
  on('st-bass', 'change', (e) => { setS('bassInst', e.target.value); preloadInstruments(); });
  on('st-compat', 'change', (e) => setS('compPattern', e.target.value));
  on('st-voicing', 'change', (e) => setS('voicing', e.target.value, true));
  on('st-bpat', 'change', (e) => { setS('bassPattern', e.target.value); preloadInstruments(); });
  on('st-pc', 'change', (e) => setS('playChords', e.target.checked));
  on('st-click', 'change', (e) => setS('click', e.target.checked));
  on('st-count', 'change', (e) => setS('countIn', +e.target.value));
  on('st-aud', 'change', (e) => setS('audition', e.target.checked));
  on('st-bpl', 'change', (e) => { setS('scoreBars', e.target.value); render(); });
  on('st-gbl', 'change', (e) => { setS('gridBars', +e.target.value); render(); });
  on('st-chart', 'change', (e) => { songEdit(() => { S.song.chartOnly = e.target.checked; }); if (S.song.chartOnly && S.layer === 'melody') setLayer('chords'); else { buildPanel(); render(); } });
  on('st-nbars', 'change', (e) => { setBarCount(+e.target.value); renderSettings(); });
  on('st-split', 'change', (e) => { setS('split', e.target.value); applySplit(); render(); });
  on('st-fold', 'click', () => { closeSheets(); alignFold(); });
  on('st-keynames', 'change', (e) => { setS('keyNames', e.target.value); buildBigPiano(); });
  for (const [id, key] of [['st-swing', 'swingAmt'], ['st-reverb', 'reverb'], ['st-vm', 'volMelody'], ['st-vc', 'volChord'], ['st-vb', 'volBass'], ['st-vk', 'volClick']]) {
    on(id, 'input', (e) => { setS(key, +e.target.value); $('#' + id + '-v').textContent = Math.round(e.target.value * 100) + '%'; });
  }
}
// time signature change: bars keep their notes where they fit; others are reset to rests
function setBarCount(n) {
  const song = S.song, have = song.measures.length - (song.pickup ? 1 : 0);
  n = Math.max(1, Math.min(400, Math.round(n) || have));
  if (n === have) return;
  const bt = beatTicks(song.time.den), num = song.time.num;
  edit(() => {
    if (n > have) for (let k = have; k < n; k++) song.measures.push(emptyMeasure(num * bt, num));
    else {
      const keep = n + (song.pickup ? 1 : 0);
      song.measures.length = keep;
      for (const m of Object.keys(song.marks)) if (+m >= keep) delete song.marks[m];
    }
  });
  if (n < have) toast(`Removed ${have - n} bar${have - n > 1 ? 's' : ''} from the end (undo brings ${have - n > 1 ? 'them' : 'it'} back)`);
  clampSelection(); render();
}
function changeTime(num, den) {
  const song = S.song, bt = beatTicks(den), full = num * bt;
  song.time = { num, den };
  song.measures = song.measures.map((meas, m) => {
    const beats = m === 0 && song.pickup ? Math.min(song.pickup, num - 1) || 1 : num;
    const len = beats * bt;
    const nm = emptyMeasure(len, beats);
    copyChords(meas, nm);
    if (Math.abs(meas.len - len) < 1) nm.ev = meas.ev;
    return nm;
  });
  if (song.pickup) song.pickup = Math.round(song.measures[0].len / bt);
  toast(`Time signature ${num}/${den}${song.measures.some((x, k) => x.ev.length === 1) ? ' — bars that no longer fit were cleared' : ''}`);
  clampSelection();
  return full;
}
// remove the pickup bar; if it's the only bar, it becomes an empty full bar instead (a song keeps one bar)
function dropPickup(song) {
  if (song.measures.length > 1) { song.measures.shift(); song.marks = shiftMarks(song.marks, 0, -1); }
  else song.measures[0] = emptyMeasure(song.time.num * beatTicks(song.time.den), song.time.num);
  song.pickup = 0;
}
function setPickup(beats) {
  const song = S.song, bt = beatTicks(song.time.den);
  if (song.pickup) dropPickup(song);
  song.pickup = beats;
  if (beats) { song.measures.unshift(emptyMeasure(beats * bt, beats)); song.marks = shiftMarks(song.marks, 0, 1); }
  S.bars = null; S.sel = null; clampSelection();
}

function renderCharts() {
  persist();
  const items = S.charts.map((c) => `
    <div class="chart-item${c.id === S.song.id ? ' current' : ''}" data-id="${c.id}">
      <span class="name" data-open>${esc(c.title)}${c.gh ? ' <small class="gh-tag">GitHub</small>' : ''}</span><button data-dup>Duplicate</button><button data-del class="del">Delete</button>
    </div>`).join('');
  $('#charts-body').innerHTML = `
    <div class="btn-row"><button class="btn" id="ch-new">New song</button><button class="btn" id="ch-new-chart">New chord chart</button></div>
    <div class="group">${items}</div>
    <details class="group more"><summary>Export, import and backup</summary>
      <h3>This song as text</h3><textarea class="io" id="ch-export" readonly>${esc(songToText(S.song))}</textarea>
      <div class="btn-row"><button class="btn secondary" id="ch-copy">Copy</button></div>
      <h3>Import</h3>
      <textarea class="io" id="ch-import" placeholder="Paste a song or a backup exported from here, or a chart exported from iFake"></textarea>
      <div class="btn-row"><button class="btn secondary" id="ch-import-go">Import</button></div>
      <p class="hint" id="ch-import-msg"></p>
      <h3>All songs</h3>
      <p class="hint">A backup holds every song, to move them to another device or to the app at a new address.</p>
      <div class="btn-row"><button class="btn secondary" id="ch-backup">Save a backup</button><button class="btn secondary" id="ch-backup-copy">Copy backup</button>
        <label class="btn secondary file">Restore a backup…<input type="file" id="ch-restore" accept=".json,application/json,text/plain" hidden></label></div>
      <div class="btn-row"><button class="btn secondary" id="ch-demo">Add the test chart</button></div>
    </details>`;
  $('#charts-body').querySelectorAll('.chart-item').forEach((row) => {
    const id = row.dataset.id;
    row.querySelector('[data-open]').addEventListener('click', () => { switchSong(id); closeSheets(); });
    row.querySelector('[data-dup]').addEventListener('click', () => {
      const src = id === S.song.id ? deserialiseSong(serialiseSong(S.song)) : deserialiseSong(S.charts.find((c) => c.id === id));
      src.id = uid(); src.title += ' (copy)';
      S.charts.unshift({ ...serialiseSong(src), updatedAt: Date.now() }); switchSong(src.id); renderCharts();
    });
    row.querySelector('[data-del]').addEventListener('click', () => {
      if (row.dataset.confirm !== '1') { row.dataset.confirm = '1'; row.querySelector('[data-del]').textContent = 'Delete?'; return; }
      S.charts = S.charts.filter((c) => c.id !== id); S.deleted[id] = Date.now();
      if (!S.charts.length) S.charts = [{ ...serialiseSong(newSong()), updatedAt: Date.now() }];
      if (id === S.song.id) switchSong(S.charts[0].id, { saveCurrent: false }); else persist();
      renderCharts();
    });
  });
  $('#ch-new').addEventListener('click', () => { const s = newSong({ fifths: S.song.key.fifths }); S.charts.unshift({ ...serialiseSong(s), updatedAt: Date.now() }); switchSong(s.id); closeSheets(); });
  $('#ch-new-chart').addEventListener('click', () => {
    const s = newSong({ fifths: S.song.key.fifths, bars: 16 }); s.chartOnly = true; s.title = 'New chord chart';
    S.charts.unshift({ ...serialiseSong(s), updatedAt: Date.now() }); switchSong(s.id); closeSheets();
  });
  $('#ch-demo').addEventListener('click', () => { const s = songFromText(DEMO_SONG_TEXT); S.charts.unshift({ ...serialiseSong(s), updatedAt: Date.now() }); switchSong(s.id); closeSheets(); });
  $('#ch-copy').addEventListener('click', async () => { const ta = $('#ch-export'); try { await navigator.clipboard.writeText(ta.value); toast('Copied'); } catch (e) { ta.focus(); ta.select(); toast('Select all and copy'); } });
  $('#ch-backup').addEventListener('click', saveBackup);
  $('#ch-backup-copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(backupText()); toast('Backup copied'); } catch (e) { toast("Couldn't copy: use Save a backup"); } });
  $('#ch-restore').addEventListener('change', async (e) => { const f = e.target.files[0]; if (f) { try { restoreBackup(await f.text()); } catch (err) { toast(err.message); } } });
  $('#ch-import-go').addEventListener('click', () => {
    const txt = $('#ch-import').value;
    try {
      if (/^\s*\{/.test(txt)) { restoreBackup(txt); return; }          // a backup pasted in
      let s;
      if (/^\s*(\||\{)/m.test(txt) && !/^chords:/im.test(txt)) {          // a Chord Pad chart: its bars become chords
        const title = (/^title:\s*(.*)$/im.exec(txt) || [])[1] || 'Imported chords';
        s = songFromText(`Title: ${title}\nType: chord chart\nChords:\n${txt.split('\n').filter((l) => /^\s*[|{]/.test(l)).join('\n')}`);
      } else s = songFromText(txt);
      S.charts.unshift({ ...serialiseSong(s), updatedAt: Date.now() }); switchSong(s.id); closeSheets(); toast('Imported');
    } catch (e) { $('#ch-import-msg').textContent = e.message; }
  });
}
// ---- backups: every song in one file (each Home Screen app keeps its own songs, so this moves them)
function backupText() {
  syncCurrent();
  return JSON.stringify({ app: 'ifake-pro', kind: 'backup', version: 1, saved: new Date().toISOString(), songs: S.charts }, null, 1);
}
async function saveBackup() {
  const name = `iFake Pro songs ${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([backupText()], name, { type: 'application/json' });
  try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
// a song already here keeps whichever copy was changed last; restored songs are no longer "deleted"
function restoreBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error("That isn't a backup file"); }
  const songs = data && Array.isArray(data.songs) ? data.songs : null;
  if (!songs) throw new Error("That isn't an iFake Pro backup");
  syncCurrent();
  let added = 0, updated = 0;
  for (const c of songs) {
    if (!c || !c.id || !Array.isArray(c.bars)) continue;
    try { deserialiseSong(c); } catch (e) { continue; }
    delete S.deleted[c.id];
    const i = S.charts.findIndex((x) => x.id === c.id);
    if (i < 0) { S.charts.push(c); added++; }
    else if ((c.updatedAt || 0) > (S.charts[i].updatedAt || 0)) { S.charts[i] = c; updated++; }
  }
  const cur = S.charts.find((x) => x.id === S.song.id);
  if (cur) S.song = deserialiseSong(cur);
  tidyLibrary(); persist(); render(); renderCharts();
  toast(added || updated ? `Restored: ${added} new, ${updated} updated` : 'Nothing new in that backup');
}
function switchSong(id, opts = {}) {
  if (opts.saveCurrent !== false) syncCurrent();
  if (seq.playing || paused) stopPlay();
  // the staged draft chord comes along to the other song (to Write there)
  const staged = { notes: S.ck.notes.slice(), dirty: S.ck.dirty, set: S.draftSet };
  S.song = deserialiseSong(S.charts.find((c) => c.id === id) || S.charts[0]);
  if (S.song.chartOnly && S.layer === 'melody') { S.layer = 'chords'; buildPanel(); }
  resetSelection();
  if (staged.notes.length) {
    const own = csChord();
    Object.assign(S.ck, { notes: staged.notes, dirty: staged.dirty, slot: `${S.cs.m}:${S.cs.beat}:${S.cs.k || 0}`, text: own ? chordText(own) : '' });
    S.draftSet = staged.set;
  }
  render(); persist();
}

// ---------------------------------------------------------------- misc
let toastTimer = null;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 1800); }
function updateSyncLabel() {
  const el = $('#sync-status'), st = store.status;
  el.textContent = st === 'synced' ? 'Saved to your account' : st === 'syncing' ? 'Saving to your account…' : st === 'sync failed' ? 'Account sync failed — saved in this browser' : st === 'unsaved' ? 'Not saved — this browser blocks storage' : 'Saved in this browser';
  el.classList.toggle('warn', st === 'unsaved' || st === 'sync failed');
}
const sheetOpen = () => [...document.querySelectorAll('.sheet')].some((s) => !s.hidden);
function bindGlobal() {
  $('#btn-settings').addEventListener('click', () => openSheet('settings'));
  $('#btn-even').addEventListener('click', () => {
    S.settings.evenChords = !S.settings.evenChords; persistSoon(); render();
    toast(S.settings.evenChords ? 'Even: chords spaced as in iFake (melody hidden)' : 'Chords over the score');
  });
  $('#btn-charts').addEventListener('click', () => openSheet('charts'));
  $('#title').addEventListener('click', () => openSheet('charts'));
  document.querySelectorAll('.sheet').forEach((sh) => sh.addEventListener('click', (e) => { if (e.target === sh || e.target.hasAttribute('data-close')) closeSheets(); }));
  const inp = $('#type-input');
  inp.addEventListener('input', previewType);
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); applyType(); } if (e.key === 'Escape') toggleTypebar(false); });
  inp.addEventListener('focus', () => document.body.classList.add('typing'));
  inp.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== inp) document.body.classList.remove('typing'); }, 150));
  $('#type-go').addEventListener('click', applyType);
  $('#type-close').addEventListener('click', () => toggleTypebar(false));
  // hardware keyboard (iPad/Mac): MuseScore-like letters for pitches, digits for lengths
  document.addEventListener('keydown', (e) => {
    if (sheetOpen()) { if (e.key === 'Escape') closeSheets(); return; }
    const t = e.target;
    if (t && t !== document.body && t.closest('input, textarea, select, button, [role=button], [contenteditable]')) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if ((e.metaKey || e.ctrlKey) && k === 'z') { e.preventDefault(); undoRedo(e.shiftKey ? 'redo' : 'undo'); return; }
    if ((e.metaKey || e.ctrlKey) && k === 'y') { e.preventDefault(); undoRedo('redo'); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === ' ') { e.preventDefault(); togglePlay(); return; }
    if (S.layer !== 'melody') return;
    const durKeys = { 1: 64, 2: 32, 3: 16, 4: 8, 5: 4, 6: 2, 7: 1 };          // MuseScore's number keys
    if (durKeys[e.key]) { keyAction('dur', durKeys[e.key]); return; }
    if ('abcdefg'.includes(k) && k.length === 1) {
      // nearest octave to the previous note
      const prev = selEv(); const ref = prev && !prev.r ? midiOf(prev.p) : 67;
      const letter = 'cdefgab'.indexOf(k), base = [0, 2, 4, 5, 7, 9, 11][letter] + keyAccidental(S.song.key.fifths, letter);
      let best = null; for (let o = 2; o <= 7; o++) { const m = 12 * (o + 1) + base; if (!best || Math.abs(m - ref) < Math.abs(best - ref)) best = m; }
      enterPitch(best); return;
    }
    if (k === '0') keyAction('rest');
    else if (k === '.') keyAction('dot');
    else if (k === '+') keyAction('tie');
    else if (e.key === 'ArrowUp') { e.preventDefault(); keyAction(e.shiftKey ? 'oct' : 'up', 1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); keyAction(e.shiftKey ? 'oct' : 'down', -1); }
    else if (e.key === 'ArrowLeft') keyAction('prev');
    else if (e.key === 'ArrowRight') keyAction('next');
    else if (e.key === 'Backspace' || e.key === 'Delete') keyAction('del');
    else if (e.key === 'Enter') { e.preventDefault(); toggleTypebar(true); }
  });
  let rt = null;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { applySplit(); render(); }, 150); });
  try { if (navigator.devicePosture) navigator.devicePosture.addEventListener('change', () => { applySplit(); render(); }); } catch (e) { /* none */ }
  // fold changes (iPhone Duo): posture and segment changes also re-lay the page out
  try { if (navigator.devicePosture) navigator.devicePosture.addEventListener('change', () => { applySplit(); render(); }); } catch (e) { /* none */ }
  try { matchMedia('(vertical-viewport-segments: 2)').addEventListener('change', () => { applySplit(); render(); }); } catch (e) { /* none */ }
  const bp = $('#bigpiano');
  document.addEventListener('click', (e) => { if (performance.now() < swallowUntil) { e.preventDefault(); e.stopPropagation(); } }, true);
  // the keys: a tap plays (or toggles) a key; a sideways swipe slides the keyboard along, and it settles
  // on the nearest white key. Keys that sound while held start at once and stop if the touch turns into a swipe
  const touches = new Map();
  const endHold = (e, act) => {
    const h = tipHold; if (!h || h.id !== e.pointerId) return;
    clearTimeout(h.timer); tipHold = null;
    if (h.shown) hideTipSoon(); else if (act && !h.b.disabled) bigPianoBar(h.b.dataset.bp);
  };
  document.addEventListener('pointerup', (e) => endHold(e, true));
  document.addEventListener('pointercancel', (e) => endHold(e, false));
  bp.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-bp]');
    if (b && b.dataset.tip) {                                  // L / F: a tap toggles; holding shows what it does
      e.preventDefault();
      const h = { b, id: e.pointerId, shown: false };
      h.timer = setTimeout(() => { h.shown = true; showTip(b); }, 450);
      tipHold = h; return;
    }
    if (b) { e.preventDefault(); if (!b.disabled) bigPianoBar(b.dataset.bp); return; }
    const k = e.target.closest('.pk'); if (!k) return;
    e.preventDefault(); engine.unlock();
    try { bp.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
    const held = draftMode() && !latchOn();
    touches.set(e.pointerId, { k, x0: e.clientX, y0: e.clientY, held, pan: false, xs: [[e.clientX, performance.now()]] });
    if (held) draftDown(e, k); else k.classList.add('down');
  });
  bp.addEventListener('pointermove', (e) => {
    const g = touches.get(e.pointerId); if (!g) return;
    const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
    g.xs.push([e.clientX, performance.now()]); if (g.xs.length > 6) g.xs.shift();
    if (!g.pan) {
      if (touches.size > 1 || Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy)) return;
      g.pan = true; g.k.classList.remove('down');
      if (g.held) draftUp(e.pointerId);
      const keys = $('#bigpiano .bp-keys');
      pianoDrag = { w: keys.clientWidth / visWhites(), off0: baseIdx() * (keys.clientWidth / visWhites()) };
      g.x0 = e.clientX;
    }
    const d = pianoDrag, max = maxBaseIdx() * d.w;
    let off = d.off0 - (e.clientX - g.x0);
    if (off < 0) off /= 3; else if (off > max) off = max + (off - max) / 3;   // a little give at the ends
    d.off = off;
    const strip = $('#bigpiano .bp-strip');
    strip.style.transition = 'none'; strip.style.transform = `translateX(${-off}px)`;
  });
  const lift = (e) => {
    const g = touches.get(e.pointerId); if (!g) return;
    touches.delete(e.pointerId);
    if (g.pan) {
      // carry a flick on a little, then settle on the nearest white key
      const now = performance.now(), recent = g.xs.filter(([, at]) => now - at < 100);   // a finger that stopped before lifting doesn't fling
      const d = pianoDrag, a = recent[0], b = recent[recent.length - 1], v = recent.length > 1 && b[1] > a[1] ? (b[0] - a[0]) / (b[1] - a[1]) : 0;
      const off = (d.off != null ? d.off : d.off0) - v * 160;
      pianoDrag = null;
      setBigBase(pianoWhites[Math.max(0, Math.min(maxBaseIdx(), Math.round(off / d.w)))]);
      stripAt = -1; updateBigPiano();
      return;
    }
    if (g.held) { draftUp(e.pointerId); return; }
    g.k.classList.remove('down');
    if (e.type === 'pointerup') bigPianoKey(+g.k.dataset.midi);
  };
  for (const ev of ['pointerup', 'pointercancel']) bp.addEventListener(ev, lift);
  const flush = () => { if (persistTimer) persist(); store.flushNow(); };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  // leaving the app: pause, and let the sound start afresh on the first tap back (iOS can leave it stuck)
  const away = () => { if (seq.playing) pausePlay(); engine.away(); };
  engine.onRenew = () => { if (seq.playing) pausePlay(); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') away(); else engine.back(); });
  window.addEventListener('pagehide', away);
  window.addEventListener('pageshow', () => engine.back());
  // any tap wakes the sound (and starts it afresh after the app has been away), whatever was tapped; the end of
  // a touch counts too, since iOS lets sound start there when it won't at the touch's start
  for (const ev of ['pointerdown', 'touchend', 'click']) document.addEventListener(ev, () => { engine.unlock(); updateSoundBtn(); }, true);
  engine.onState = updateSoundBtn;
  // the chart area can change width without a resize event (Split View, a status column coming or going): lay
  // the chart out again whenever its width changes
  try {
    let lastW = 0, rt2 = 0;
    new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width);
      if (Math.abs(w - lastW) < 2) return;
      lastW = w; clearTimeout(rt2); rt2 = setTimeout(() => { applySplit(); render(); }, 80);
    }).observe($('#score-wrap'));
  } catch (e) { /* no ResizeObserver */ }
  const sb = $('#btn-sound');
  if (sb) {
    sb.innerHTML = SOUND_SVG;
    sb.addEventListener('click', () => {
      engine.restart();
      const ctx = engine.ensureContext();
      engine.note(S.settings.chordInst, 72, ctx.currentTime + 0.02, 0.35, 0.35, 'chord');   // a soft note to show it's back
      toast('Sound restarted'); setTimeout(updateSoundBtn, 300);
    });
    updateSoundBtn();
  }
}
function renderAll() { applySplit(); buildPanel(); render(); updateSyncLabel(); }

async function boot() {
  const local = store.loadLocal();
  loadData(local);
  bindPanel(); bindScore(); bindTransport(); bindGlobal();
  renderAll();
  if (!store.localOk) { warnedUnsaved = true; toast("This browser isn't saving — use Songs → Export"); }
  setTimeout(() => { try { nameTable(); } catch (e) { /* built on first use instead */ } }, 1200);   // chord names, ready before the first keys
  try { engine.ensureContext(); } catch (e) { /* no Web Audio */ }
  applyAudioSettings();
  await engine.loadIndex();
  preloadInstruments();
  ['pointerdown', 'touchend', 'click', 'keydown'].forEach((ev) => document.addEventListener(ev, () => engine.unlock(), { passive: true }));
  store.watchTabs();
  if (tidyLibrary()) persist();
  store.connectRemote(() => libraryData()).then(updateSyncLabel).then(syncRepoSongs);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncRepoSongs(); });
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* not offered */ }
  if ('serviceWorker' in navigator && window.self === window.top && (location.protocol === 'https:' || location.hostname === 'localhost') && !location.hostname.endsWith('claude.ai')) { navigator.serviceWorker.register('sw.js').catch(() => {}); watchForUpdates(); }
  window.__ls = { S, engine, seq, keyAction, enterPitch, render, renderAll, renderOverlay, playRange, timeline, libraryData, setLayer, tapScore, alignFold, syncRepoSongs, tidyLibrary, switchSong };   // for testing
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
