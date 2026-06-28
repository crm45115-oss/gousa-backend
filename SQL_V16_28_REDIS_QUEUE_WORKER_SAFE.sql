-- ChatFlow360 V16.28 - Redis Queue + Worker SAFE
-- Objetivo: mejorar escalabilidad sin cambiar estructura crítica.
-- NO crea cola en Supabase. NO borra tablas. NO toca datos.
-- Solo agrega índices seguros para que el panel y el worker consulten más rápido por empresa_id.

CREATE INDEX IF NOT EXISTS idx_cf360_conv_mensajes_empresa_created
ON public.conversacion_mensajes (empresa_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cf360_conv_mensajes_empresa_tel_created
ON public.conversacion_mensajes (empresa_id, telefono, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cf360_conversaciones_empresa_updated
ON public.conversaciones (empresa_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_cf360_conversaciones_empresa_tel
ON public.conversaciones (empresa_id, telefono);

CREATE INDEX IF NOT EXISTS idx_cf360_leads_empresa_tel
ON public.leads (empresa_id, telefono);

CREATE INDEX IF NOT EXISTS idx_cf360_whatsapp_integraciones_empresa_provider
ON public.whatsapp_integraciones (empresa_id, provider, updated_at DESC);

DO $$
BEGIN
  RAISE NOTICE 'ChatFlow360 V16.28: índices seguros aplicados. La cola vive en Redis/BullMQ, no en Supabase.';
END $$;
