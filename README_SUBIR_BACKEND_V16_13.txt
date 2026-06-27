ChatFlow360 Backend V16.13 - Conversaciones Evolution + Pausa Humana

Qué corrige:
- Guarda mensajes entrantes y salientes en conversacion_mensajes.
- Actualiza conversaciones.ultimo_mensaje.
- Evita crear una conversación nueva por cada mensaje.
- Si el negocio responde desde el celular (fromMe=true), pausa la IA para esa clienta.
- Comandos: /ia on reactiva IA, /ia off pausa IA.

Subida:
1. Descomprime este ZIP.
2. Sube/reemplaza todos los archivos en GitHub del backend gousa-backend.
3. Commit changes en main.
4. Espera Deployment successful en Railway.
5. Escribe un nuevo mensaje al WhatsApp conectado.
6. Revisa Supabase: conversaciones y conversacion_mensajes.
