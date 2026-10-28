-- LEPION — esquema do banco de dados
-- Zonas da usina, trabalhadores, EPIs (capacetes), leituras e incidentes.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Zonas e pontos de acesso Wi-Fi (localização por zona: o capacete informa o
-- BSSID do roteador a que está conectado e o banco traduz para a zona)
-- ---------------------------------------------------------------------------
create table public.zones (
  id                  text primary key,
  nome                text not null,
  gateway_id          text not null,
  ordem               int  not null default 0,
  limite_sensacao     numeric not null default 35,   -- °C, igual a SENSACAO_ATENCAO_C do firmware
  gas_razao_atencao   numeric not null default 1.5,  -- RAZAO_GAS_ATENCAO
  gas_razao_perigo    numeric not null default 2.0,  -- RAZAO_GAS_PERIGO
  limite_umidade_min  numeric not null default 30    -- % — abaixo disso, ar seco
);

create table public.access_points (
  bssid     text primary key,                         -- ex.: AA:BB:CC:DD:EE:FF (maiúsculas)
  zone_id   text not null references public.zones(id) on delete cascade,
  descricao text
);

-- ---------------------------------------------------------------------------
-- Trabalhadores e dispositivos
-- ---------------------------------------------------------------------------
create table public.workers (
  id            text primary key,
  nome          text not null,
  cargo         text not null,
  turno         text not null default 'A' check (turno in ('A','B','C')),
  supervisor    boolean not null default false,
  checkin       timestamptz,
  ultima_pausa  timestamptz
);

create table public.devices (
  id                     text primary key,            -- o "id" do JSON do firmware (ex.: capacete01)
  worker_id              text unique references public.workers(id) on delete set null,
  tipo                   text not null default 'capacete' check (tipo in ('capacete','traje')),
  zone_id                text references public.zones(id),   -- zona atual
  simulado               boolean not null default false,
  sim_perfil             jsonb not null default '{}'::jsonb,
  bateria                int check (bateria between 0 and 100),  -- null = não medida
  rssi                   int,
  bssid                  text,
  nivel                  text,                        -- último nível informado pelo firmware
  ultimo_sinal_em        timestamptz,
  ultima_calibracao_gas  date,
  ultima_leitura         jsonb                        -- última leitura normalizada (para o painel)
);

-- Chaves dos dispositivos: só o hash, e a tabela não é legível pelo painel.
create table public.device_keys (
  device_id  text primary key references public.devices(id) on delete cascade,
  key_hash   text not null,
  criado_em  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Leituras (o log bruto) e incidentes (o log de ocorrências)
-- ---------------------------------------------------------------------------
create table public.readings (
  id            bigint generated always as identity primary key,
  device_id     text not null references public.devices(id) on delete cascade,
  zone_id       text references public.zones(id),
  criado_em     timestamptz not null default now(),
  nivel         text,
  evento        text,
  temperatura   numeric,
  umidade       numeric,
  sensacao      numeric,
  gas_razao     numeric,
  gas_bruto     int,
  gas_pronto    boolean,
  aceleracao_g  numeric,
  inclinacao    numeric,
  bateria       int,
  rssi          int
);
create index readings_device_time on public.readings (device_id, criado_em desc);
create index readings_time on public.readings (criado_em desc);

create table public.incidents (
  id               uuid primary key default gen_random_uuid(),
  worker_id        text references public.workers(id) on delete set null,
  device_id        text references public.devices(id) on delete set null,
  zone_id          text references public.zones(id),
  tipo             text not null check (tipo in ('queda','impacto','caido','sos','calor','gas','ar_seco','bateria','offline')),
  severidade       text not null check (severidade in ('atencao','critico')),
  status           text not null default 'aberto' check (status in ('aberto','em_atendimento','resolvido','falso_positivo')),
  detalhe          text not null default '',
  snapshot         jsonb,
  criado_em        timestamptz not null default now(),
  reconhecido_em   timestamptz,
  reconhecido_por  text,
  resolvido_em     timestamptz,
  resolvido_por    text
);
create index incidents_time on public.incidents (criado_em desc);
create index incidents_open on public.incidents (device_id, tipo) where status in ('aberto','em_atendimento');

-- ---------------------------------------------------------------------------
-- Segurança por linha: o painel (sem login nesta fase) só LÊ.
-- Toda escrita passa pela Edge Function (chave do EPI) ou por funções RPC
-- específicas e validadas.
-- ---------------------------------------------------------------------------
alter table public.zones         enable row level security;
alter table public.access_points enable row level security;
alter table public.workers       enable row level security;
alter table public.devices       enable row level security;
alter table public.device_keys   enable row level security;
alter table public.readings      enable row level security;
alter table public.incidents     enable row level security;

create policy "painel lê zonas"        on public.zones         for select to anon, authenticated using (true);
create policy "painel lê APs"          on public.access_points for select to anon, authenticated using (true);
create policy "painel lê trabalhadores" on public.workers      for select to anon, authenticated using (true);
create policy "painel lê dispositivos" on public.devices       for select to anon, authenticated using (true);
create policy "painel lê leituras"     on public.readings      for select to anon, authenticated using (true);
create policy "painel lê incidentes"   on public.incidents     for select to anon, authenticated using (true);
-- device_keys: nenhuma política = inacessível para anon/authenticated.

-- Tempo real para o painel
alter publication supabase_realtime add table public.devices, public.incidents, public.workers;
