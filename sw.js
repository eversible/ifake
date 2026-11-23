// iFake used to live at this address. This worker only removes the old registration here;
// the apps now have their own workers in ifake/ and ifake-pro/.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.registration.unregister()));
