
-- PATCH V16.15 SOLO NEGOCIO DIGITAL FERNANDO WEB
-- Base: Frontend V16.13 Conversaciones Evolution + Backend V16.13 Conversaciones/Pausa.
-- No modifica GO USA, American Style, clínica, QR ni Evolution.

create extension if not exists "pgcrypto";

alter table public.empresas add column if not exists rubro text;
alter table public.empresas add column if not exists tipo_negocio text;
alter table public.empresas add column if not exists logo_url text;
alter table public.empresas add column if not exists color_primario text default '#075E54';
alter table public.empresas add column if not exists color_secundario text default '#25D366';
alter table public.empresas add column if not exists plan_saas text default 'starter';
alter table public.empresas add column if not exists tenant_estado text default 'activo';
alter table public.empresas add column if not exists onboarding_estado text default 'manual';
alter table public.empresas add column if not exists fecha_inicio date;
alter table public.empresas add column if not exists fecha_vencimiento date;
alter table public.empresas add column if not exists precio_mensual numeric default 0;
alter table public.empresas add column if not exists moneda text default 'BOB';
alter table public.empresas add column if not exists updated_at timestamptz default now();

create table if not exists public.empresa_ai_config (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references public.empresas(id) on delete cascade,
  system_prompt text,
  business_rules text,
  tono text default 'amable, profesional, breve y vendedor',
  activo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index if not exists ux_empresa_ai_config_empresa on public.empresa_ai_config(empresa_id);

create table if not exists public.ia_config (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references public.empresas(id) on delete cascade,
  nombre_asistente text default 'Asistente IA',
  tono text default 'amable, profesional, breve y vendedor',
  mensaje_bienvenida text default 'Hola, gracias por escribirnos. ¿En qué podemos ayudarte?',
  mensaje_fuera_horario text default 'Gracias por escribir. En este momento estamos fuera de horario, pero dejaremos registrada tu solicitud.',
  respuesta_precio text default 'Un asesor confirmará el costo exacto según tu caso.',
  respuesta_humano text default 'Perfecto, voy a derivarte con un asesor para atención personalizada.',
  reglas text default 'Responder de forma breve por WhatsApp. No inventar información. Si no sabe, derivar a un asesor.',
  preguntas_obligatorias jsonb default '[]'::jsonb,
  servicios jsonb default '[]'::jsonb,
  activo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index if not exists ux_ia_config_empresa on public.ia_config(empresa_id);

insert into public.empresas (
  nombre,
  rubro,
  tipo_negocio,
  plan_saas,
  tenant_estado,
  onboarding_estado,
  fecha_inicio,
  fecha_vencimiento,
  precio_mensual,
  moneda,
  color_primario,
  color_secundario,
  created_at,
  updated_at
)
select
  'Fernando Web',
  'negocio_digital',
  'Servicios digitales: páginas web, WordPress, hosting, dominios, correos corporativos, IA WhatsApp, WhatsApp API y ChatFlow 360',
  'interno',
  'activo',
  'manual',
  current_date,
  current_date + interval '1 year',
  0,
  'BOB',
  '#0f766e',
  '#25D366',
  now(),
  now()
where not exists (
  select 1 from public.empresas where lower(nombre) in ('fernando web','fernando digital')
);

update public.empresas
set rubro = 'negocio_digital',
    tipo_negocio = 'Servicios digitales: páginas web, WordPress, hosting, dominios, correos corporativos, IA WhatsApp, WhatsApp API y ChatFlow 360',
    updated_at = now()
where lower(nombre) in ('fernando web','fernando digital');

with e as (
  select id from public.empresas where lower(nombre) in ('fernando web','fernando digital') order by created_at desc limit 1
)
insert into public.ia_config (
  empresa_id,
  nombre_asistente,
  tono,
  mensaje_bienvenida,
  respuesta_precio,
  respuesta_humano,
  reglas,
  servicios,
  activo,
  updated_at
)
select
  e.id,
  'Asistente Digital de Fernando',
  'amable, claro, comercial, profesional, breve y natural tipo WhatsApp',
  '¡Hola! Soy el asistente digital de Fernando 😊 Ayudamos a negocios con páginas web, WordPress, hosting, correos corporativos, IA para WhatsApp y sistemas como ChatFlow 360. ¿Qué necesitas mejorar en tu negocio: tu página web, tu WhatsApp, tus clientes o tu sistema de atención?',
  'Depende de lo que necesites 😊 Para IA básica en WhatsApp tenemos planes desde 200 Bs mensuales. Para páginas web o WordPress, Fernando revisa el alcance y te da una propuesta clara.',
  'Perfecto 😊 Fernando puede revisar tu caso y darte una propuesta clara según tu negocio.',
  'Preguntar qué tipo de negocio tiene, qué necesita mejorar y agendar llamada con Fernando. No responder como tienda de ropa, agencia de viajes ni clínica. Si pide ejemplos, decir que Fernando enviará muestras parecidas al proyecto. Hacer una pregunta por mensaje.',
  '["Páginas web", "WordPress", "Hosting", "Dominios", "Correos corporativos", "IA WhatsApp", "WhatsApp API", "QR asistido", "Dashboards", "ChatFlow 360"]'::jsonb,
  true,
  now()
from e
on conflict (empresa_id) do update set
  nombre_asistente = excluded.nombre_asistente,
  tono = excluded.tono,
  mensaje_bienvenida = excluded.mensaje_bienvenida,
  respuesta_precio = excluded.respuesta_precio,
  respuesta_humano = excluded.respuesta_humano,
  reglas = excluded.reglas,
  servicios = excluded.servicios,
  activo = true,
  updated_at = now();

with e as (
  select id from public.empresas where lower(nombre) in ('fernando web','fernando digital') order by created_at desc limit 1
)
insert into public.empresa_ai_config (
  empresa_id,
  system_prompt,
  business_rules,
  tono,
  activo,
  updated_at
)
select
  e.id,
  $$Eres el asistente virtual del negocio digital de Fernando. Atiendes clientes interesados en páginas web, WordPress, hosting, dominios, correos corporativos, IA para WhatsApp, WhatsApp API, QR asistido, dashboards y ChatFlow 360. Pregunta qué tipo de negocio tiene el cliente, qué necesita mejorar y agenda una llamada con Fernando. No respondas como tienda de ropa, agencia de viajes ni clínica.$$,
  $$Servicios: páginas web, WordPress, hosting, dominios, correos corporativos, IA WhatsApp, WhatsApp API, QR asistido, dashboards y ChatFlow 360. Plan IA WhatsApp básica desde 200 Bs mensuales. Preguntar datos del negocio y agendar llamada con Fernando. No prometer precio final sin revisión.$$,
  'amable, profesional, breve y vendedor',
  true,
  now()
from e
on conflict (empresa_id) do update set
  system_prompt = excluded.system_prompt,
  business_rules = excluded.business_rules,
  tono = excluded.tono,
  activo = true,
  updated_at = now();

notify pgrst, 'reload schema';

select id, nombre, rubro, tipo_negocio, tenant_estado
from public.empresas
where lower(nombre) in ('fernando web','fernando digital')
order by created_at desc;
