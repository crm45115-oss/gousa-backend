# ChatFlow360 V16.40 - American Style AI Strict Guard

Trabajado sobre V16.38 sin cambiar arquitectura ni borrar tablas.

Cambios principales:
- Pausa real de IA cuando el asesor toma el chat desde panel: backend respeta `asesor_tomo_desde_panel` y no se reactiva solo.
- Si no existe cabecera de conversación, el backend la crea antes de pausar IA para que no quede solo visual.
- Clasificador local estricto antes de llamar a IA para American Style / Live Fardo:
  1. IA pausada / asesor humano.
  2. Comprobante real por imagen/PDF.
  3. Pregunta sobre QR.
  4. Delivery / ubicación.
  5. Envío a departamento/provincia.
  6. Recojo.
  7. No logró sacar captura.
  8. Captura de prenda/live.
  9. Link del live.
  10. Saludo inicial.
  11. Duda general.
- “Al mismo QR?”, “A cuál QR?” y “Qué QR?” ya no marcan comprobante ni reenvían QR.
- “Ya pagué” sin archivo pide comprobante; no dice comprobante recibido.
- PDF tipo `Comprobante-xxxx.pdf`, recibo, pago, transferencia, banco, QR o Yape se trata como comprobante PDF probable.
- Imagen con caption/señales de Yape, transferencia, banco, Bs, transacción o pago exitoso se trata como comprobante.
- Imagen de prenda/live se registra como captura de prenda.
- Imagen dudosa pregunta si es prenda o comprobante.
- Panel WhatsApp evita repintar si los datos no cambiaron; mantiene chat seleccionado.
- Mensaje manual desde PC solo aparece como enviado si el backend lo envió; si falla se muestra como fallido, no como burbuja verde.

SQL:
- No hay cambios destructivos ni obligatorios sobre V16.27/V16.28.
- Se incluye SQL_V16_40_AMERICAN_STYLE_AI_STRICT_GUARD.sql solo como control de versión.

Subir:
- Backend ZIP a Railway.
- Frontend ZIP a Netlify.
- Reiniciar Railway después de subir backend.
