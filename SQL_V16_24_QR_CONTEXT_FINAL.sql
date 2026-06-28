-- ChatFlow360 V16.24 - QR + contexto American Style
-- Seguro: solo CREATE/ALTER IF NOT EXISTS, no borra datos.

CREATE TABLE IF NOT EXISTS public.empresa_admin_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid UNIQUE,
  nombre_comercial text,
  whatsapp text,
  web text,
  horarios text,
  tiktok text,
  instagram text,
  facebook text,
  grupo_whatsapp text,
  direccion text,
  links_portafolio text,
  mensaje_bienvenida text,
  prompt_personalizado text,
  planes_precios text,
  promociones_activas text,
  reglas_entrega text,
  reglas_pago text,
  politicas text,
  qr_pago_url text,
  qr_pago_texto text,
  punto_recojo text,
  horario_recojo text,
  yango_desde_trompillo text,
  delivery_normal text,
  envios_departamento text,
  costo_despacho_transportadora numeric DEFAULT 0,
  transportadoras text,
  punto_rosa text,
  live_config jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.empresa_admin_config ADD COLUMN IF NOT EXISTS empresa_id uuid;
ALTER TABLE public.empresa_admin_config ADD COLUMN IF NOT EXISTS qr_pago_url text;
ALTER TABLE public.empresa_admin_config ADD COLUMN IF NOT EXISTS qr_pago_texto text;
ALTER TABLE public.empresa_admin_config ADD COLUMN IF NOT EXISTS reglas_pago text;
ALTER TABLE public.empresa_admin_config ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS empresa_admin_config_empresa_id_uidx ON public.empresa_admin_config(empresa_id);

ALTER TABLE public.live_fardo_config ADD COLUMN IF NOT EXISTS qr_imagen_url text;
ALTER TABLE public.live_fardo_config ADD COLUMN IF NOT EXISTS qr_storage_path text;
ALTER TABLE public.live_fardo_config ADD COLUMN IF NOT EXISTS qr_activo boolean DEFAULT true;
ALTER TABLE public.live_fardo_config ADD COLUMN IF NOT EXISTS texto_qr text;
ALTER TABLE public.live_fardo_config ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.conversaciones ADD COLUMN IF NOT EXISTS contexto_estado text;
ALTER TABLE public.conversaciones ADD COLUMN IF NOT EXISTS ultimo_qr_enviado_at timestamptz;
ALTER TABLE public.conversaciones ADD COLUMN IF NOT EXISTS pausa_motivo text;
ALTER TABLE public.conversaciones ADD COLUMN IF NOT EXISTS ia_pausada boolean DEFAULT false;

ALTER TABLE public.conversacion_mensajes ADD COLUMN IF NOT EXISTS from_me boolean DEFAULT false;
ALTER TABLE public.conversacion_mensajes ADD COLUMN IF NOT EXISTS payload jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.conversacion_mensajes ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- Verificación útil después de subir QR desde el panel:
-- SELECT empresa_id, qr_pago_url FROM empresa_admin_config;
