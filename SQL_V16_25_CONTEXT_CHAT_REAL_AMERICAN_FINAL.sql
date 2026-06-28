-- ChatFlow360 V16.25 - Contexto de conversación + WhatsApp real
-- Seguro: solo CREATE IF NOT EXISTS / ALTER IF EXISTS / policies permisivas para entorno SaaS actual.
-- No borra datos.

CREATE TABLE IF NOT EXISTS public.conversation_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  lead_id uuid NULL,
  telefono text NOT NULL,
  estado text NOT NULL DEFAULT 'inicio',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, telefono)
);

ALTER TABLE public.conversation_state ADD COLUMN IF NOT EXISTS lead_id uuid NULL;
ALTER TABLE public.conversation_state ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'inicio';
ALTER TABLE public.conversation_state ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.conversation_state ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_conversation_state_empresa_telefono
ON public.conversation_state (empresa_id, telefono);

CREATE INDEX IF NOT EXISTS idx_conversacion_mensajes_empresa_fecha
ON public.conversacion_mensajes (empresa_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversacion_mensajes_empresa_telefono_fecha
ON public.conversacion_mensajes (empresa_id, telefono, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversaciones_empresa_updated
ON public.conversaciones (empresa_id, updated_at DESC);

-- Columnas tolerantes por si alguna versión anterior no las creó.
ALTER TABLE public.empresa_admin_config ADD COLUMN IF NOT EXISTS qr_pago_url text;
ALTER TABLE public.empresa_admin_config ADD COLUMN IF NOT EXISTS qr_pago_texto text;
ALTER TABLE public.live_fardo_config ADD COLUMN IF NOT EXISTS qr_imagen_url text;
ALTER TABLE public.live_fardo_config ADD COLUMN IF NOT EXISTS texto_qr text;

-- Si RLS está activo con login propio del SaaS, el frontend con anon puede quedar bloqueado.
-- Estas policies permiten operar a la app actual sin tocar credenciales.
ALTER TABLE public.conversation_state ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='conversation_state' AND policyname='cf360_conversation_state_all'
  ) THEN
    CREATE POLICY cf360_conversation_state_all ON public.conversation_state
    FOR ALL TO anon, authenticated
    USING (true)
    WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='empresa_admin_config') THEN
    ALTER TABLE public.empresa_admin_config ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='empresa_admin_config' AND policyname='cf360_empresa_admin_config_all'
    ) THEN
      CREATE POLICY cf360_empresa_admin_config_all ON public.empresa_admin_config
      FOR ALL TO anon, authenticated
      USING (true)
      WITH CHECK (true);
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='live_fardo_config') THEN
    ALTER TABLE public.live_fardo_config ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='live_fardo_config' AND policyname='cf360_live_fardo_config_all'
    ) THEN
      CREATE POLICY cf360_live_fardo_config_all ON public.live_fardo_config
      FOR ALL TO anon, authenticated
      USING (true)
      WITH CHECK (true);
    END IF;
  END IF;
END $$;
