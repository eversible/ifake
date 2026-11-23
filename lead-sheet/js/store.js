// store.js — saves the chart library: instantly to this browser, and (when hosted on claude.ai)
// to a private per-person database so charts survive a cleared browser and sync between devices.
//
// Library data: { version, currentId, charts: [{ id, title, cpl, bpb, cells, updatedAt }],
//                 deleted: { id: time }, settings, settingsAt, updatedAt }
// Copies are merged chart by chart (newest edit wins per chart; deletions are remembered),
// so an edit made on one device or tab is never overwritten by an older copy from another.
let KEY = 'chordpad.v1';

export function mergeLibraries(a, b) {
  if (!a) return b;
  if (!b) return a;
  const deleted = { ...(b.deleted || {}) };
  for (const [id, t] of Object.entries(a.deleted || {})) deleted[id] = Math.max(t, deleted[id] || 0);
  const byId = new Map();
  for (const c of [...(b.charts || []), ...(a.charts || [])]) {
    const cur = byId.get(c.id);
    if (!cur || (c.updatedAt || 0) >= (cur.updatedAt || 0)) byId.set(c.id, c);
  }
  // keep a's order first (the local list), then anything only b has
  const order = [...(a.charts || []).map((c) => c.id), ...(b.charts || []).map((c) => c.id)];
  const charts = [...new Set(order)].map((id) => byId.get(id)).filter((c) => !(deleted[c.id] >= (c.updatedAt || 0)));
  const newerSettings = (b.settingsAt || 0) > (a.settingsAt || 0) ? b : a;
  return {
    version: 1,
    currentId: charts.some((c) => c.id === a.currentId) ? a.currentId : (charts[0] && charts[0].id),
    charts, deleted,
    settings: newerSettings.settings, settingsAt: newerSettings.settingsAt || 0,
    updatedAt: Math.max(a.updatedAt || 0, b.updatedAt || 0),
  };
}

const sameCharts = (a, b) => JSON.stringify((a && a.charts) || []) === JSON.stringify((b && b.charts) || [])
  && JSON.stringify((a && a.settings) || {}) === JSON.stringify((b && b.settings) || {});

export class Store {
  constructor(onExternal, key) {
    if (key) KEY = key;               // each app keeps its own library
    this.onExternal = onExternal;  // called with merged data when another device or tab changed something
    this.remote = null;
    this.remoteReady = false;
    this.timer = null;
    this.writing = false;
    this.dirty = false;
    this.localOk = true;
    this.status = 'local';         // 'local' | 'synced' | 'syncing' | 'unsaved' | 'sync failed'
    this.getLatest = () => null;
  }

  loadLocal() {
    try { const s = localStorage.getItem(KEY); this.localOk = true; return s ? JSON.parse(s) : null; }
    catch (e) { this.localOk = false; this._updateStatus(); return null; }
  }

  save(data) {
    data.updatedAt = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(data)); this.localOk = true; }
    catch (e) { this.localOk = false; }
    this.dirty = true;
    if (this.remoteReady) { clearTimeout(this.timer); this.timer = setTimeout(() => this._flush(), 1200); }
    this._updateStatus();
    return this.localOk;
  }

  // push immediately (page is being hidden or closed)
  flushNow() { if (this.remoteReady && this.dirty) { clearTimeout(this.timer); this._flush(); } }

  _updateStatus() {
    if (this.remoteReady) this.status = this.status === 'sync failed' ? 'sync failed' : (this.dirty ? 'syncing' : 'synced');
    else this.status = this.localOk ? 'local' : 'unsaved';
  }

  async _flush() {
    if (this.writing || !this.remote || !this.dirty) return;
    this.writing = true; this.dirty = false;
    const data = this.getLatest();
    try {
      await this.remote.set({ json: JSON.stringify(data), updatedAt: data.updatedAt || Date.now() });
      this.status = 'synced';
    } catch (e) { this.status = 'sync failed'; this.dirty = true; }
    this.writing = false;
    if (this.dirty && this.status !== 'sync failed') this._flush();
    this._updateStatus();
  }

  // Changes made in another tab of this browser
  watchTabs() {
    try {
      window.addEventListener('storage', (e) => {
        if (e.key !== KEY || !e.newValue) return;
        let other; try { other = JSON.parse(e.newValue); } catch (err) { return; }
        const mine = this.getLatest();
        const merged = mergeLibraries(mine, other);
        if (!sameCharts(merged, mine)) this.onExternal(merged);
      });
    } catch (e) { /* no storage events */ }
  }

  // Optional cloud sync; silently does nothing outside claude.ai.
  async connectRemote(getLatest) {
    this.getLatest = getLatest;
    try {
      if (!window.claude || typeof window.claude.use !== 'function') return;
      const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
      if (!db || !user) return;
      const id = await user.id();
      const doc = db.collection('data/users/' + id).doc('library');
      const snap = await Promise.race([doc.get(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000))]);
      const raw = snap && (typeof snap.data === 'function' ? snap.data() : snap);
      const remoteData = raw && raw.json ? JSON.parse(raw.json) : null;
      // merge with what's on screen NOW (not the copy loaded at startup), so edits made while loading survive
      const mine = getLatest();
      const merged = mergeLibraries(mine, remoteData);
      if (remoteData && !sameCharts(merged, mine)) this.onExternal(merged);
      this.remote = doc;
      this.remoteReady = true;
      this.dirty = true;               // push the merged library (includes anything only this device had)
      this._flush();
    } catch (e) {
      this.remote = null; this.remoteReady = false;
    }
    this._updateStatus();
  }
}
