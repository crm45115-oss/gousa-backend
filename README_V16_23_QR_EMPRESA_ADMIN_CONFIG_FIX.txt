V16.23 QR EMPRESA_ADMIN_CONFIG FIX

Cambio principal:
- El backend ahora lee el QR primero desde empresa_admin_config.qr_pago_url.
- Mantiene respaldo con live_fardo_config.qr_imagen_url.
- Usa select('*') para no fallar si una columna no existe.

Importante:
- Si qr_pago_url está NULL, no se puede enviar imagen.
- El frontend debe guardar la URL pública del QR en empresa_admin_config.qr_pago_url.
