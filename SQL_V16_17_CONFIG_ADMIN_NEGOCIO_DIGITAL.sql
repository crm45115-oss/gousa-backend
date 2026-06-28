-- ChatFlow 360 V16.17
-- Configuración editable por admin/empresa.
-- Seguro: no borra datos, no elimina tablas, no cambia credenciales.

CREATE TABLE IF NOT EXISTS public.empresa_admin_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nombre_comercial text,
  nombre_asistente text,
  whatsapp text,
  web text,
  tiktok text,
  instagram text,
  facebook text,
  grupo_whatsapp text,
  horarios text,
  direccion text,
  reglas_entrega text,
  reglas_pago text,
  politicas text,
  links_portafolio text,
  planes_precios text,
  promociones_activas text,
  mensaje_bienvenida text,
  prompt_personalizado text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (empresa_id)
);

ALTER TABLE public.empresa_admin_config ADD COLUMN IF NOT EXISTS nombre_comercial text;
ALTER TABLE public.empresa_admin_config ADD COLUMN IF NOT EXISTS nombre_asistente text;
ALTER TABLE public.empresa_admin_config ADD COLUMN IF NOT EXISTS whatsapp text;
ALTER TABLE public.empresa_admin_config ADD COLUMN IF NOT EXISTS web text;
ALTER TABLE public.empresa_admin_config ADD COLUMN IF NOT EXISTS tiktok text;
ALTER TABLE public.empresa_admin_config ADD COLUMN IF NOT EXISTS instagram text;
ALTER TABLE public.empresa_admin_config ADD COLUMN IF NOT EXISTS facebook text;
ALTER TABLE public.empresa_admin_config ADD COLUMN IF NOT EXISTS grupo_whatsapp text;
ALTER TABLE public.empresa_admin_config ADD COLUMN IF NOT EXISTS horarios text;
ALTER TABLE public.empresa_admin_config ADD COLUMN IF NOT EXISTS direccion text;
ALTER TABLE public.empresa_admin_config ADD COLUMN IF NOT EXISTS reglas_entrega text;
ALTER TABLE public.empresa_admin_config ADD COLUMN IF NOT EXISTS reglas_pago text;
ALTER TABLE public.empresa_admin_config ADD COLUMN IF NOT EXISTS politicas text;
ALTER TABLE public.empresa_admin_config ADD COLUMN IF NOT EXISTS links_portafolio text;
ALTER TABLE public.empresa_admin_config ADD COLUMN IF NOT EXISTS planes_precios text;
ALTER TABLE public.empresa_admin_config ADD COLUMN IF NOT EXISTS promociones_activas text;
ALTER TABLE public.empresa_admin_config ADD COLUMN IF NOT EXISTS mensaje_bienvenida text;
ALTER TABLE public.empresa_admin_config ADD COLUMN IF NOT EXISTS prompt_personalizado text;
ALTER TABLE public.empresa_admin_config ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.empresa_admin_config ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.empresa_admin_config ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_empresa_admin_config_empresa_id
ON public.empresa_admin_config(empresa_id);

-- Reactivar conversaciones pausadas por el bug de saludo automático.
-- No afecta pausas por comando /ia off.
UPDATE public.conversaciones
SET ia_pausada = false,
    pausa_motivo = NULL,
    pausa_hasta = NULL,
    updated_at = now()
WHERE ia_pausada = true
  AND pausa_motivo = 'humano_respondio_desde_celular'
  AND EXISTS (
    SELECT 1
    FROM public.conversacion_mensajes m
    WHERE m.empresa_id = conversaciones.empresa_id
      AND m.telefono = conversaciones.telefono
      AND m.from_me = true
      AND m.created_at >= now() - interval '24 hours'
      AND lower(coalesce(m.mensaje,'')) LIKE ANY (ARRAY[
        '%gracias por comunicarte%',
        '%te responderemos a la brevedad%',
        '%nos especializamos%',
        '%fernando web studio%'
      ])
  );
