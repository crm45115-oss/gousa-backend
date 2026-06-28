-- ChatFlow360 V16.29 - CRM Panel WhatsApp real
-- No requiere cambios destructivos ni nuevas tablas.
-- Objetivo: el panel lee conversaciones reales desde:
--   public.conversaciones
--   public.conversacion_mensajes
--   public.leads
-- Siempre filtrado por empresa_id desde backend/frontend.
--
-- Este archivo se entrega para control de versión.
-- Si ya ejecutaste V16.26/V16.28, no necesitas ejecutar nada adicional.

DO $$
BEGIN
  RAISE NOTICE 'ChatFlow360 V16.29: sin cambios SQL obligatorios. CRM panel corregido en frontend/backend.';
END $$;
