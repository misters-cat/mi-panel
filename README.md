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

Sin proceso de compilación: HTML, CSS y JavaScript nativos. La rama de desarrollo incluye pruebas automatizadas de Guardar, sintaxis, y del manifiesto PWA.

© Mi Panel — uso personal.

## Activar publicación después de habilitar Pages

Tras seleccionar **Settings → Pages → Source: GitHub Actions**, inicia manualmente **Actions → Publicar Mi Panel → Run workflow → main**. El archivo `.github/workflows/pages.yml` también publica con cada nuevo cambio en `main`.


## Categorías editables y GRANDES METAS

En **Pendientes → Editar categorías** o **Ajustes → Mis categorías** puedes agregar categorías nuevas, cambiar su nombre, descripción y emoji. La categoría **GRANDES METAS 🎯** se crea automáticamente al abrir esta versión. Las categorías usan IDs estables: renombrarlas no pierde las tareas. El módulo de Congregación conserva sus tres funciones aunque se cambie su nombre. Solo se pueden eliminar categorías personalizadas sin tareas asociadas.

El botón **Guardar** espera la confirmación de escritura en IndexedDB antes de notificar éxito. Las pruebas automatizadas verifican el guardado de una tarea, el de una categoría y la respuesta cuando falla el almacenamiento.

## Sincronizar entre iPhone y computador con Google Drive

