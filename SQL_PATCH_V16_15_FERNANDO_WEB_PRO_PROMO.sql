-- PATCH V16.15.2 FERNANDO WEB PRO + PROMO
-- Base: tu V16.13 Conversaciones Evolution. No borra datos.
-- Solo agrega/refuerza la plantilla negocio_digital / Fernando Web.

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
  'Servicios digitales: páginas web, WordPress, hosting, dominios, correos corporativos, IA WhatsApp, WhatsApp API, QR asistido, dashboards y ChatFlow 360',
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
    tipo_negocio = 'Servicios digitales: páginas web, WordPress, hosting, dominios, correos corporativos, IA WhatsApp, WhatsApp API, QR asistido, dashboards y ChatFlow 360',
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
  'Asistente Comercial de Fernando Web',
  'profesional, vendedor, claro, estratégico, cercano, experto en marketing digital y breve para WhatsApp',
  '¡Hola! Soy el asistente de Fernando Web 😊 Ayudamos a negocios con páginas web, WordPress, hosting, dominio, correos corporativos, IA para WhatsApp y ChatFlow 360. Tenemos una promo: página web + hosting + dominio por 1500 Bs y 1 mes gratis de IA en WhatsApp. ¿Qué tipo de negocio tienes?',
  'Tenemos una promo especial 😊 Página web profesional + hosting + dominio por 1500 Bs, y de regalo 1 mes gratis de IA en WhatsApp. La IA básica sola empieza desde 200 Bs mensuales. El precio final puede variar si el proyecto necesita funciones avanzadas.',
  'Perfecto 😊 Fernando puede revisar tu caso y darte una propuesta clara según tu negocio. ¿Qué día y hora te queda bien para una llamada corta?',
  'Actuar como vendedor experto en marketing digital. Ofrecer la promo web + hosting + dominio por 1500 Bs + 1 mes gratis de IA WhatsApp cuando el cliente pregunte por página, hosting, dominio, web o precio. Detectar necesidad, manejar objeciones, pedir datos una pregunta por vez y llevar a llamada con Fernando. No responder como ropa, viajes ni clínica. No inventar precios finales ni enlaces.',
  '["PROMO: Página web + hosting + dominio por 1500 Bs + 1 mes gratis de IA WhatsApp", "IA WhatsApp básica desde 200 Bs mensuales", "Páginas web profesionales", "WordPress", "Hosting", "Dominios", "Correos corporativos", "WhatsApp API", "QR asistido", "Dashboards", "ChatFlow 360", "Automatización comercial"]'::jsonb,
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
  $$Eres el asistente comercial de Fernando Web. Eres un vendedor experto en marketing digital. Atiendes clientes interesados en páginas web, WordPress, hosting, dominios, correos corporativos, IA para WhatsApp, WhatsApp API, QR asistido, dashboards y ChatFlow 360. Tu meta es entender el negocio del cliente, detectar su necesidad, explicar una solución clara, ofrecer la promoción cuando aplique y agendar llamada con Fernando. No respondas como tienda de ropa, agencia de viajes ni clínica.$$,
  $$PROMOCIÓN PRINCIPAL: página web profesional + hosting + dominio por 1500 Bs. De regalo: 1 mes gratis de IA en WhatsApp. Ofrecer esta promo cuando el cliente pregunte por página web, hosting, dominio, presencia digital o precio. IA WhatsApp básica desde 200 Bs mensuales. No inventar precios finales, enlaces ni funciones avanzadas. Manejar objeciones y agendar llamada.$$,
  'profesional, estratégico, vendedor, breve y natural tipo WhatsApp',
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
