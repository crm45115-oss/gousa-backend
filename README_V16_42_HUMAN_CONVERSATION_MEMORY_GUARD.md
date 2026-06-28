# ChatFlow360 V16.42 - Human Conversation Memory Guard

Versión enfocada en que la IA de American Style responda como asesora coherente de WhatsApp:

- No se sale del papel de tienda de ropa / TikTok Live.
- No cambia identidad ni nombre de asistente.
- No habla de RRHH, trabajo online, registros, comisiones, Walmart, MercadoLibre ni temas externos.
- Si la clienta pregunta por API, Meta, prompt o configuración, responde como asistente de tienda y vuelve al flujo.
- Agrega debounce humano: espera configurable antes de responder para juntar mensajes seguidos.
- Continúa el hilo según estado de conversación.
- Respeta prioridad: pausa humana, comprobantes, QR, delivery, departamento, recojo, captura, live, saludo inicial y duda general.
- Mantiene bloqueo contra “pago confirmado”, “pedido confirmado” o “QR confirmado” desde IA.

## Variables nuevas opcionales

```env
AI_REPLY_DELAY_MS=9000
AI_REPLY_DELAY_JITTER_MS=4000
```

Con esos valores la IA espera entre 9 y 13 segundos antes de responder texto de American Style. Las imágenes/PDF se atienden de inmediato para no retrasar comprobantes o capturas.

## Archivos modificados

- `src/processor.js`
  - Motor conversacional específico para American Style.
  - Debounce por conversación.
  - Agrupación de mensajes recientes del cliente.
  - Respuestas de identidad fija.
  - Manejo de objeciones/no interés/spam.

- `src/ai.js`
  - Prompt reforzado para rol fijo.
  - Hard guard contra respuestas fuera de rubro.
  - Bloqueo de confirmaciones automáticas de pago/pedido.

- `src/env.js` y `.env.example`
  - Variables opcionales de delay humano.

## Pruebas esperadas

- “Una consulta ocupas la api de meta?”
  - Responde que es asistente virtual de American Style y vuelve a prendas/Live, sin explicar tecnología.

- “No me interesa su producto”
  - Respeta decisión, no insiste y marca la conversación para no seguir.

- “Al final sos Denise o Mariana?”
  - No cambia nombre. Responde como asistente virtual de American Style.

- “Hoy puede enviármelo mis prendas”
  - Clasifica delivery.

- “Al mismo QR?”
  - Confirma que puede pagar al mismo QR, sin marcar comprobante.

- Imagen/PDF comprobante
  - Responde recibido para verificación, nunca confirmado.

## SQL

No requiere SQL nuevo si ya está aplicada la base V16.27/V16.28/V16.40.
