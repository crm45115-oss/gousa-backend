# ChatFlow360 Backend V16.16 - Fix Pausa Humana

Base usada: backend V16.15.2 Fernando Web PRO Promo sobre V16.13.

Este fix corrige el problema donde Evolution devolvía los mensajes enviados por la IA como `fromMe=true` y el backend creía que era el dueño tomando control manual. Eso pausaba la IA después del primer mensaje.

## Qué corrige

- Ignora los ecos de mensajes enviados por la IA.
- No pausa la IA por sus propios mensajes salientes.
- Solo pausa la IA cuando el dueño escribe manualmente desde el celular.
- Mantiene comandos `/ia on` y `/ia off`.
- Auto-reactiva conversaciones pausadas por el bug anterior cuando el cliente vuelve a escribir.
- Mantiene Fernando Web PRO + promo 1500 Bs + 1 mes gratis IA WhatsApp.
- Mantiene QR Evolution, conversaciones y pausa humana real.

## Cómo subir

1. Subir estos archivos al GitHub del backend `gousa-backend`.
2. Commit changes.
3. Esperar Railway: Deployment successful.
4. Probar con un cliente que escriba de nuevo.

No tocar Evolution, Netlify, Supabase ni variables Railway.
