# ChatFlow360 V16.32 - Hotfix Delivery vs Live

Corrección segura del backend para American Style.

## Problema corregido
El sistema detectaba `delivery` como si fuera `live`, porque la palabra `delivery` contiene la secuencia `live`. Por eso ante mensajes como:

> Quiero un delivery para la plaza de los chacos

respondía con el link del TikTok Live.

## Cambios
- `esLinkLiveTexto()` ya no usa `includes('live')` de forma amplia.
- Delivery y departamento tienen prioridad antes que link de TikTok.
- Otra plaza distinta a Plaza El Trompillo se clasifica como `delivery_plaza`.
- No se toca Supabase, Redis ni frontend.

## Orden de despliegue
1. Subir backend V16.32 a Railway.
2. Reiniciar backend.
3. Probar WhatsApp con: `Quiero un delivery para la plaza de los chacos`.

