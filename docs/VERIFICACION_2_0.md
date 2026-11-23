# Mi Panel · Verificación para la versión 2.0

Documento operativo (23-11-2026). La app funciona en GitHub Pages con IndexedDB por navegador / app instalada y Google Drive cifrado opcional.

## Antes de probar cualquier actualización
1. En **cada dispositivo y contexto** (iPhone instalado, Safari y iPad pueden tener bases diferentes), abre Ajustes y anota el número de pendientes y de integrantes/visitas de Grupo.
2. Genera un respaldo cifrado y guárdalo fuera de Mi Panel; comprueba que el archivo existe y conserva su contraseña.
3. Confirma la fecha y hora de última sincronización de Drive. **No interpretes el punto verde como prueba de que ambos dispositivos tienen los mismos datos**.
4. No borres cookies/datos del sitio, caché manualmente ni desinstales la PWA.

## Matriz obligatoria

| Escenario | iPhone Safari/PWA | iPad Safari/PWA | PC | Evidencia |
|---|---|---|---|---|
| Abre en modo avión después de instalar con Internet | Pendiente | Pendiente | Pendiente | Captura / cronómetro |
| Conserva tareas, categorías, metas, integrantes y visitas tras actualizar | Pendiente | Pendiente | Pendiente | Conteos antes/después |
| Guarda, cierra y vuelve a abrir con IndexedDB | Pendiente | Pendiente | Pendiente | Tarea de prueba con ID |
| Captura rápida propone fecha y hora sin guardar sola | Pendiente | Pendiente | Pendiente | Formulario sin persistir |
| «+1 día» pide confirmación y guarda correctamente | Pendiente | Pendiente | Pendiente | Fecha anterior/nueva |
| Recurrencia 31 ene y 29 feb sin saltos | Pendiente | Pendiente | Pendiente | Prueba aislada |
| Drive sincroniza cifrado; si está desconectado no bloquea el panel | Pendiente | Pendiente | Pendiente | Estado y confirmación |
| Calendar OAuth solo al solicitarlo | Pendiente | Pendiente | Pendiente | Autorización explícita |
| En fallo simulado de lectura no permite sobrescribir datos | Pendiente | Pendiente | Pendiente | Pruebas automáticas / controladas |
| En iPad horizontal hay dos columnas; móvil una | N/A | Pendiente | Pendiente | Captura |
| Recuperación desde respaldo, con copia previa | Pendiente | Pendiente | Pendiente | Entorno de prueba, nunca único dispositivo |

## Criterios de aprobación para 2.0
- Acciones de GitHub para PR y Pages en verde.
- Ninguna incidencia crítica de borrado, duplicación inesperada, corrupción o arranque.
- Instalación y actualización probadas **en dispositivos reales**, no solo en Chromium.
- Copias cifradas verificables en cada dispositivo y recuperación ensayada en una base de pruebas.
- Contraseña no guardada en código ni compartida; permisos OAuth mínimos.
- Historial de versiones, guías y acciones de recuperación documentadas.
- Aprobación explícita de la comprobación final de dispositivos; no dar por completado este paso solo con CI.

## Si una versión no abre o da un error
1. Mantén el dispositivo tal cual. No desinstales y no borres datos de Safari.
2. Anota versión, dispositivo, navegador, si hay Internet, mensaje exacto y captura.
3. Comprueba desde GitHub el commit publicado y el resultado de Pages.
4. Si el problema viene del código, revierte el despliegue desde GitHub manteniendo IndexedDB intacto.
5. Restaura un respaldo **solo después de revisar conteos y confirmar la copia de protección**.

## Registro de aprobación
- Código / CI: pendiente para 2.0.
- iPhone: pendiente.
- iPad: pendiente.
- PC: pendiente.
- Restauración de prueba: pendiente.
- Publicación 2.0: **bloqueada** hasta cumplir todos los criterios.
