# Mi Panel · Organizador personal PWA

Aplicación **personal, local-first** para tareas, responsabilidades, asignaciones y agenda. Se publica desde GitHub Pages, sin base de datos ni servidor propio.

## Funciones de esta primera versión

- Vista «Mi semana», tareas, prioridades, seguimiento, historial y funciones congregacionales separadas.
- Formulario para escribir de forma natural: sugiere categoría, fecha y recurrencia; tú confirmas.
- Reconocimiento de texto de capturas en el dispositivo mediante Tesseract.js (la primera carga requiere conexión).
- Revisión semanal a partir de lo que hayas registrado.
- Conexión opcional a Google Calendar: consulta de eventos relevantes y creación de eventos **únicamente tras confirmar**.
- Datos locales en IndexedDB. Funciona sin conexión después de cargar la PWA.
- Exportación cifrada AES-GCM/PBKDF2 y restauración completa con copia de protección previa.

## Publicación en GitHub Pages

1. Ve al repositorio: **Settings → Pages**.
2. En **Build and deployment → Source**, selecciona **GitHub Actions**.
3. El flujo `Publicar Mi Panel` se ejecuta al incorporar cambios en `main`, o manualmente desde **Actions**.
4. La dirección prevista es **https://misters-cat.github.io/mi-panel/** una vez que Pages publique correctamente.

La rama `desarrollo` se utiliza para preparar y comprobar cambios, y `main` para la versión pública.

## Google Calendar (configuración opcional)

La conexión necesita un **OAuth Client ID** creado en Google Cloud Console:

1. Crear o seleccionar proyecto de Google Cloud.
2. Habilitar **Google Calendar API**.
3. Configurar la pantalla de consentimiento OAuth para uso personal y usuario de prueba cuando corresponda.
4. Crear credencial OAuth de tipo **Aplicación web** y registrar el **origen JavaScript autorizado** `https://misters-cat.github.io`.
5. Abrir **Mi Panel → Ajustes**, pegar el **Client ID** y conectar Google.

> Nunca subas al repositorio un secreto de cliente, token de acceso ni información personal. El Client ID de OAuth es público por diseño y se almacena solo en el navegador. Los tokens se mantienen en memoria durante la sesión.

## Datos y respaldos

Tus tareas no se suben a GitHub: cada dispositivo guarda una copia independiente. Para pasar del iPhone al computador, exporta un respaldo cifrado y después impórtalo en el otro dispositivo. **La restauración reemplaza todos los datos locales**, por lo que la app solicita una copia de protección antes.

Los datos locales pueden perderse al borrar los datos del navegador o desinstalar la PWA. Guarda los respaldos en iCloud Drive u otro sitio seguro y conserva la contraseña.

## Limitaciones honestas

- GitHub Pages es un sitio público: esta web no dispone de autenticación privada del servidor.
- No hay sincronización automática de tareas entre dispositivos.
- No se envían notificaciones push con la app cerrada; se pueden usar recordatorios de Google Calendar.
- OCR puede cometer errores, requiere revisión y necesita descargar el motor la primera vez.
- Google puede pedir autorización nuevamente al expirar el token; sin OAuth configurado, funciona la agenda local.
- No se deben guardar datos pastorales confidenciales ni información sensible de terceras personas.

## Desarrollo

Sin proceso de compilación: HTML, CSS y JavaScript nativos. La rama de desarrollo incluye comprobaciones automatizadas de sintaxis y del manifiesto PWA.

© Mi Panel — uso personal.

## Activar publicación después de habilitar Pages

Tras seleccionar **Settings → Pages → Source: GitHub Actions**, inicia manualmente **Actions → Publicar Mi Panel → Run workflow → main**. El archivo `.github/workflows/pages.yml` también publica con cada nuevo cambio en `main`.
