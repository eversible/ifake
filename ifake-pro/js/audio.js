// audio.js — Web Audio engine: built-in synths, packed-sample instruments, mixer, look-ahead sequencer.

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ---------- built-in synth voices (no loading, always available) ----------
export const SYNTHS = [
  { id: 'syn-ep', label: 'FM keys (synth)', group: 'Built-in synths' },
  { id: 'syn-organ', label: 'Organ (synth)', group: 'Built-in synths' },
  { id: 'syn-pad', label: 'Saw pad (synth)', group: 'Built-in synths' },
  { id: 'syn-pluck', label: 'Pluck (synth)', group: 'Built-in synths' },
  { id: 'syn-bell', label: 'Bell (synth)', group: 'Built-in synths' },
  { id: 'syn-bass', label: 'Synth bass', group: 'Built-in synths', bass: true },
];

function env(ctx, g, t, peak, attack, decayTo, decayTime, rel, end) {
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  if (decayTime > 0) g.gain.setTargetAtTime(peak * decayTo, t + attack, decayTime / 3);
  g.gain.cancelScheduledValues(end);
  g.gain.setTargetAtTime(0, end, rel / 4);
}

// a handle that lets a note be cut short: release() fades it (new audition), kill() also stops
// sources that haven't started yet (Stop button)
const handle = (g, sources, end) => ({
  end,
  release(t) {
    try { if (g.gain.cancelAndHoldAtTime) g.gain.cancelAndHoldAtTime(t); else g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(0, t, 0.03); } catch (e) { /* already stopped */ }
  },
  kill(t) {
    this.release(t);
    for (const s of sources) { try { s.stop(t + 0.08); } catch (e) { /* already stopped */ } }
  },
});

function synthNote(ctx, id, dest, midi, t, dur, vel) {
  const f = mtof(midi);
  const end = t + dur;
  const out = ctx.createGain();
  out.connect(dest);
  const sources = [];
  const h = handle(out, sources, end + 1.2);
  const stopAt = end + 1.2;
  const osc = (type, freq, detune = 0) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = detune; o.start(t); o.stop(stopAt); sources.push(o); return o; };
  if (id === 'syn-ep') {
    const car = osc('sine', f), modu = osc('sine', f), tine = osc('sine', f * 14);
    const mg = ctx.createGain(), tg = ctx.createGain();
    mg.gain.setValueAtTime(f * 2.2, t); mg.gain.setTargetAtTime(f * 0.25, t, 0.35);
    tg.gain.setValueAtTime(f * 1.2, t); tg.gain.setTargetAtTime(0, t, 0.03);
    modu.connect(mg).connect(car.frequency); tine.connect(tg).connect(car.frequency);
    car.connect(out);
    env(ctx, out, t, 0.32 * vel, 0.003, 0.0, 3.0, 0.25, end);
  } else if (id === 'syn-organ') {
    const real = new Float32Array([0, 1, 0.75, 0.5, 0.35, 0, 0.22, 0, 0.16]);
    const w = ctx.createPeriodicWave(real, new Float32Array(real.length));
    const o = ctx.createOscillator(); o.setPeriodicWave(w); o.frequency.value = f; o.start(t); o.stop(stopAt);
    sources.push(o); o.connect(out);
    env(ctx, out, t, 0.16 * vel, 0.006, 1, 0, 0.08, end);
  } else if (id === 'syn-pad') {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1600; lp.Q.value = 0.6;
    lp.connect(out);
    osc('sawtooth', f, -8).connect(lp); osc('sawtooth', f, 8).connect(lp);
    env(ctx, out, t, 0.11 * vel, 0.25, 1, 0, 0.7, end);
  } else if (id === 'syn-pluck') {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2;
    lp.frequency.setValueAtTime(5000, t); lp.frequency.setTargetAtTime(400, t, 0.12);
    osc('sawtooth', f).connect(lp); lp.connect(out);
    env(ctx, out, t, 0.2 * vel, 0.002, 0.0, 1.5, 0.15, end);
  } else if (id === 'syn-soft') {
    osc('sine', f).connect(out);
    env(ctx, out, t, 0.22 * vel, 0.004, 0.0, 2.2, 0.2, end);
  } else if (id === 'syn-bell') {
    const a = osc('sine', f), b = osc('sine', f * 2.76), bg = ctx.createGain();
    bg.gain.setValueAtTime(0.35, t); bg.gain.setTargetAtTime(0, t, 0.3);
    a.connect(out); b.connect(bg).connect(out);
    env(ctx, out, t, 0.26 * vel, 0.002, 0.0, 3.5, 0.4, end);
  } else { // syn-bass
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    osc('triangle', f).connect(lp); osc('sine', f).connect(lp); lp.connect(out);
    env(ctx, out, t, 0.45 * vel, 0.004, 0.5, 1.2, 0.08, end);
  }
  return h;
}

