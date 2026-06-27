CHATFLOW 360 - BACKEND V16.11 QR EVOLUTION ONLY

ESTE ZIP ES SOLO PARA EL SERVICIO gousa-backend EN RAILWAY.
No se sube a Netlify.
No se pega en Supabase.

PASOS:
1. Descomprime este ZIP.
2. En Railway entra al servicio gousa-backend.
3. Usa Add files via upload o conecta GitHub.
4. Sube TODO el contenido de esta carpeta como raíz del backend:
   - package.json
   - server.js
   - railway.json
   - carpeta src
5. Revisa variables:
   WHATSAPP_PROVIDER=evolution
   EVOLUTION_API_URL=https://evolution-api-production-8ed7.up.railway.app
   EVOLUTION_API_KEY=TU_CLAVE_EVOLUTION
   PUBLIC_BASE_URL=https://gousa-backend-production.up.railway.app
   CORS_ORIGIN=*
6. Espera Deployment successful.
7. Abre:
   https://gousa-backend-production.up.railway.app/health
   Debe mostrar whatsapp_provider=evolution y evolution_ready=true.
8. Vuelve al dashboard y toca Generar QR real.

IMPORTANTE:
Si después sale error de columna en Supabase, ejecuta SQL_V16_11_QR_ASISTIDO_EVOLUTION.sql del ZIP completo V16.11.
