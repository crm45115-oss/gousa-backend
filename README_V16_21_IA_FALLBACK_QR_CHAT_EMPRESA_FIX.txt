ChatFlow 360 V16.21 - IA fallback + QR + Chat por empresa

Cambios principales:
- Backend ya no depende solo de Gemini.
- Orden de IA: GROQ_API_KEY -> OPENROUTER_API_KEY -> GEMINI_API_KEY -> reglas locales.
- Si Gemini no tiene cuota, el sistema sigue respondiendo con Groq/OpenRouter o reglas locales.
- Si el cliente pide QR/pago/reserva/mío/case, las reglas locales activan enviar_qr aunque la IA externa falle.
- Historial de conversación ahora filtra por empresa_id para evitar mezcla entre empresas.
- Panel de conversaciones ahora intenta leer primero desde /api/chats del backend con service role, y si falla usa Supabase directo.
- Se mantiene Evolution, QR asistido, Railway y Supabase sin cambios destructivos.

Variables Railway recomendadas:
GROQ_API_KEY=...
OPENROUTER_API_KEY=...
GEMINI_API_KEY=...
AI_PROVIDER=auto

Opcionales:
GROQ_MODEL=llama-3.1-8b-instant
OPENROUTER_MODEL=meta-llama/llama-3.1-8b-instruct:free

No borra tablas ni credenciales.