// ---------- engine ----------
export class AudioEngine {
  constructor(baseUrl = 'samples/') {
    this.base = baseUrl;
    this.ctx = null;
    this.samples = {};      // id -> { notes: [{midi, buffer, onset}] }
    this.loading = {};      // id -> Promise
    this.lastUsed = {};     // id -> time last played or loaded
    this.failed = {};       // id -> true if its samples couldn't be loaded
    this.index = [];        // sample instrument metadata
    this.volumes = { chord: 0.8, bass: 0.8, click: 0.5, melody: 0.9 };
    this.reverbAmount = 0.15;
  }

  ensureContext() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    const ctx = this.ctx;
    // a phone call or another app can interrupt the audio without the app being hidden: treat it like leaving
    ctx.onstatechange = () => { if (ctx.state === 'interrupted' && this.ctx === ctx) this._awayAt = performance.now(); if (this.onState) this.onState(); };
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -10; this.comp.ratio.value = 4;
    this.comp.connect(ctx.destination);
    this.master = ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(this.comp);
    this.reverb = ctx.createConvolver(); this.reverb.buffer = this._impulse(1.8);
    this.revGain = ctx.createGain(); this.revGain.gain.value = this.reverbAmount;
    this.reverb.connect(this.revGain).connect(this.master);
    this.buses = {};
    for (const b of ['chord', 'bass', 'click', 'melody']) {
      const g = ctx.createGain(); g.gain.value = this.volumes[b];
      g.connect(this.master);
      if (b !== 'click') g.connect(this.reverb);
      this.buses[b] = g;
    }
    return ctx;
  }

  // The app went to the background. iOS can leave an audio context stuck after that (silent, never resuming,
  // or running far behind — the sound comes late), so coming back starts a fresh one (on the way back, and
  // at the latest on the first tap); the loaded samples carry over.
  away() { if (this.ctx) this._awayAt = performance.now(); if (this.onState) this.onState(); }
  // back in the app: the fresh start waits for the first tap (one started outside a tap stays silent on iOS)
  back() { if (this.onState) this.onState(); }
  // the restart-sound button: a fresh audio context now (call from a tap)
  restart() { if (this.ctx) this._awayAt = performance.now(); this.unlock(); }
  // is the sound ready to play?
  get ok() { return !!this.ctx && this.ctx.state === 'running' && !this._awayAt; }
  _renew() {
    const old = this.ctx;
    if (this.onRenew) this.onRenew();                // the app stops playback first (its timing is on the old clock)
    this.ctx = null; this._unlocked = false;
    try { const p = old.close(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* already closed */ }
    this.ensureContext();
  }

  // Must be called from a user gesture on iOS.
  unlock() {
    if (this.ctx && (this._awayAt || this.ctx.state === 'closed')) this._renew();
    this._awayAt = 0;
    const ctx = this.ensureContext();
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* older Safari */ }
    if (ctx.state !== 'running') ctx.resume().then(() => this.onState && this.onState()).catch(() => {});
    if (!this._unlocked) {
      const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource();
      s.buffer = b; s.connect(ctx.destination); s.start(0);
      this._unlocked = true;
    }
  }

  setVolume(bus, v) { this.volumes[bus] = v; if (this.buses) this.buses[bus].gain.setTargetAtTime(v, this.ctx.currentTime, 0.02); }
  setReverb(v) { this.reverbAmount = v; if (this.revGain) this.revGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }

  _impulse(seconds) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return buf;
  }

  async loadIndex() {
    try { this.index = await (await fetch(this.base + 'index.json')).json(); } catch (e) { this.index = []; }
    return this.index;
  }

  isLoaded(id) { return id.startsWith('syn-') || !!this.samples[id]; }

  load(id) {
    if (id.startsWith('syn-') || this.samples[id]) return Promise.resolve();
    if (this.loading[id]) return this.loading[id];
    const ctx = this.ensureContext();
    this.loading[id] = (async () => {
      // samples/<id>.json = { notes: [[midi, base64 mp3], ...] }
      const res = await fetch(`${this.base}${id}.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const pack = await res.json();
      const notes = await Promise.all(pack.notes.map(async ([midi, b64]) => {
        const bin = atob(b64), bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const buffer = await new Promise((res2, rej) => ctx.decodeAudioData(bytes.buffer, res2, rej));
        return { midi, buffer, onset: findOnset(buffer) };
      }));
      this.samples[id] = { notes: notes.sort((a, b) => a.midi - b.midi) };
      this.lastUsed[id] = performance.now();
    })().catch((e) => { delete this.loading[id]; this.failed[id] = true; throw e; });
    return this.loading[id];
  }

  // play one note; falls back to a built-in synth while a sample set is still loading
  note(inst, midi, t, dur, vel = 0.8, bus = 'chord') {
    const ctx = this.ensureContext();
    const dest = this.buses[bus];
    const set = this.samples[inst];
    if (!set) {
      if (inst.startsWith('syn-')) return synthNote(ctx, inst, dest, midi, t, dur, vel);
      if (this.failed[inst]) return synthNote(ctx, bus === 'bass' ? 'syn-bass' : 'syn-soft', dest, midi, t, dur, vel);
      this.load(inst).catch(() => {});
      return null;                               // still loading: stay silent rather than play a stand-in
    }
    let best = set.notes[0];
    for (const n of set.notes) if (Math.abs(n.midi - midi) < Math.abs(best.midi - midi)) best = n;
    const src = ctx.createBufferSource();
    src.buffer = best.buffer;
    src.playbackRate.value = Math.pow(2, (midi - best.midi) / 12);
    const g = ctx.createGain();
    const peak = (bus === 'bass' ? 0.9 : bus === 'melody' ? 0.75 : 0.55) * vel;
    g.gain.setValueAtTime(peak, t);
    g.gain.setTargetAtTime(0, t + dur, 0.06);
    src.connect(g).connect(dest);
    src.start(t, best.onset);
    src.stop(t + dur + 0.5);
    this.lastUsed[inst] = performance.now();
    return handle(g, [src], t + dur + 0.5);
  }

  // Free decoded instruments we no longer need (each costs 10–20 MB of memory once decoded).
  trim(keep, max = 3) {
    const loaded = Object.keys(this.samples).filter((id) => !keep.includes(id))
      .sort((a, b) => (this.lastUsed[b] || 0) - (this.lastUsed[a] || 0));
    const room = Math.max(0, max - keep.filter((id) => this.samples[id]).length);
    for (const id of loaded.slice(room)) { delete this.samples[id]; delete this.loading[id]; }
  }

  click(t, accent) {
    const ctx = this.ensureContext();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = accent ? 2000 : 1300;
    g.gain.setValueAtTime(accent ? 0.5 : 0.32, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    o.connect(g).connect(this.buses.click);
    o.start(t); o.stop(t + 0.05);
  }
}

// skip the encoder padding / silence before the attack, so notes speak immediately
function findOnset(buffer) {
  const d = buffer.getChannelData(0);
  const lim = Math.min(d.length, Math.floor(buffer.sampleRate * 0.2));
  for (let i = 0; i < lim; i++) if (Math.abs(d[i]) > 0.004) return Math.max(0, i - 32) / buffer.sampleRate;
  return 0;
}

// ---------- patterns ----------
// A pattern is called once per 16th step with a context and returns note events
// { midi, dur (beats), vel, bus } that start on that step.
export const COMP_PATTERNS = [
  { id: 'block', label: 'Block (each bar)' },
  { id: 'beats', label: 'Every beat' },
  { id: 'charleston', label: 'Charleston' },
  { id: 'arp-up', label: 'Arpeggio up (8ths)' },
  { id: 'arp-updown', label: 'Arpeggio up/down (8ths)' },
  { id: 'stride', label: 'Stride (bass 1 & 3, chord 2 & 4)' },
  { id: 'once', label: 'Once per chord' },
];
export const BASS_PATTERNS = [
  { id: 'off', label: 'Off' },
  { id: 'root', label: 'Root, held' },
  { id: 'two', label: 'Two-feel (root, 5th)' },
  { id: 'walk', label: 'Walking' },
];

function compEvents(p, x) {
  const { step, beatInSeg, segLen, beatInBar, segStart, barStart, v } = x;
  const notes = x.withBass ? [v.bass, ...v.upper] : v.upper;
  const strike = (dur, vel = 0.8, list = notes) => list.map((m) => ({ midi: m, dur, vel, bus: 'chord' }));
  const remain = segLen - beatInSeg;
  const onBeat = step === 0;
  switch (p) {
    case 'once':
      return segStart && onBeat ? strike(segLen) : [];
    case 'block':
      return onBeat && (segStart || barStart) ? strike(Math.min(remain, x.beatsPerBar - beatInBar)) : [];
    case 'beats':
      return onBeat ? strike(0.9, beatInBar === 0 ? 0.85 : 0.7) : [];
    case 'charleston': {
      if (onBeat && (segStart || beatInBar === 0)) return strike(0.7, 0.85);
      if (step === 2 && beatInBar === 1 && remain > 0.5) return strike(Math.min(1.5, remain - 0.5), 0.75);
      return [];
    }
    case 'arp-up':
    case 'arp-updown': {
      if (step % 2 || !notes.length) return [];
      const seq = p === 'arp-up' ? notes : notes.concat(notes.slice(1, -1).reverse());
      const k = Math.round(beatInSeg * 2 + step / 2);
      return [{ midi: seq[k % seq.length], dur: 0.9, vel: 0.72, bus: 'chord' }];
    }
    case 'stride': {
      if (!onBeat) return [];
      if (beatInBar % 2 === 0) return [{ midi: v.bass, dur: 0.9, vel: 0.85, bus: 'chord' }];
      return strike(0.8, 0.7, v.upper);
    }
  }
  return [];
}

function bassEvents(p, x) {
  const { step, beatInSeg, segLen, beatInBar, segStart, barStart } = x;
  if (p === 'off' || step !== 0) return [];
  const remain = segLen - beatInSeg;
  const ev = (midi, dur, vel = 0.85) => [{ midi, dur, vel, bus: 'bass' }];
  const bass = x.bassMidi;              // lowest note: the slash bass if there is one, else the root
  const root = x.rootBass;              // the chord root in the bass register, for building chord tones
  if (p === 'root') return segStart || barStart ? ev(bass, Math.min(remain, x.beatsPerBar - beatInBar) - 0.05) : [];
  if (p === 'two') {
    if (segStart || beatInBar === 0) return ev(bass, Math.min(2, remain) - 0.05);
    if (beatInBar === 2) { const f = root + 7; return ev(f > 55 ? f - 12 : f, Math.min(2, remain) - 0.05); }
    return [];
  }
  // walking: bass note on the chord's first beat, chord tones in between, chromatic approach into the next chord
  if (segStart) return ev(bass, 0.95);
  const prev = x.state.lastBass ?? bass;
  if (remain === 1 && x.nextBassMidi != null) {
    const tgt = x.nextBassMidi;
    return ev(prev > tgt ? tgt + 1 : tgt - 1, 0.95);
  }
  const tones = x.toneSemis.filter((s) => s % 12 !== 0).map((s) => s % 12);
  const pick = tones[(beatInSeg - 1) % Math.max(1, tones.length)] ?? 7;
  let m = root + pick;
  if (Math.abs(m - 12 - prev) < Math.abs(m - prev) && m - 12 >= 28) m -= 12;
  return ev(m, 0.95);
}

// ---------- sequencer ----------
// Plays an "order": a list of chart cells (one per beat) — repeats already unrolled.
// timeline(): { beatsPerBar, cells: [{ seg }], segs: [{ start, end, chord, v, bassMidi, rootBass, toneSemis }] }
export class Sequencer {
  constructor(engine, getTimeline, getSettings, onBeat) {
    this.engine = engine; this.getTimeline = getTimeline; this.getSettings = getSettings; this.onBeat = onBeat;
    this.playing = false; this.timer = null; this.queue = []; this.voices = []; this.pending = null; this.range = null;
  }

  // range: { order: [cell], loop, meta }; fromIndex: where in the order to begin
  start(range, fromIndex = 0, opts = {}) {
    const ctx = this.engine.ensureContext();
    this.stop();
    const s = this.getSettings();
    this.range = range;
    this.pending = null;
    this.beat = fromIndex >= 0 && fromIndex < range.order.length ? fromIndex : 0;
    this.countIn = opts.countIn === false ? 0 : (s.countIn || 0) * this.getTimeline().beatsPerBar;   // count-in beats still to click
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.06;
    this.state = { lastBass: null };
    this.playing = true;
    this.timer = setInterval(() => this._tick(), 20);
    this._tick();
  }

  currentCell() { return this.range ? this.range.order[Math.min(this.beat, this.range.order.length - 1)] : -1; }

  // Change what is playing. Widening around the current cell (e.g. back to the whole song) carries on
  // in place; anything else switches at the next bar line.
  setRange(next) {
    if (!this.playing) return;
    const cur = this.range.order, nxt = next.order;
    if (cur.length === nxt.length && cur.every((c, k) => c === nxt[k])) { this.range.loop = next.loop; this.range.meta = next.meta; this.pending = null; return; }
    const here = this.currentCell();
    const nset = new Set(nxt);
    const widening = this.countIn <= 0 && cur.every((c) => nset.has(c));
    const at = nxt.indexOf(here);
    if (widening && at >= 0) { this.range = next; this.beat = at; this.pending = null; }
    else this.pending = next;
  }

  stop() {
    this.playing = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.queue = [];
    this.pending = null;
    if (this.engine.ctx) { const now = this.engine.ctx.currentTime; for (const v of this.voices) if (v) v.kill(now); }
    this.voices = [];
    if (this.onBeat) this.onBeat(null);
  }

  _tick() {
    if (!this.playing) return;
    const ctx = this.engine.ctx;
    while (this.playing && this.nextTime < ctx.currentTime - 0.02) this._advance();   // skip steps missed in a stall
    const ahead = ctx.currentTime + 0.12;
    while (this.playing && this.nextTime < ahead) this._scheduleStep();
    const now = ctx.currentTime;
    if (this.voices.length > 64) this.voices = this.voices.filter((v) => v && v.end > now);
  }

  _beatDur() { return 60 / this.getSettings().tempo; }

  _advance() {
    this.step++;
    this.nextTime += this._beatDur() / 4;
    if (this.step === 4) { this.step = 0; if (this.countIn > 0) this.countIn--; else this.beat++; }
    if (this.countIn > 0) return;
    if (this.step === 0 && this.beat >= this.range.order.length) {
      if (this.range.loop || this.pending) this.beat = 0;
      else this._finish();
    }
  }

  _finish() {
    const endAt = this.nextTime;
    this.playing = false; clearInterval(this.timer); this.timer = null;
    setTimeout(() => this.onBeat && this.onBeat(null), Math.max(0, (endAt - this.engine.ctx.currentTime) * 1000));
  }

  // segment boundaries follow the play order: a chord "starts" where the previous beat was a different
  // chord or a jump (repeat, loop wrap), and lasts while beats stay consecutive in the same chord
  // (a beat whose chord changes part-way through, see tl.mid, joins the next beat by the chord it ends on)
  _segInfo(tl, k) {
    const order = this.range.order, n = order.length;
    const seg = (j) => (tl.cells[order[j]] ? tl.cells[order[j]].seg : -1);
    const endSeg = (j) => { const c = tl.cells[order[j]]; return c ? (c.endSeg ?? c.seg) : -1; };
    const joined = (j) => j > 0 && order[j] === order[j - 1] + 1 && seg(j) === endSeg(j - 1);
    let a = k; while (a > 0 && joined(a) && k - a < 64) a--;
    let b = k + 1; while (b < n && joined(b) && b - k < 64) b++;
    let next = null;
    if (b < n) next = order[b];
    else if (this.range.loop || this.pending) next = (this.pending || this.range).order[0];
    return { beatInSeg: k - a, segLen: b - a, nextCell: next };
  }

  _scheduleStep() {
    const s = this.getSettings(), tl = this.getTimeline();
    const beatDur = 60 / s.tempo, stepDur = beatDur / 4;
    const bib = tl.beatInBar || ((c) => c % tl.beatsPerBar);   // beat within its bar
    if (this.step === 0 && this.countIn <= 0 && this.pending) {
      const cell = this.range.order[this.beat];
      if (this.beat === 0 || bib(cell) === 0) {             // switch at a bar line
        this.range = this.pending; this.pending = null; this.beat = 0; this.state.lastBass = null;
      }
    }
    const t = this.nextTime;
    const beatStart = t - this.step * stepDur;
    // swing moves the off-beat eighth later (and sixteenths with it); triplets and other tuplets stay put
    const sw = (s.swing || 0) / 6;
    const swingAt = (frac) => {
      if (!sw || Math.abs(frac * 16 - Math.round(frac * 16)) > 1e-6) return frac;
      return frac < 0.5 ? frac * (0.5 + sw) / 0.5 : 0.5 + sw + (frac - 0.5) * (0.5 - sw) / 0.5;
    };
    const when = beatStart + swingAt(this.step / 4) * beatDur;

    if (this.countIn > 0) {                         // count-in clicks
      if (this.step === 0) this.engine.click(when, this.countIn % tl.beatsPerBar === 0);
    } else {
      const cell = this.range.order[this.beat];
      const mid = tl.mid && tl.mid[cell];
      if (this.step === 0) {
        if (this.onBeat) this.queue.push({ time: when, cell, idx: this.beat });
        if (s.click) this.engine.click(when, bib(cell) === 0);
        // extra parts (e.g. a melody) schedule whatever starts during this beat
        if (this.onCell) for (const v of this.onCell(cell, beatStart, beatDur, swingAt) || []) this.voices.push(v);
      }
      const segIdx = tl.cells[cell] ? tl.cells[cell].seg : -1;
      const seg = segIdx >= 0 ? tl.segs[segIdx] : null;
      // once the chord has changed inside this beat, the pattern rests until the next beat
      const cut = mid && this.step > 0 && this.step / 4 >= mid[0].off - 1e-9;
      if (seg && seg.v && !cut) {
        const info = this._segInfo(tl, this.beat);
        const nseg = info.nextCell != null && tl.cells[info.nextCell] ? tl.segs[tl.cells[info.nextCell].seg] : null;
        const x = {
          step: this.step, beatInSeg: info.beatInSeg, segLen: info.segLen, beatInBar: bib(cell),
          segStart: info.beatInSeg === 0, barStart: bib(cell) === 0, beatsPerBar: tl.beatsPerBar,
          v: seg.v, withBass: s.bassPattern === 'off', bassMidi: seg.bassMidi, rootBass: seg.rootBass ?? seg.bassMidi,
          toneSemis: seg.toneSemis, nextBassMidi: nseg && nseg.v ? nseg.bassMidi : null, state: this.state,
        };
        const evs = compEvents(s.compPattern, x).concat(bassEvents(s.bassPattern, x));
        for (const e of evs) {
          const inst = e.bus === 'bass' ? s.bassInst : s.chordInst;
          const h = this.engine.note(inst, e.midi, when, e.dur * beatDur, e.vel, e.bus);
          if (h) h.bus = e.bus;
          this.voices.push(h);
          if (e.bus === 'bass') this.state.lastBass = e.midi;
        }
      }
      if (mid && this.step === 0) this._midChanges(tl, s, mid, beatStart, beatDur, swingAt);
    }
    this._advance();
  }

  // chords that start part-way through a beat (off = fraction of the beat, any value incl. triplets):
  // cut what is sounding, then strike the new chord (and its bass) at that exact time
  _midChanges(tl, s, mid, beatStart, beatDur, swingAt) {
    const order = this.range.order;
    mid.forEach((c, i) => {
      const t = beatStart + swingAt(c.off) * beatDur;
      for (const v of this.voices) if (v && (v.bus === 'chord' || v.bus === 'bass') && v.end > t) v.release(t);
      const seg = tl.segs[c.seg];
      if (!seg || !seg.v) return;
      // it sounds until the next change: later in this beat, or on through the beats that keep this chord
      let hold;
      if (i + 1 < mid.length) hold = mid[i + 1].off - c.off;
      else {
        hold = 1 - c.off;
        for (let j = this.beat + 1; j < order.length && order[j] === order[j - 1] + 1 && hold < 8; j++) {
          const info = tl.cells[order[j]];
          if (!info || info.seg !== c.seg) break;
          const nm = tl.mid && tl.mid[order[j]];
          if (nm) { hold += nm[0].off; break; }
          hold += 1;
        }
      }
      const withBass = s.bassPattern === 'off';
      const notes = withBass ? [seg.v.bass, ...seg.v.upper] : seg.v.upper;
      if (s.compPattern !== 'none') {
        for (const m of notes) { const h = this.engine.note(s.chordInst, m, t, hold * beatDur * 0.95, 0.78, 'chord'); if (h) h.bus = 'chord'; this.voices.push(h); }
      }
      if (!withBass) {
        const h = this.engine.note(s.bassInst, seg.bassMidi, t, Math.min(hold, 2) * beatDur * 0.95, 0.85, 'bass');
        if (h) h.bus = 'bass';
        this.voices.push(h);
        this.state.lastBass = seg.bassMidi;
      }
    });
  }

  // called from requestAnimationFrame: returns the cell currently heard (allowing for output delay)
  poll() {
    const ctx = this.engine.ctx;
    if (!ctx) return undefined;
    const now = ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0);
    let cur;
    while (this.queue.length && this.queue[0].time <= now) cur = this.queue.shift();
    return cur;
  }
}
