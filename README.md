# BIO-GENOS

Manifiestos de recolección de residuos digitales de BioAmbientalistik.

- **Chofer:** solo ve sus manifiestos, los firma (cliente y operador), registra ubicación y hora, y comparte el comprobante en PDF. Funciona sin señal para cargar y cerrar.
- **Gerente:** panel con cumplimiento en vivo, generación de manifiestos desde la sábana de rutas, rutas y paradas, asignación de chofer/unidad/ayudantes, personal (cuentas con contraseña temporal), unidades y clientes.
- **Mantenimiento (v2.1):** el chofer hace el checklist de su unidad (obligatorio, no bloquea la ruta), reporta incidentes con foto y nivel Defcon (5 observación … 1 unidad detenida) y confirma de enterado; ve cuánto falta para su preventivo. El gerente recibe los incidentes en vivo, programa el mantenimiento, sube la evidencia de la reparación, administra los preventivos (por fecha, km y horas; lavado y engrasado mensual), revisa los checklists del día y edita los puntos del checklist.

Base de datos: Supabase `csjvexyodhoirjimjwrb` (mismas tablas que Bio-centralis; el acceso lo limita RLS).
Publicación: GitHub Pages, rama `main`, carpeta raíz. Al cambiar archivos, sube la versión en `sw.js` para que los teléfonos se actualicen.
