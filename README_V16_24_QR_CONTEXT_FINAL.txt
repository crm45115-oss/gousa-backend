ChatFlow360 BACKEND V16.24 QR CONTEXT FINAL

Cambios:
- QR se responde con regla local antes de llamar a la IA.
- Lee QR desde empresa_admin_config.qr_pago_url y respaldo live_fardo_config.qr_imagen_url.
- Si la clienta pide QR o confirma "sí", manda QR sin volver a saludar.
- Si llega imagen sola, guarda y no responde automáticamente.
- Si menciona comprobante, responde una sola vez y deja revisión humana.
- Mantiene fix fromMe: no pausa IA por eco/saludos automáticos.
- Log de arranque: ChatFlow360 Backend V16.24 QR_CONTEXT_FINAL.

Pasos:
1) Ejecutar SQL_V16_24_QR_CONTEXT_FINAL.sql en Supabase.
2) Subir backend a Railway y redeploy.
3) Subir frontend a Netlify/hosting.
4) En Formas de pago, subir QR otra vez para que se sincronice con empresa_admin_config.qr_pago_url.
5) Probar: "Pásame QR".
