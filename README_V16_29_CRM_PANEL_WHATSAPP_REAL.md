ChatFlow360 V16.29 - CRM Panel WhatsApp real

Cambios:
- Frontend: el panel Conversaciones ya no muestra leads/localStorage/demo en la sección WhatsApp.
- Frontend: carga conversaciones reales desde backend /api/chats por empresa_id.
- Frontend: fallback Supabase directo mantiene select(*) para no perder media/payload.
- Frontend: renderiza imágenes/archivos si vienen en payload/media_url/archivo_url.
- Backend: /api/chats devuelve mensajes, cabeceras de conversaciones y leads reales por empresa_id.

No se cambia Evolution API, Railway ni variables de entorno.
No se cambia diseño completo del dashboard.
No hay SQL obligatorio nuevo.
