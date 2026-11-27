// Offline cache for the GitHub Pages build (not used inside claude.ai).
// tools/stamp.py fills in BUILD, CORE, SAMPLES_BUILD and SAMPLE_DEFAULTS; run it before every push.
const APP = 'leadsheet';
const BUILD = '7dee20a6b2';
const CORE = [ "./", "index.html", "css/app.css?v=b7e8873bfc", "js/app.js?v=fec7d4a56c", "js/audio.js?v=2b981af6cc", "js/chords.js?v=5fb7131653", "js/demo.js?v=ed6d17c3be", "js/form.js?v=8150dd6c2c", "js/grid.js?v=42e483ade6", "js/melody.js?v=1ba4a73c6a", "js/recognise.js?v=8ff75abed6", "js/score.js?v=24760c899c", "js/song.js?v=78723c8483", "js/store.js?v=4769d0f668", "js/voicing.js?v=e6563af0b1", "lib/vexflow.js?v=139e0c4686", "manifest.webmanifest", "samples/index.json", "icons/icon-180.png", "icons/icon-192.png" ];
const SAMPLES_BUILD = '4b4116234b';
const SAMPLE_DEFAULTS = ["samples/piano.json", "samples/upbass.json"];
const CODE = APP + '-code-' + BUILD, SAMPLES = APP + '-samples-' + SAMPLES_BUILD;

// install: this build's files, fetched fresh (not from the browser's 10-minute cache), plus the default
// instruments, so the app plays offline after its very first visit
self.addEventListener('install', (e) => e.waitUntil(Promise.all([
  caches.open(CODE).then((c) => c.addAll(CORE.map((u) => new Request(u, { cache: 'reload' })))),
  caches.open(SAMPLES).then((c) => Promise.all(SAMPLE_DEFAULTS.map((u) => c.match(u).then((hit) => hit || c.add(u)).catch(() => {})))),
]).then(() => self.skipWaiting())));
// a new build drops the old code cache; instruments are kept until the sample set itself changes
self.addEventListener('activate', (e) => e.waitUntil(caches.keys()
  .then((ks) => Promise.all(ks.filter((k) => k.startsWith(APP + '-') && k !== CODE && k !== SAMPLES).map((k) => caches.delete(k))))
  .then(() => self.clients.claim())));

const keep = (name, req, r) => { if (r.ok && !r.redirected) { const copy = r.clone(); caches.open(name).then((c) => c.put(req, copy)); } return r; };
const cacheFirst = (name, req) => caches.match(req).then((hit) => hit || fetch(req).then((r) => keep(name, req, r)));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.includes('/samples/') && !url.pathname.endsWith('index.json')) {
    e.respondWith(cacheFirst(SAMPLES, req));            // instrument samples (a new sample set gets a new cache)
  } else if (url.searchParams.has('v')) {
    e.respondWith(cacheFirst(CODE, req));               // a stamped URL's contents never change
  } else {
    // the page and other unstamped files: ask the server every time (so updates show at once), cache only offline
    e.respondWith(fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
      .then((r) => (r.redirected ? Response.redirect(r.url, 302) : keep(CODE, req, r)))
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))));
  }
});
