// Offline cache for the GitHub Pages build (not used inside claude.ai).
// tools/stamp.py fills in BUILD and CORE; run it before every push.
const APP = 'chordpad';
const BUILD = 'afe787c635';
const CORE = [ "./", "index.html", "css/app.css?v=9a8c076e7c", "js/app.js?v=6928fbf3bd", "js/audio.js?v=e46c49cd69", "js/chords.js?v=5fb7131653", "js/form.js?v=8150dd6c2c", "js/store.js?v=4769d0f668", "js/voicing.js?v=e6563af0b1", "manifest.webmanifest", "samples/index.json", "icons/icon-180.png", "icons/icon-192.png" ];
const CODE = APP + '-code-' + BUILD, SAMPLES = APP + '-samples';

self.addEventListener('install', (e) => e.waitUntil(caches.open(CODE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())));
// a new build drops the old code cache; downloaded instruments are kept
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
    e.respondWith(cacheFirst(SAMPLES, req));            // instrument samples never change
  } else if (url.searchParams.has('v')) {
    e.respondWith(cacheFirst(CODE, req));               // a stamped URL's contents never change
  } else {
    // the page and other unstamped files: ask the server every time (so updates show at once), cache only offline
    e.respondWith(fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
      .then((r) => (r.redirected ? Response.redirect(r.url, 302) : keep(CODE, req, r)))
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))));
  }
});
