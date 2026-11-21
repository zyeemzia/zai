/* zai.zyeemzia.com: retires the old offline worker.  Copyright (c) ZyeemZia */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n.startsWith('zai-site-')).map(n => caches.delete(n))))
  .then(() => self.registration.unregister())));