La sincronización es **opcional, cifrada, local-first y sin Supabase**. Mi Panel usa [Google Drive appDataFolder](https://developers.google.com/workspace/drive/api/guides/appdata) con el permiso acotado `https://www.googleapis.com/auth/drive.appdata`.

### Configuración inicial (en Google Cloud Console)

1. Abre [Google Cloud Console](https://console.cloud.google.com/) y elige o crea un proyecto.
2. Habilita **Google Drive API**. También puedes habilitar **Google Calendar API** si quieres integrar el calendario.
3. Configura Google Auth Platform / pantalla de consentimiento OAuth. Si tu aplicación está en modo de pruebas, añade tu cuenta como **usuario de prueba**.
4. Crea un **Cliente OAuth 2.0 de tipo Aplicación web**, con **origen JavaScript autorizado** `https://misters-cat.github.io`. No necesitas URL de redirección para la modalidad de tokens del navegador.
5. El **Client ID** web de Mi Panel ya está preconfigurado; puedes consultarlo o cambiarlo en **Ajustes → Cuenta Google**. Es público por diseño; nunca publiques el Client Secret.
6. **Antes de conectar**, exporta un respaldo cifrado reciente desde cada dispositivo (**Ajustes → Respaldo cifrado**). En **Ajustes → Sincronización Google Drive**, establece una **clave de cifrado de 12 caracteres o más**, autoriza el permiso Drive y sincroniza.
7. Haz lo mismo en el iPhone y el computador, usando **la misma cuenta de Google, el mismo Client ID y exactamente la misma clave de cifrado**.

El contenido se cifra localmente con PBKDF2-SHA-256 y AES-GCM (Web Crypto). Los tokens OAuth y la clave no se incorporan al repositorio ni a respaldos JSON; viven en memoria durante la sesión. Cada dispositivo guarda un archivo cifrado diferente en appDataFolder. Al sincronizar, lee los archivos disponibles, combina categorías y tareas por ID y fecha de actualización, y marca posibles conflictos con copias de revisión para evitar descartarlos silenciosamente. Los cambios se guardan primero en IndexedDB.

**Limitaciones importantes:** es sincronización al iniciar la conexión, al guardar cambios, al volver a estar en línea y periódicamente **mientras Mi Panel esté abierto y autorizado**. No existe una sesión perpetua ni sincronización en segundo plano con la app cerrada desde GitHub Pages. Si expira OAuth o reinicias el navegador, deberás volver a autorizar Google e introducir la clave. Los relojes y ediciones simultáneas pueden ocasionar conflictos: revisa cualquier tarea marcada ⚠️. Google Drive API y OAuth ya están preparados en Google Cloud, pero falta probar la autorización y la sincronización real en ambos dispositivos antes de considerarlas validadas. Conserva los respaldos cifrados manuales como protección independiente.

No pierdas la clave: **no podemos recuperarla**. Una clave equivocada impide leer los archivos existentes y no se sobrescriben si fallan al descifrarse. Evita crear archivos cifrados con otra clave en la misma cuenta sin exportar un respaldo.

## Historial de versiones en la aplicación

En **Ajustes → Historial de versiones** se muestra la versión actual y un desplegable con las versiones anteriores. Los cambios de la integración OAuth preparada como v1.2.3 se publican junto a este apartado en **v1.2.4** (9 de noviembre de 2026). El historial sólo describe versiones comprobables a partir de las etapas del repositorio.

## v1.2.5 · Mensaje de descifrado en iPhone
Si Google Drive contiene un archivo cifrado con una clave diferente (o dañado), la app detiene la sincronización antes de modificar datos locales o archivos de Drive. El mensaje indica revisar la misma clave usada en el computador y deja la conexión lista para volver a autorizar. El campo de contraseña permite mostrar/ocultar para verificar que Safari no haya introducido mayúsculas o espacios inesperados. **No se guarda la clave en el dispositivo**; persistirla requeriría aceptar un riesgo adicional de seguridad.


## v1.2.6 · Sincronización automática sin clave compartida
Mi Panel utiliza exclusivamente GitHub Pages y el permiso `drive.appdata` para guardar una copia en el espacio privado de la aplicación de tu Google Drive. **La nueva copia no tiene cifrado con contraseña adicional**: su protección depende de la cuenta Google, su autorización OAuth y los controles de Google Drive. Autoriza Google en cada dispositivo; la app sincroniza al conectar, guardar, volver a estar en línea, hacerse visible y periódicamente mientras sigue abierta y autorizada. Los tokens temporales no se guardan; al expirar o reiniciar el navegador puede necesitarse una nueva autorización, y no hay actualización con la PWA cerrada.

La sincronización nueva usa archivos `mi-panel-sync-v2-*` y nunca abre, modifica ni elimina los antiguos `mi-panel-sync-v1-*` cifrados. Antes de la primera combinación se crea una copia local de protección en IndexedDB de ese dispositivo. En Ajustes → Seguridad y recuperación puede recuperarse, previa confirmación. Los respaldos manuales opcionales siguen cifrados.

Si hay datos importantes **sólo dentro de los archivos cifrados antiguos** y no en ningún dispositivo, no aparecerán automáticamente en v2; deben recuperarse por separado con su clave original. Los cambios simultáneos pueden generar copias ⚠️ para revisar. No guardes datos confidenciales de terceros.


## v1.2.7 · Actualización manual complementaria
En **Ajustes → Sincronización automática** aparece **Actualizar ahora** cuando la cuenta Google está conectada. Permite traer los cambios del iPhone o PC inmediatamente sin esperar al siguiente ciclo y muestra el estado de sincronización y su fecha y hora. Sigue funcionando la sincronización automática al guardar cambios, recuperar internet, volver a la aplicación y durante su uso. Si caduca OAuth, primero debe reconectarse la cuenta; el botón no renueva los permisos ni almacena tokens. No se modifican los formatos de archivos existentes ni los datos locales al actualizar la versión.


## v1.2.8 · Sincronización visible desde Mi semana
En la pantalla principal, debajo del encabezado, hay una barra compacta con el estado de Google Drive, fecha y hora de última sincronización y un botón **Actualizar ahora**. Si la sesión está desconectada, el mismo lugar muestra **Conectar Google**. No cambia el flujo de sincronización automática ni almacena credenciales. El acceso más detallado sigue en Ajustes.
