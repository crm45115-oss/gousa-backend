ChatFlow360 BACKEND V16.15 FINAL

Base usada: backend V16.13 Conversaciones + Pausa Humana que subiste.

Solo agrega/corrige:
1. Limpieza de respuesta JSON para que WhatsApp no envíe { "respuesta": ... }.
2. Plantilla/rubro negocio_digital / Fernando Web.
3. Prompt para páginas web, WordPress, hosting, correos, IA WhatsApp, API, QR asistido, dashboards y ChatFlow 360.

No toca Evolution, variables, QR, pausas humanas, conversaciones ni estructura general.

Pasos:
1. Subir estos archivos al repositorio del backend gousa-backend.
2. Commit changes.
3. Esperar Railway Deployment successful.
4. Probar WhatsApp.

Supabase:
Ejecutar SQL_PATCH_V16_15_SOLO_NEGOCIO_DIGITAL.sql si todavía no existe Fernando Web / negocio_digital.
