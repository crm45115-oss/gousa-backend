ChatFlow360 BACKEND V16.22 - QR Live/Fardo fix

Correcciones:
- El backend ya no busca solo empresa_admin_config.qr_pago_url.
- Ahora busca QR en este orden:
  1) iaConfig.qr_imagen_url / qr_pago_url
  2) live_fardo_config.qr_imagen_url
  3) empresa_admin_config.qr_imagen_url / qr_pago_url / qr_pago_img
- Cuando la clienta escribe QR, pago, pagar, transferencia, reservar, mío, case, me anotas, lo quiero o quiero esa, el backend intenta enviar imagen QR por Evolution.
- Si no hay QR configurado, guarda log claro: QR no configurado en live_fardo_config.qr_imagen_url.

Importante:
- El QR debe estar como URL pública o base64 válido.
- Después de correr el SQL, guarda la URL pública del QR en:
  live_fardo_config.qr_imagen_url
  para la empresa American Style.

No toca Evolution, QR asistido de conexión, Railway variables ni credenciales.
