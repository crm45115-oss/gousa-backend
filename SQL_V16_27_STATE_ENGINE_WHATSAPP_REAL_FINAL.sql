-- ChatFlow360 V16.27 - State Engine + WhatsApp CRM real
-- Seguro: solo CREATE IF NOT EXISTS / ALTER ADD COLUMN IF NOT EXISTS / índices.
-- Objetivo: conservar todo lo existente, agregar estado conversacional y adjuntos reales al CRM.

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
ALTER TABLE public.conversation_state ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.conversation_state ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.conversacion_mensajes ADD COLUMN IF NOT EXISTS media_url text;
ALTER TABLE public.conversacion_mensajes ADD COLUMN IF NOT EXISTS media_mime_type text;
ALTER TABLE public.conversacion_mensajes ADD COLUMN IF NOT EXISTS media_filename text;
ALTER TABLE public.conversacion_mensajes ADD COLUMN IF NOT EXISTS payload jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.conversacion_mensajes ADD COLUMN IF NOT EXISTS origen text;

ALTER TABLE public.conversaciones ADD COLUMN IF NOT EXISTS canal text;
ALTER TABLE public.conversaciones ADD COLUMN IF NOT EXISTS provider text;
ALTER TABLE public.conversaciones ADD COLUMN IF NOT EXISTS instance_name text;
ALTER TABLE public.conversaciones ADD COLUMN IF NOT EXISTS unread_count integer DEFAULT 0;
ALTER TABLE public.conversaciones ADD COLUMN IF NOT EXISTS ia_pausada boolean DEFAULT false;
ALTER TABLE public.conversaciones ADD COLUMN IF NOT EXISTS pausa_motivo text;
ALTER TABLE public.conversaciones ADD COLUMN IF NOT EXISTS pausa_hasta timestamptz;

-- Config editable usada por la IA y el QR.
ALTER TABLE public.empresa_admin_config ADD COLUMN IF NOT EXISTS qr_pago_url text;
ALTER TABLE public.empresa_admin_config ADD COLUMN IF NOT EXISTS qr_pago_texto text;
ALTER TABLE public.empresa_admin_config ADD COLUMN IF NOT EXISTS tiktok_live_url text;
ALTER TABLE public.empresa_admin_config ADD COLUMN IF NOT EXISTS ubicacion_principal_url text;
ALTER TABLE public.empresa_admin_config ADD COLUMN IF NOT EXISTS punto_entrega_live_url text;
ALTER TABLE public.empresa_admin_config ADD COLUMN IF NOT EXISTS punto_rosa_info text;
ALTER TABLE public.empresa_admin_config ADD COLUMN IF NOT EXISTS punto_recojo text;
ALTER TABLE public.empresa_admin_config ADD COLUMN IF NOT EXISTS horario_recojo text;
ALTER TABLE public.empresa_admin_config ADD COLUMN IF NOT EXISTS costo_despacho_transportadora numeric DEFAULT 5;
ALTER TABLE public.empresa_admin_config ADD COLUMN IF NOT EXISTS live_config jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.live_fardo_config ADD COLUMN IF NOT EXISTS qr_imagen_url text;
ALTER TABLE public.live_fardo_config ADD COLUMN IF NOT EXISTS texto_qr text;

CREATE INDEX IF NOT EXISTS idx_conversation_state_empresa_telefono ON public.conversation_state (empresa_id, telefono);
CREATE INDEX IF NOT EXISTS idx_conversacion_mensajes_empresa_fecha ON public.conversacion_mensajes (empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversacion_mensajes_empresa_telefono_fecha ON public.conversacion_mensajes (empresa_id, telefono, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversacion_mensajes_conversacion_fecha ON public.conversacion_mensajes (conversacion_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversaciones_empresa_updated ON public.conversaciones (empresa_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversaciones_empresa_telefono ON public.conversaciones (empresa_id, telefono);

-- En desarrollo del SaaS se permite al panel leer/escribir sus tablas desde anon/authenticated.
-- El backend sigue usando SERVICE_ROLE. En producción final puedes endurecer estas políticas por empresa_id.
ALTER TABLE public.conversation_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversacion_mensajes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresa_admin_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_fardo_config ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='conversation_state' AND policyname='cf360_conversation_state_all') THEN
    CREATE POLICY cf360_conversation_state_all ON public.conversation_state FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='conversacion_mensajes' AND policyname='cf360_conversacion_mensajes_all') THEN
    CREATE POLICY cf360_conversacion_mensajes_all ON public.conversacion_mensajes FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='conversaciones' AND policyname='cf360_conversaciones_all') THEN
    CREATE POLICY cf360_conversaciones_all ON public.conversaciones FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='empresa_admin_config' AND policyname='cf360_empresa_admin_config_all') THEN
    CREATE POLICY cf360_empresa_admin_config_all ON public.empresa_admin_config FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='live_fardo_config' AND policyname='cf360_live_fardo_config_all') THEN
    CREATE POLICY cf360_live_fardo_config_all ON public.live_fardo_config FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
