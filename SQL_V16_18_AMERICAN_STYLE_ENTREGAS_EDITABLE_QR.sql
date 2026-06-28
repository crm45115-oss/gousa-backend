-- V16.18 American Style: entregas editables + QR fijo + pedidos por sección
-- Seguro: no borra datos, solo CREATE/ALTER IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS public.empresa_admin_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid UNIQUE NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nombre_comercial text,
  nombre_asistente text,
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
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.empresa_admin_config ADD COLUMN IF NOT EXISTS qr_pago_url text;
ALTER TABLE public.empresa_admin_config ADD COLUMN IF NOT EXISTS qr_pago_texto text;
ALTER TABLE public.empresa_admin_config ADD COLUMN IF NOT EXISTS punto_recojo text;
ALTER TABLE public.empresa_admin_config ADD COLUMN IF NOT EXISTS horario_recojo text;
ALTER TABLE public.empresa_admin_config ADD COLUMN IF NOT EXISTS yango_desde_trompillo text;
ALTER TABLE public.empresa_admin_config ADD COLUMN IF NOT EXISTS delivery_normal text;
ALTER TABLE public.empresa_admin_config ADD COLUMN IF NOT EXISTS envios_departamento text;
ALTER TABLE public.empresa_admin_config ADD COLUMN IF NOT EXISTS costo_despacho_transportadora numeric DEFAULT 5;
ALTER TABLE public.empresa_admin_config ADD COLUMN IF NOT EXISTS transportadoras text;
ALTER TABLE public.empresa_admin_config ADD COLUMN IF NOT EXISTS punto_rosa text;
ALTER TABLE public.empresa_admin_config ADD COLUMN IF NOT EXISTS live_config jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS tipo_entrega text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS direccion_entrega text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS ubicacion_entrega text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS ciudad_destino text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS departamento_destino text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS transportadora text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS estado_entrega text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS punto_entrega text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS costo_despacho_transportadora numeric DEFAULT 5;

CREATE TABLE IF NOT EXISTS public.live_fardo_pedidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  lead_id uuid NULL REFERENCES public.leads(id) ON DELETE SET NULL,
  telefono text NOT NULL,
  tipo_entrega text NOT NULL,
  nombre_cliente text,
  direccion_entrega text,
  ubicacion_entrega text,
  ciudad_destino text,
  departamento_destino text,
  transportadora text,
  costo_despacho_transportadora numeric DEFAULT 5,
  estado text DEFAULT 'pendiente_revision',
  ultimo_mensaje text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (empresa_id, telefono, tipo_entrega)
);

CREATE INDEX IF NOT EXISTS idx_live_fardo_pedidos_empresa_tipo ON public.live_fardo_pedidos(empresa_id, tipo_entrega);
CREATE INDEX IF NOT EXISTS idx_live_fardo_pedidos_estado ON public.live_fardo_pedidos(estado);
