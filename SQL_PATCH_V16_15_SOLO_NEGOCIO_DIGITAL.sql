-- ChatFlow 360 - PATCH V16.15 SOLO PLANTILLA NEGOCIO DIGITAL
-- Ejecuta este SQL una sola vez. No toca GO USA, American Style ni Clínica.

create extension if not exists "pgcrypto";

alter table public.empresas add column if not exists rubro text default 'agencia_viajes';
alter table public.empresas add column if not exists tipo_negocio text;
alter table public.empresas add column if not exists modulos_activos jsonb default '[]'::jsonb;
alter table public.empresas add column if not exists logo_url text;
alter table public.empresas add column if not exists color_primario text default '#075E54';
alter table public.empresas add column if not exists color_secundario text default '#25D366';
alter table public.empresas add column if not exists tenant_estado text default 'activo';
alter table public.empresas add column if not exists plan_saas text default 'starter';
alter table public.empresas add column if not exists fecha_inicio timestamptz default now();
alter table public.empresas add column if not exists fecha_vencimiento timestamptz default (now() + interval '30 days');
alter table public.empresas add column if not exists precio_mensual numeric default 0;
alter table public.empresas add column if not exists moneda text default 'BOB';
alter table public.empresas add column if not exists updated_at timestamptz default now();

create table if not exists public.ia_config (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references public.empresas(id) on delete cascade,
  nombre_asistente text default 'Asistente IA',
  tono text default 'amable, profesional, breve y vendedor',
  mensaje_bienvenida text default 'Hola, gracias por escribirnos. ¿En qué podemos ayudarte?',
  mensaje_fuera_horario text default 'Gracias por escribir. En este momento estamos fuera de horario, pero dejaremos registrada tu solicitud.',
  respuesta_precio text default 'Un asesor confirmará el costo exacto según tu caso.',
  respuesta_humano text default 'Perfecto, voy a derivarte con un asesor para atención personalizada.',
  reglas text default 'Responder breve por WhatsApp. No inventar información. Si no sabe, derivar a asesor.',
  preguntas_obligatorias jsonb default '[]'::jsonb,
  servicios jsonb default '[]'::jsonb,
  activo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index if not exists ux_ia_config_empresa on public.ia_config(empresa_id);

-- Crea empresa personal solo si no existe una con rubro negocio_digital.
insert into public.empresas (
  nombre, rubro, tipo_negocio, plan_saas, tenant_estado,
  color_primario, color_secundario, fecha_inicio, fecha_vencimiento, precio_mensual, moneda, modulos_activos
)
select
  'Fernando Digital',
  'negocio_digital',
  'Servicios digitales: páginas web, WordPress, hosting, correos, IA WhatsApp, WhatsApp API y SaaS ChatFlow 360',
  'interno',
  'activo',
  '#0f766e',
  '#111827',
  now(),
  now() + interval '1 year',
  0,
  'BOB',
  '["leads","whatsapp","conectar_whatsapp","paginas_web","wordpress","hosting_correos","ia_whatsapp","chatflow360","cotizaciones","citas","pagos","reportes","base_ia"]'::jsonb
where not exists (select 1 from public.empresas where rubro = 'negocio_digital');

insert into public.ia_config (
  empresa_id, nombre_asistente, tono, mensaje_bienvenida, respuesta_precio, respuesta_humano, reglas, servicios, activo, updated_at
)
select
  e.id,
  'Asistente Digital de Fernando',
  'amable, profesional, cercano, comercial, claro y moderno',
  '¡Hola! Soy el asistente digital de Fernando 😊 Ayudamos a negocios con páginas web, WordPress, hosting, correos corporativos, IA para WhatsApp y sistemas como ChatFlow 360. ¿Qué necesitas mejorar en tu negocio: tu página web, tu WhatsApp, tus clientes o tu sistema de atención?',
  'Depende de lo que necesites 😊 Para IA básica en WhatsApp tenemos planes desde 200 Bs mensuales. Para páginas web o WordPress, el precio depende de si quieres una página simple, profesional, catálogo, dominio, hosting o correos.',
  'Perfecto 😊 Te derivo con Fernando para que revise tu caso y te dé una propuesta clara.',
  $PROMPT$Eres el asistente virtual del negocio digital de Fernando.

Atiende clientes interesados en páginas web, WordPress, hosting, dominio, correos corporativos, automatización con IA, WhatsApp con IA, WhatsApp API, dashboards y el SaaS ChatFlow 360.

No respondas como tienda de ropa, agencia de viajes ni clínica. Solo responde como asesor digital de Fernando.

Servicios principales:
- Páginas web para negocios.
- WordPress.
- Dominio, hosting y correos corporativos.
- IA para WhatsApp.
- WhatsApp API / QR asistido.
- SaaS ChatFlow 360.

Planes referenciales:
- IA WhatsApp básico desde 200 Bs mensuales.
- Página web básica: presencia digital, WhatsApp, ubicación, redes y secciones básicas.
- Página web profesional: servicios, galería, formularios, testimonios y estructura comercial.
- WordPress: instalación, diseño y configuración editable.
- ChatFlow 360: sistema mensual según funciones.

Reglas:
1. Pregunta qué tipo de negocio tiene el cliente.
2. Pregunta qué necesita: página web, WordPress, hosting/correos, IA WhatsApp, WhatsApp API o ChatFlow 360.
3. Haz una pregunta por mensaje.
4. No prometas precio final sin revisar el proyecto.
5. Si quiere avanzar, pide nombre, negocio, ciudad, servicio, WhatsApp y horario para llamada.
6. Agenda llamada con Fernando.
7. Responde corto, claro y comercial.

Mensaje inicial:
“¡Hola! Soy el asistente digital de Fernando 😊 Ayudamos a negocios con páginas web, WordPress, hosting, correos corporativos, IA para WhatsApp y sistemas como ChatFlow 360. ¿Qué necesitas mejorar en tu negocio?”$PROMPT$,
  '["Páginas web", "WordPress", "Hosting", "Dominios", "Correos corporativos", "IA WhatsApp", "WhatsApp API", "QR asistido", "ChatFlow 360", "Dashboards", "Cotizaciones", "Agendar citas"]'::jsonb,
  true,
  now()
from public.empresas e
where e.rubro = 'negocio_digital'
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

notify pgrst, 'reload schema';

select id, nombre, rubro, tipo_negocio, tenant_estado
from public.empresas
where rubro = 'negocio_digital'
order by created_at desc;
