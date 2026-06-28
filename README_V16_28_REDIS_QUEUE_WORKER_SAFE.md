# ChatFlow360 V16.28 - Redis Queue + Worker SAFE

Esta versión agrega una cola Redis/BullMQ para que el webhook responda rápido y la IA procese mensajes aparte.

## Qué cambia

- Agrega `src/messageQueue.js`.
- Agrega dependencias `bullmq` e `ioredis`.
- `/webhook` y `/webhook/evolution` ahora intentan encolar el payload.
- Si Redis no está configurado o falla, el backend procesa en modo anterior inline para no romper producción.
- Agrega `/api/queue/status` para ver estado de la cola.
- No toca Evolution API, QR ni credenciales.
- No crea tablas de cola en Supabase.

## Variables nuevas en Railway

```env
REDIS_URL=
QUEUE_ENABLED=true
QUEUE_NAME=chatflow360_messages
QUEUE_CONCURRENCY=1
QUEUE_REMOVE_ON_COMPLETE=1000
QUEUE_REMOVE_ON_FAIL=5000
MESSAGE_RETRY_LIMIT=3
MESSAGE_RETRY_DELAY_MS=5000
```

## Recomendación inicial

Empieza con:

```env
QUEUE_CONCURRENCY=1
```

Eso mantiene el orden de los mensajes mientras pruebas. Cuando esté estable puedes subir a 3 o 5.

## Cómo probar

1. Sube backend a Railway.
2. Configura `REDIS_URL`.
3. Reinicia backend.
4. Abre `/health` y verifica `queue_enabled: true`.
5. Abre `/api/queue/status` con `x-dashboard-api-key` si usas `DASHBOARD_API_KEY`.
6. Envía WhatsApp.
7. Logs esperados:
   - `[EVOLUTION_WEBHOOK_QUEUED]`
   - `[QUEUE_EVOLUTION_PROCESSED]`

Si Redis falla, verás fallback:

- `[EVOLUTION_WEBHOOK_QUEUE_FALLBACK_INLINE]`

Eso significa que no se cae el sistema y procesa como antes.
