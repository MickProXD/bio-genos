/* BIO-GENOS — service worker: deja abrir la app sin señal.
   Solo guarda los archivos propios de la app. Nunca toca las llamadas a Supabase (datos, sesión, firmas). */
const VERSION = 'bio-genos-v2.1.2';
const ARCHIVOS = ['./', 'index.html', 'supabase.js', 'jspdf.umd.min.js', 'gerente.js', 'mantenimiento.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;       // Supabase y todo lo externo: directo a la red
  // Primero la red (para recibir actualizaciones); si no hay señal, lo guardado.
  e.respondWith(
    fetch(req).then(res => {
      if (res && res.ok){ const copia = res.clone(); caches.open(VERSION).then(c => c.put(req, copia)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch:true }).then(r => r || (req.mode === 'navigate' ? caches.match('index.html') : undefined)))
  );
});
