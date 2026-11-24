// score.js — engraves the lead sheet with VexFlow (loaded as window.Vex) and returns a layout for
// hit-testing, the cursor and the playhead.
import { positions, evTicks, keyAccidental, KEY_NAMES, beatTicks } from './melody.js';
import { LETTERS, accStr, qualityText, extName, noteName } from './chords.js';
import { slotList, beatGrid } from './song.js';

const DUR = { 1: 'w', 2: 'h', 4: 'q', 8: '8', 16: '16', 32: '32', 64: '64' };
const GHOST_W = 34;          // minimum room (unscaled px) per chord slot in a divided beat
const ACC_VF = { '-2': 'bb', '-1': 'b', 0: 'n', 1: '#', 2: '##' };
const SVGNS = 'http://www.w3.org/2000/svg';

function svgText(parent, x, y, parts, cls) {
  const t = document.createElementNS(SVGNS, 'text');
  t.setAttribute('x', x); t.setAttribute('y', y);
  if (cls) t.setAttribute('class', cls);
  for (const [txt, c, dy] of parts) {
    const s = document.createElementNS(SVGNS, 'tspan');
    s.textContent = txt;
    if (c) s.setAttribute('class', c);
    if (dy) s.setAttribute('dy', dy);
    t.appendChild(s);
  }
  parent.appendChild(t);
  return t;
}
// the simile sign (one bar / two bars), centred on (x, y)
function simSign(parent, x, y, kind, s = 1) {
  const g = document.createElementNS(SVGNS, 'g');
  g.setAttribute('class', 'chord-sym chord-sim');
  if (kind === 'two') {
    g.setAttribute('transform', `translate(${x - 18 * s * 0.8} ${y - 15 * s * 0.8}) scale(${s * 0.8})`);
    g.innerHTML = '<text x="18" y="8" text-anchor="middle" font-size="9" font-weight="700">2</text><circle cx="5.5" cy="15" r="2.4"/><circle cx="30.5" cy="26" r="2.4"/><path d="M4 30h3.4l10.4-18h-3.4zM15.4 30h3.4l10.4-18h-3.4z"/>';
  } else {
    g.setAttribute('transform', `translate(${x - 12 * s * 0.85} ${y - 12 * s * 0.85}) scale(${s * 0.85})`);
    g.innerHTML = '<circle cx="6" cy="7.5" r="2.4"/><circle cx="18" cy="16.5" r="2.4"/><path d="M4 21h3.6L20 3h-3.6z"/>';
  }
  parent.appendChild(g);
  return g;
}
// a beat slash in the chord row, centred on (x, y)
function beatSlash(parent, x, y) {
  const g = document.createElementNS(SVGNS, 'g');
  g.setAttribute('class', 'chord-sym chord-sim');
  g.setAttribute('transform', `translate(${x - 5} ${y - 10}) scale(0.85)`);
  g.innerHTML = '<path d="M1.5 22.5h3.4L10.5 1.5H7.1z"/>';
  parent.appendChild(g);
  return g;
}
function svgPath(parent, d, cls) {
  const p = document.createElementNS(SVGNS, 'path');
  p.setAttribute('d', d);
  if (cls) p.setAttribute('class', cls);
  parent.appendChild(p);
  return p;
}
function chordParts(c) {
  if (c.nc) return [['N.C.', 'cs-q']];
  const parts = [[LETTERS[c.root.letter], 'cs-r']];
  const a = accStr(c.root.acc);
  let lifted = false;
  if (a) { parts.push([a, 'cs-a', '-6']); lifted = true; }
  const q = qualityText(c);
  if (q) { parts.push([q, 'cs-q', lifted ? '6' : null]); lifted = false; }
  if (c.exts.length) { parts.push([c.exts.map(extName).join(' '), 'cs-x', '-7']); lifted = true; }
  if (c.bass) parts.push(['/' + noteName(c.bass), 'cs-b', lifted ? '7' : null]);
  return parts;
}

