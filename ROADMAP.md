# Mi Panel · Roadmap 1.6.3 → 2.0

Estado base: versión 1.6.2 en `main`. Última actualización del plan: 23-11-2026.

## Principios que no se negocian
- **Local primero:** renderizar desde IndexedDB y archivos PWA previamente descargados, sin esperar Google.
- **No perder datos:** nunca limpiar IndexedDB, borrar registros existentes, reemplazar datos en caso de error de lectura o usar un formato de migración destructivo.
- **Copias y reversibilidad:** respaldos cifrados antes de restauraciones; copia local de protección antes de fusiones remotas; posibilidad de volver al código anterior sin borrar datos.
- **Sin secretos en GitHub:** solo identificadores OAuth públicos; los tokens y las claves no se almacenan en el repositorio.
- **Mantener GitHub Pages:** sin introducir Supabase ni backend obligatorio, y no depender de servicios externos para abrir la PWA.
- **Privacidad:** evitar guardar información confidencial de terceros en Grupo; no registrar datos personales en logs.
- **Lanzamiento gradual:** rama por versión, PR, pruebas automatizadas, revisión de datos, publicación solo después de aprobarlas.

## 1.6.3 · Resiliencia y recuperación
**Implementación técnica**
- Tratar una lectura fallida de IndexedDB como error bloqueante y ofrecer reintento sin mostrar un panel vacío como si fuera una cuenta nueva.
- Bloquear guardados y sincronización cuando no se ha confirmado una lectura local válida.
- Mejorar la recuperación de un respaldo si falla el guardado: restaurar el estado en memoria anterior, sin falsa confirmación.
- Mostrar guardado local y estado real de sincronización: pendiente, sin conexión o fecha del último éxito. Un timestamp anterior no es prueba de estar sincronizado.
- Advertir sobre respaldo manual no reciente (sugerencia, no borrado).
- Confirmar consistencia de recursos offline; mantener el acceso a Calendar/Drive opcional.

**Pruebas obligatorias**: fallo de IndexedDB, persistencia normal y tras recarga, restauración fallida con rollback, funcionalidad offline y seguridad cifrado Drive.
**Estado**: integrada en `main` mediante PR #22 (23-11-2026).

## 1.7.0 · Mi día y captura rápida
- Agrupar «Atrasados», «Hoy» y «Próximos siete días»; mostrar hasta tres prioridades.
- Acciones rápidas: terminar, aplazar con confirmación y abrir edición.
- Entrada natural «Reunión miércoles 19:00» mediante sugerencias locales; confirmar siempre antes de guardar.
- Mejorar rendimiento de listas; no consultar Calendar durante la primera pintura.
- Accesibilidad de navegación por teclado y etiquetas.
**Pruebas obligatorias**: crear, completar, aplazar, fecha y hora local sin duplicados; respuesta en iPhone simulada.
**Despliegue**: integrada a `main` mediante PR #23 (23-11-2026).

## 1.8.0 · Rutinas y recordatorios
- Recurrencias semanal, mensual y anual idempotentes; evitar tareas duplicadas al abrir en varios dispositivos.
- Reprogramación responsable: conserva completados/historial; validación de meses cortos y zona horaria.
- Avisos dentro de la app y prioridades semanales; sin prometer push con la app cerrada.
- Filtros rápidos por área, fecha, completado y en espera.
**Pruebas obligatorias**: cruces de mes/año, sincronización concurrente, modo avión.
**Despliegue**: integrada a `main` mediante PR #24 (23-11-2026).

## 1.9.0 · Organización e iPad
- Vista de Congregación con cuatro funciones y seguimiento, sin alterar categorías o asignaciones existentes.
- Grupo: última visita, orden cronológico, filtros y privacidad con datos mínimos.
- Grandes Metas: avance por etapas y próximos pasos.
- Diseño adaptable de 2 columnas en iPad y escritorio; iPhone mantiene navegación compacta.
**Pruebas obligatorias**: integridad de visitas y eliminaciones, cambios en iPhone y PC, accesibilidad.
**Despliegue**: integrada a `main` mediante PR #25 (23-11-2026).

## 2.0.0 · Calidad y lanzamiento
- Suite de regresión para todas las funciones anteriores.
- Pruebas reales iPhone/iPad/Safari, PC/Chromium, con/sin Internet, actualización entre versiones, instalación y recuperación.
- Auditoría de OAuth, permisos mínimos, cifrado y sincronización multipestaña/multidispositivo.
- Guía de usuario para respaldo y restauración.
- Publicación de producción solo tras verificación de datos reales por el usuario en ambos dispositivos.
**Despliegue**: NO PUBLICADA. Requiere pruebas reales en iPhone/iPad/PC y respaldo previo; seguimiento en [issue #26](https://github.com/misters-cat/mi-panel/issues/26). Ver [matriz de validación](docs/VERIFICACION_2_0.md).

## Puertas de lanzamiento de cada etapa
1. Crear nueva rama desde `main` estable; no borrar ramas históricas.
2. Corregir/implementar con pruebas unitarias, integración y navegador.
3. Abrir PR sin cambios directos en `main`; las comprobaciones de GitHub Actions deben estar verdes.
4. Comparar la operación con archivos `mi-panel-db` de prueba existentes (tareas, categorías, grupo y visitas), incluyendo errores simulados.
5. Hacer merge; confirmar despliegue Pages y verificar manualmente en un dispositivo con un respaldo cifrado reciente.
6. Si hay falla, revertir solo código, **nunca borrar datos locales**.

## Alcance de la verificación
Las pruebas automáticas certifican comportamiento del código con datos simulados. No es posible asegurar la conservación de datos reales de iPhone/iPad/PC sin comprobar esos dispositivos. No borrar datos de Safari, no desinstalar la PWA y no restaurar copias antiguas sin confirmación y respaldo.
