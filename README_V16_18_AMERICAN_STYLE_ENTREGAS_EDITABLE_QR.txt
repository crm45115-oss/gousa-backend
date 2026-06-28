V16.18 - American Style entregas editables + QR fijo

Cambios seguros:
- No se toca Evolution, QR asistido, variables Railway ni credenciales.
- Se mantiene fix de pausa humana/AI echo.
- Se refuerza limpieza para que WhatsApp nunca muestre { "respuesta": ... }.
- Cada admin puede configurar redes, prompt, QR de pago y reglas.
- American Style usa reglas editables para:
  * Recojo Plaza El Trompillo lunes 4-5 pm.
  * Yango desde Plaza El Trompillo solo lunes.
  * Delivery normal martes a viernes.
  * Envíos a departamento/provincia con 5 Bs de despacho a transportadora.
  * Punto Rosa para clientas que no recogieron.
- La IA no dice reglas de entrega en el primer mensaje; responde solo cuando preguntan.
- La IA marca tipo_entrega para separar en admin/backend.
- Si piden QR, intenta enviar el QR fijo configurado y pide comprobante sin confirmar pago.

Instalación:
1) Ejecutar SQL_V16_18_AMERICAN_STYLE_ENTREGAS_EDITABLE_QR.sql en Supabase.
2) Subir backend a Railway.
3) Subir frontend a Netlify.
4) Entrar como admin, Configuración del negocio, subir QR y guardar.
5) En IA Live Fardo editar reglas de entrega y guardar.
