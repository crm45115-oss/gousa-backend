# ChatFlow360 V16.33 - Tomar chat sin refresh automático

Corrección segura:
- Agrega endpoint `POST /api/chats/take` para pausar/reactivar IA desde el panel.
- Al tomar chat, guarda `ia_pausada=true` en `conversaciones`.
- Al devolver IA, guarda `ia_pausada=false`.
- El frontend bloquea temporalmente el refresh para no repintar ni perder selección.
- Polling de chats pasa a 20 segundos y no corre durante acciones manuales.

No toca Redis, Evolution, QR ni estructura principal.