// opts: { width, barsPerLine, exact (exactly barsPerLine per line, even if cramped), barNumber(m) }
export function renderScore(el, song, opts) {
  const VF = window.Vex.Flow;
  // Gonville (VexFlow's original font): Bravura's tall down-stem flag runs up into the notehead at this size
  if (!renderScore.font) { VF.setMusicFont('Gonville', 'Bravura', 'Custom'); renderScore.font = true; }
  el.innerHTML = '';
  // engrave at a virtual width and scale the drawing down on narrow screens (phone staff size)
  const scale = opts.scale || (opts.width < 520 ? 0.72 : opts.width < 760 ? 0.85 : 1);
  const width = Math.max(300, opts.width) / scale;
  const per = Math.max(1, opts.barsPerLine);
  const fifths = song.key.fifths, keyName = KEY_NAMES[fifths];
  const TPB = beatTicks(song.time.den);
  const LINE_H = 150, TOP = 8, STAFF_OFFSET = 50;
  const keyPad = 18 + Math.abs(fifths) * 10, clefPad = 34, timePad = 30;
  const staveNotes = [];          // per measure: VexFlow notes by event index

  // ---- pass 1: build notes, voices, beams and tuplets; measure each bar's minimum width
  const built = song.measures.map((meas, m) => {
    const notes = [], acc = {};
    const ps = positions(meas);
    ps.forEach(({ e }, i) => {
      let sn;
      const wholeBar = e.r && (e.whole || (meas.ev.length === 1 && e.b === 1));
      if (e.r) {
        sn = new VF.StaveNote({ keys: [wholeBar ? 'd/5' : 'b/4'], duration: (wholeBar ? 'w' : DUR[e.b]) + 'r', dots: wholeBar ? 0 : e.d || 0, align_center: wholeBar });
      } else {
        sn = new VF.StaveNote({ keys: [`${'cdefgab'[e.p.l]}/${e.p.o}`], duration: DUR[e.b], dots: e.d || 0, auto_stem: true });
        const k2 = `${e.p.l}/${e.p.o}`;
        const prevEv = i > 0 ? meas.ev[i - 1] : null;
        const tiedIn = prevEv && prevEv.tie && !prevEv.r;
        const current = acc[k2] !== undefined ? acc[k2] : keyAccidental(fifths, e.p.l);
        if (e.p.a !== current && !tiedIn) sn.addModifier(new VF.Accidental(ACC_VF[e.p.a]), 0);
        acc[k2] = e.p.a;
      }
      if (!wholeBar) for (let d = 0; d < (e.d || 0); d++) VF.Dot.buildAndAttach([sn], { all: true });
      notes.push(sn);
    });
    const beats = Math.max(1, Math.round(meas.len / TPB));
    const voice = new VF.Voice({ num_beats: beats, beat_value: song.time.den }).setMode(VF.Voice.Mode.SOFT);
    const beams = [], tuplets = [], groups = [];
    ps.forEach(({ e }, i) => {
      if (!e.tup) return;
      const g = groups[groups.length - 1];
      if (g && g.id === e.tup.id) g.idx.push(i); else groups.push({ id: e.tup.id, n: e.tup.n, m: e.tup.m, idx: [i] });
    });
    for (const g of groups) {
      const gn = g.idx.map((i) => notes[i]);
      const beamable = g.idx.every((i) => meas.ev[i].b >= 8) && g.idx.filter((i) => !meas.ev[i].r).length >= 2;
      let beam = null;
      if (beamable) { try { beam = new VF.Beam(gn, true); beams.push(beam); } catch (err) { /* can't beam */ } }   // true: one stem direction for the group
      // a beamed tuplet's number goes on the beam side (and so stays clear of the chord symbols when stems point down)
      const location = beam && beam.stem_direction === VF.Stem.DOWN ? VF.Tuplet.LOCATION_BOTTOM : VF.Tuplet.LOCATION_TOP;
      tuplets.push(new VF.Tuplet(gn, { num_notes: g.n, notes_occupied: g.m, ratioed: false, bracketed: !beam, location }));
    }
    // add the notes only now: the voice works out its tick resolution from them, tuplets included, and
    // the formatter needs that to line this voice up with the ghost voice below
    voice.addTickables(notes);
    // beams: consecutive notes of an eighth or shorter inside the same beat (compound time: dotted-quarter beats)
    const inTup = new Set(groups.flatMap((g) => g.idx));
    const beamUnit = song.time.den === 8 && song.time.num % 3 === 0 ? 3 * TPB : TPB;
    let run = [];
    const flushRun = () => { if (run.length > 1) { try { beams.push(new VF.Beam(run.map((i) => notes[i]), true)); } catch (err) { /* skip */ } } run = []; };
    ps.forEach(({ e, start, end }, i) => {
      const beamable = !e.r && !inTup.has(i) && e.b >= 8;
      const beat = Math.floor(start / beamUnit), endBeat = Math.floor((end - 1) / beamUnit);
      if (!beamable || beat !== endBeat) { flushRun(); return; }
      if (run.length && Math.floor(ps[run[0]].start / beamUnit) !== beat) flushRun();
      run.push(i);
    });
    flushRun();
    // where a beat's chord slots are divided, an invisible voice of "ghost" notes (one per slot) makes the
    // formatter leave room at every slot, even under a long melody note (as MuseScore does for chord symbols)
    let ghost = null, ghostStarts = [];
    if (meas.div && song.time.den * 4 <= 64) {
      const gnotes = [], gtups = [], den = song.time.den;
      for (let b = 0; b < meas.ch.length; b++) {
        const g = beatGrid(meas, b);
        if (g.n === 0) continue;
        const k0 = gnotes.length;
        const d = g.n === 1 ? den : g.n === 2 ? den * 2 : g.n === 4 ? den * 4 : g.span === 2 ? den : den * 2;
        for (let k = 0; k < g.n; k++) {
          const gn = new VF.GhostNote({ duration: DUR[d] });
          if (g.n > 1) gn.setWidth(GHOST_W);            // room for a chord symbol at every slot of a divided beat
          gnotes.push(gn); ghostStarts.push(Math.round((b + (k * g.span) / g.n) * TPB));
        }
        if (g.n === 3) gtups.push(new VF.Tuplet(gnotes.slice(k0), { num_notes: 3, notes_occupied: 2 }));
      }
      ghost = new VF.Voice({ num_beats: beats, beat_value: den }).setMode(VF.Voice.Mode.SOFT);
      ghost.addTickables(gnotes);
    }
    const voices = ghost ? [voice, ghost] : [voice];
    const fmt = new VF.Formatter().joinVoices(voices);
    let minW = 60;
    try { minW = fmt.preCalculateMinTotalWidth(voices); } catch (err) { /* keep default */ }
    staveNotes[m] = notes;
    return { notes, voice, ghost, ghostStarts, voices, beams, tuplets, ps, beats, fmt, need: Math.max(70, minW * 1.15 + 22) };
  });

  // ---- line breaking: as many bars as fit (at most barsPerLine full bars); the pickup joins line 1
  const cap = width - 12;
  const lines = [];
  let cur = [], used = 0;
  song.measures.forEach((_, m) => {
    const lead = (cur.length === 0 ? clefPad + keyPad : 0) + (lines.length === 0 && cur.length === 0 ? timePad : 0);
    const need = built[m].need + lead;
    const fullCount = cur.filter((x) => !(song.pickup && x === 0)).length;
    const isPickup = song.pickup && m === 0;
    if (cur.length && !isPickup && (fullCount >= per || (!opts.exact && used + need > cap))) { lines.push(cur); cur = []; used = 0; }   // exact: always `per` bars
    const lead2 = (cur.length === 0 ? clefPad + keyPad : 0) + (lines.length === 0 && cur.length === 0 ? timePad : 0);
    cur.push(m); used += built[m].need + lead2;
  });
  if (cur.length) lines.push(cur);

  const renderer = new VF.Renderer(el, VF.Renderer.Backends.SVG);
  const height = TOP + lines.length * LINE_H + 20;
  renderer.resize(width, height);
  const ctx = renderer.getContext();
  const svg = el.querySelector('svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', width * scale); svg.setAttribute('height', height * scale);
  svg.style.width = width * scale + 'px'; svg.style.height = height * scale + 'px';
  const layout = { measures: [], lines: [], width: width * scale, height: height * scale, scale };
  const typical = cap / per;

  // ---- pass 2: place and draw
  lines.forEach((ms, li) => {
    const y = TOP + li * LINE_H + STAFF_OFFSET - 40;
    const lead = clefPad + keyPad + (li === 0 ? timePad : 0);
    const needs = ms.map((m) => built[m].need);
    const sumNeed = needs.reduce((a, b) => a + b, 0);
    const fullCount = ms.filter((m) => !(song.pickup && m === 0)).length;
    const lastShort = li === lines.length - 1 && fullCount < per;
    // spare space goes to bars in proportion to what they need; a short last line keeps normal widths
    const room = cap - lead;
    const widths = lastShort ? needs.map((n) => Math.max(n, typical - (ms.length === 1 ? 0 : 0)))
      : needs.map((n) => (room * n) / sumNeed);
    let x = 6;
    layout.lines.push({ y: (TOP + li * LINE_H) * scale, h: LINE_H * scale, measures: ms });
    ms.forEach((m, k) => {
      const meas = song.measures[m], B = built[m];
      const w = widths[k] + (k === 0 ? lead : 0);
      const stave = new VF.Stave(x, y, w);
      if (k === 0) { stave.addClef('treble'); stave.addKeySignature(keyName); }
      if (li === 0 && k === 0) stave.addTimeSignature(`${song.time.num}/${song.time.den}`);
      const mk = song.marks[m] || {};
      if (mk.start) stave.setBegBarType(VF.Barline.type.REPEAT_BEGIN);
      if (mk.end) stave.setEndBarType(VF.Barline.type.REPEAT_END);
      else if (m === song.measures.length - 1) stave.setEndBarType(VF.Barline.type.END);
      stave.setContext(ctx).draw();
      const startX = stave.getNoteStartX();
      // endings and bar numbers are drawn here (not by VexFlow) so the chords view can hide them
      const top0 = stave.getYForLine(0);
      if (mk.ending) {
        const prev = song.marks[m - 1] || {}, next = song.marks[m + 1] || {};
        const startsHere = prev.ending !== mk.ending || k === 0, endsHere = next.ending !== mk.ending;
        const x0 = k === 0 ? Math.max(x, startX - 10) : x, x1 = x + w - 1, vy = top0 - 62, tick = 15;
        let d = `M${x0} ${vy}H${x1}`;
        if (startsHere) d += `M${x0} ${vy}V${vy + tick}`;
        if (endsHere) d += `M${x1} ${vy}V${vy + tick}`;
        svgPath(svg, d, 'vmk');
        if (startsHere) svgText(svg, x0 + 4, vy + 12, [[`${mk.ending}.`]], 'vmk vmk-t');
      }
      if (k === 0 && opts.barNumber) { const n = opts.barNumber(m); if (n !== '' && n !== undefined) svgText(svg, x - 4, top0 - 7, [[String(n)]], 'mnum'); }
      const avail = Math.max(30, stave.getNoteEndX() - startX - 10);
      B.fmt.format(B.voices, avail);
      B.voice.draw(ctx, stave);
      if (B.ghost) B.ghost.draw(ctx, stave);           // draws nothing; gives the ghost notes their x
      B.beams.forEach((b) => b.setContext(ctx).draw());
      B.tuplets.forEach((t) => t.setContext(ctx).draw());

      const topY = stave.getYForLine(0), botY = stave.getYForLine(4);
      const noteInfo = B.ps.map(({ start, end }, i) => {
        const n = B.notes[i];
        let nx; try { nx = n.getAbsoluteX(); } catch (err) { nx = startX; }
        let ny; try { ny = n.getYs()[0]; } catch (err) { ny = (topY + botY) / 2; }
        return { i, x: nx, y: ny, start, end };
      });
      // x of any point in the bar: from the notes (and ghost slots) around it
      const anchors = noteInfo.map((q) => ({ x: q.x, start: q.start }));
      if (B.ghost) B.ghost.getTickables().forEach((g, j) => { try { anchors.push({ x: g.getAbsoluteX(), start: B.ghostStarts[j] }); } catch (err) { /* skip */ } });
      anchors.sort((p1, p2) => p1.start - p2.start);
      const xAt = (tick) => {
        const exact = anchors.find((q) => Math.abs(q.start - tick) < 1);
        if (exact) return exact.x;
        let a = null, b = null;
        for (const q of anchors) { if (q.start <= tick) a = q; else if (!b) b = q; }
        const ax = a ? a.x : startX, at = a ? a.start : 0;
        const bx = b ? b.x : stave.getNoteEndX() - 6, bt = b ? b.start : meas.len;
        return ax + ((bx - ax) * (tick - at)) / Math.max(1, bt - at);
      };
      const beatX = Array.from({ length: B.beats }, (_, j) => xAt(j * TPB));
      const slots = slotList(meas);                     // chord slots (beats, or finer where a beat is divided)
      const S2 = (v) => v * scale;
      layout.measures[m] = {
        m, line: li, x: S2(x), w: S2(w), top: S2(topY), bottom: S2(botY), sysTop: S2(TOP + li * LINE_H), sysH: S2(LINE_H),
        startX: S2(startX), endX: S2(stave.getNoteEndX()),
        notes: noteInfo.map((q) => ({ ...q, x: S2(q.x), y: S2(q.y) })), beatX: beatX.map(S2),
        slots: slots.map((q) => ({ b: q.b, k: q.k, pos: q.pos, n: q.n, x: S2(xAt(q.pos * TPB)) })),
      };
      if (opts.chordsVisible !== false) {
        const cy = topY - 34;
        for (const q of slots) {
          if (!q.chord) continue;
          const el = q.chord.rep ? beatSlash(svg, xAt(q.pos * TPB) + 4, cy - 7) : svgText(svg, xAt(q.pos * TPB) - 2, cy, chordParts(q.chord), 'chord-sym');
          el.dataset.cell = q.k ? `${m}:${q.b}:${q.k}` : `${m}:${q.b}`;
        }
        // a repeat sign over the bar (half bar; two bars: over the bar line between them)
        const sim = ((song.marks || {})[m] || {}).sim;
        if (sim === 'bar' || sim === 'two') {
          const two = sim === 'two', end = stave.getNoteEndX();
          simSign(svg, two && k < ms.length - 1 ? x + w : (startX + end) / 2, cy - 7, two ? 'two' : 'one');
        }
      }
      x += w;
    });
  });

  // ties (across bar lines and systems too)
  const flat = [];
  song.measures.forEach((meas, m) => meas.ev.forEach((e, i) => flat.push({ m, i, e })));
  flat.forEach((f, k) => {
    if (!f.e.tie || f.e.r) return;
    const nx = flat[k + 1];
    if (!nx || nx.e.r) return;
    const a = staveNotes[f.m][f.i], b = staveNotes[nx.m][nx.i];
    const sameLine = layout.measures[f.m].line === layout.measures[nx.m].line;
    try {
      if (sameLine) new VF.StaveTie({ first_note: a, last_note: b, first_indices: [0], last_indices: [0] }).setContext(ctx).draw();
      else {
        new VF.StaveTie({ first_note: a, last_note: null, first_indices: [0], last_indices: [0] }).setContext(ctx).draw();
        // the continuation on the next line is short: a flatter curve, or it reads as an accent
        const t = new VF.StaveTie({ first_note: null, last_note: b, first_indices: [0], last_indices: [0] });
        Object.assign(t.render_options, { cp1: 4, cp2: 6 });
        t.setContext(ctx).draw();
      }
    } catch (err) { /* skip a tie VexFlow can't place */ }
  });
  return layout;
}

// find what was tapped: { m, i (event index) or -1, beat (nearest beat), above (in the chord row) }
export function hitTest(layout, x, y) {
  let best = null;
  for (const L of layout.measures) {
    if (!L) continue;
    if (y < L.sysTop || y > L.sysTop + L.sysH) continue;
    if (x < L.x || x > L.x + L.w) continue;
    best = L; break;
  }
  if (!best) return null;
  let i = -1, d = Infinity;
  best.notes.forEach((n) => { const dd = Math.abs(n.x + 5 - x); if (dd < d) { d = dd; i = n.i; } });
  let beat = 0, bd = Infinity;
  best.beatX.forEach((bx, j) => { const dd = Math.abs(bx - x); if (x >= bx - 12 && dd < bd) { bd = dd; beat = j; } });
  let slot = best.slots[0];
  for (const q of best.slots) if (x >= q.x - 8) slot = q;
  return { m: best.m, i, beat, slot, above: y < best.top - 14 };
}
