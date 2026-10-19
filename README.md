# BIO-GENOS — órdenes de servicio digitales (app de choferes)

App independiente de Bio-centralis para los operativos: ven sus órdenes del día, llegan, firman (cliente y operador) y cierran
con ubicación y hora del teléfono. Funciona sin señal para cargar y cerrar órdenes: lo cerrado se guarda en el teléfono y se envía solo.

Usa el mismo proyecto de Supabase que Bio-centralis (misma base de datos y mismas reglas de seguridad), pero tiene su propia
dirección, su propio acceso y no incluye nada de Bio-centralis.

## Archivos
- `index.html` — toda la app
- `supabase.js` — cliente de Supabase v2.110.0 (copia local para que funcione sin señal)
- `sw.js` — service worker (abrir la app sin conexión)
- `manifest.webmanifest` + `icon-*.png` — instalación en la pantalla de inicio

## Publicar
1. Crea un repositorio nuevo (por ejemplo `bio-genos`) con estos archivos en la raíz.
2. En GitHub: Settings → Pages → Deploy from a branch → `main` / root.
3. La app queda en `https://<usuario>.github.io/bio-genos/`.

Al cambiar archivos de la app, sube también el número de versión en `sw.js` (`VERSION`) para que los teléfonos descarguen lo nuevo.
