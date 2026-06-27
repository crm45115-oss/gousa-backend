create extension if not exists "pgcrypto";

alter table public.conversaciones add column if not exists telefono text;
alter table public.conversaciones add column if not exists ultimo_mensaje text;
alter table public.conversaciones add column if not exists estado text default 'abierta';
alter table public.conversaciones add column if not exists canal text default 'evolution';
alter table public.conversaciones add column if not exists provider text default 'evolution';
alter table public.conversaciones add column if not exists instance_name text;
alter table public.conversaciones add column if not exists ia_pausada boolean default false;
alter table public.conversaciones add column if not exists pausa_motivo text;
alter table public.conversaciones add column if not exists pausa_hasta timestamptz;
alter table public.conversaciones add column if not exists unread_count int default 0;
alter table public.conversaciones add column if not exists updated_at timestamptz default now();

create table if not exists public.conversacion_mensajes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references public.empresas(id) on delete cascade,
  conversacion_id uuid references public.conversaciones(id) on delete cascade,
  telefono text,
  direccion text check (direccion in ('entrante','saliente')),
  from_me boolean default false,
  origen text default 'evolution',
  tipo text default 'text',
  mensaje text,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_conversaciones_empresa on public.conversaciones(empresa_id);
create index if not exists idx_conversaciones_telefono on public.conversaciones(telefono);
create index if not exists idx_conversaciones_empresa_tel on public.conversaciones(empresa_id, telefono);
create index if not exists idx_conversacion_mensajes_conversacion on public.conversacion_mensajes(conversacion_id);
create index if not exists idx_conversacion_mensajes_empresa on public.conversacion_mensajes(empresa_id);
create index if not exists idx_conversacion_mensajes_tel on public.conversacion_mensajes(telefono);

notify pgrst, 'reload schema';
