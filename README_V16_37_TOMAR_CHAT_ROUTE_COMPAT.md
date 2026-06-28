# ChatFlow360 V16.37 - Tomar chat route compat

Corrige el error del panel: `Tomé el chat solo en pantalla, pero no se pudo pausar la IA en backend: Ruta no encontrada`.

Cambios:
- Mantiene `POST /api/chats/take`.
- Agrega rutas compatibles: `/api/chats/control`, `/api/chats/pause`, `/api/dashboard/chats/take`, `/api/whatsapp/chats/take`.
- No cambia base de datos.
- No toca frontend, Redis ni Supabase.

Subir este backend a Railway y reiniciar.
