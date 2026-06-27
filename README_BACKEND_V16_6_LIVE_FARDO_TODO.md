
# Backend TODO V16.6 Live Fardo

Pendiente para Railway:

1. Detectar empresa por `phone_number_id`.
2. Leer `empresas.rubro`.
3. Si rubro = `venta_live_fardo`:
   - Leer `live_fardo_config`.
   - Si entra texto "vengo del live", pedir captura y nombre si falta.
   - Si entra imagen/captura, guardar en `live_capturas_prendas`.
   - Calcular hash/perceptual hash para detectar repetidos.
   - Crear `live_apartados`.
   - Antes de enviar QR llamar `live_puede_enviar_qr` / `live_registrar_qr_enviado`.
   - Si captura repetida, responder mensaje_captura_repetida y marcar `revision_humana`.
   - Si mandan comprobante, responder mensaje_comprobante y crear `live_comprobantes_pago`.
   - Si piden delivery/envío/recojo, guardar datos_entrega y tipo_entrega.

No implementar campañas masivas sin templates Meta aprobados y opt-in.
