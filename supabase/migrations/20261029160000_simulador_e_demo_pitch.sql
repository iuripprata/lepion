-- LEPION — chave liga/desliga do simulador e cenário de demonstração do pitch (29/10/2026)
--
-- * public.config guarda se o simulador está ligado. O painel lê (e acompanha em
--   tempo real) para esconder os 31 trabalhadores simulados quando ele está desligado.
-- * definir_simulador(bool) é o botão "Ligar/Desligar simulador" do painel.
-- * Com o simulador desligado, a rotina de minuto não gera leituras simuladas e a
--   detecção de "sem sinal" ignora os EPIs simulados (senão abriria 31 ocorrências).
-- * preparar_demo_pitch() recria, com data de agora, o cenário fictício do pitch:
--   o turno do Guilherme com a sensação térmica subindo e a ocorrência crítica
--   "Desmaio por calor extremo", já em atendimento. Só o servidor pode chamá-la.
--
-- A limpeza das ocorrências feita no mesmo dia (com backup em
-- incidents_backup_20261029) foi uma operação pontual e não faz parte desta migração.

create table public.config (
  id               int primary key default 1 check (id = 1),
  simulador_ativo  boolean not null default true,
  atualizado_em    timestamptz not null default now()
);
insert into public.config (id) values (1);

alter table public.config enable row level security;
create policy "painel lê a configuração" on public.config for select to anon, authenticated using (true);
alter publication supabase_realtime add table public.config;

create or replace function public.simulador_ativo()
returns boolean language sql stable set search_path = public as $$
  select coalesce((select simulador_ativo from public.config where id = 1), true)
$$;

-- Botão do painel. Ao ligar, gera uma leitura imediata para os simulados não
-- aparecerem "sem sinal" até a próxima rodada da rotina.
create or replace function public.definir_simulador(p_ativo boolean)
returns boolean
language plpgsql security definer set search_path = public, extensions as $$
begin
  update public.config set simulador_ativo = p_ativo, atualizado_em = now() where id = 1;
  if p_ativo then
    perform public.simulate_tick();
  end if;
  return p_ativo;
end;
$$;

-- Sem sinal: com o simulador desligado, só EPIs físicos geram ocorrência.
create or replace function public.check_offline()
returns int
language plpgsql security definer set search_path = public, extensions as $$
declare n int;
begin
  insert into public.incidents (worker_id, device_id, zone_id, tipo, severidade, detalhe, snapshot)
  select d.worker_id, d.id, d.zone_id, 'offline', 'atencao',
         'Sem sinal desde ' || to_char(d.ultimo_sinal_em at time zone 'America/Sao_Paulo', 'HH24:MI'),
         d.ultima_leitura
    from public.devices d
   where d.worker_id is not null
     and (not d.simulado or public.simulador_ativo())
     and d.ultimo_sinal_em < now() - interval '2 minutes'
     and not exists (select 1 from public.incidents i
                      where i.device_id = d.id and i.tipo = 'offline' and i.status in ('aberto', 'em_atendimento'));
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.lepion_minuto()
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if public.simulador_ativo() then
    perform public.simulate_tick();
  end if;
  perform public.check_offline();
end;
$$;

-- "Simular evento" só faz sentido com os simulados visíveis.
create or replace function public.simulate_event(p_tipo text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_dev text;
  z public.zones%rowtype;
begin
  if not public.simulador_ativo() then
    raise exception 'ligue o simulador para simular eventos';
  end if;
  if p_tipo not in ('queda', 'calor', 'gas') then
    raise exception 'tipo inválido: %', p_tipo;
  end if;
  if exists (select 1 from public.devices where simulado and (sim_perfil ->> 'simulado_em')::timestamptz > now() - interval '5 seconds') then
    raise exception 'aguarde alguns segundos entre simulações';
  end if;

  select d.id into v_dev
    from public.devices d join public.workers w on w.id = d.worker_id
   where d.simulado and not w.supervisor
     and not coalesce((d.sim_perfil ->> 'offline')::boolean, false)
     and not exists (select 1 from public.incidents i
                      where i.device_id = d.id and i.status in ('aberto', 'em_atendimento'))
   order by random() limit 1;
  if v_dev is null then
    raise exception 'nenhum trabalhador simulado disponível';
  end if;
  select z2.* into z from public.zones z2 join public.devices d on d.zone_id = z2.id where d.id = v_dev;

  update public.devices set sim_perfil = sim_perfil
    || jsonb_build_object('simulado_em', now())
    || case p_tipo
         when 'queda' then jsonb_build_object('evento_unico', 'QUEDA')
         when 'calor' then jsonb_build_object('override', jsonb_build_object('temp', z.limite_sensacao + 1.5, 'umid', 45),
                                              'override_ate', now() + interval '5 minutes')
         else              jsonb_build_object('override', jsonb_build_object('gas_razao', z.gas_razao_perigo + 0.3),
                                              'override_ate', now() + interval '5 minutes')
       end
   where id = v_dev;

  return public._sim_device(v_dev) || jsonb_build_object('device_id', v_dev);
end;
$$;

-- Cenário fictício do pitch, recriado com data de agora.
-- O capacete01 continua sem "último sinal" (o capacete físico ainda não envia por
-- Wi-Fi), por isso não gera ocorrência de "sem sinal"; o histórico é só ilustrativo.
create or replace function public.preparar_demo_pitch()
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_fim  timestamptz := now() - interval '6 minutes';   -- hora do desmaio
  v_snap jsonb;
  v_id   uuid;
begin
  delete from public.incidents where device_id = 'capacete01';
  delete from public.readings  where device_id = 'capacete01';

  -- turno de 8 h: a sensação térmica sobe de ~31 °C até ~43 °C perto das placas
  insert into public.readings (device_id, zone_id, criado_em, nivel, evento, temperatura, umidade, sensacao,
                               gas_razao, gas_bruto, gas_pronto, aceleracao_g, inclinacao)
  select 'capacete01', 'alto-forno', ts,
         case when s >= 35 then 'ATENCAO' else 'NORMAL' end, null,
         round(t, 1), round(u), round(s, 1),
         round(g, 2), round(g * 900)::int, true, round((1 + (random() - 0.5) * 0.04)::numeric, 2), round((2 + random() * 6)::numeric, 1)
    from generate_series(v_fim - interval '8 hours', v_fim - interval '5 minutes', interval '5 minutes') ts
   cross join lateral (select extract(epoch from (ts - (v_fim - interval '8 hours'))) / 28800.0 as f) p
   cross join lateral (select
       (29.5 + 9.5 * power(p.f, 1.6) + (random() - 0.5) * 0.6)::numeric as t,
       (52 + 10 * p.f + (random() - 0.5) * 3)::numeric as u,
       (1.0 + (random() - 0.5) * 0.06)::numeric as g) v
   cross join lateral (select (v.t + greatest(0, v.u - 40) * 0.08)::numeric as s) w;

  -- última leitura: capacete deitado após o desmaio
  v_snap := jsonb_build_object(
    'temperatura', 39.4, 'umidade', 63, 'sensacao', 43.1,
    'gas_razao', 1.02, 'gas_bruto', 918, 'gas_pronto', true,
    'aceleracao_g', 1.01, 'inclinacao', 84.0,
    'nivel', 'EMERGENCIA', 'evento', 'TRABALHADOR_CAIDO', 'movimento', false,
    'criado_em', v_fim);

  insert into public.readings (device_id, zone_id, criado_em, nivel, evento, temperatura, umidade, sensacao,
                               gas_razao, gas_bruto, gas_pronto, aceleracao_g, inclinacao)
  values ('capacete01', 'alto-forno', v_fim, 'EMERGENCIA', 'TRABALHADOR_CAIDO', 39.4, 63, 43.1, 1.02, 918, true, 1.01, 84.0);

  update public.devices set zone_id = 'alto-forno', ultima_leitura = v_snap, nivel = 'EMERGENCIA'
   where id = 'capacete01';
  update public.workers set ultima_pausa = v_fim - interval '3 hours 40 minutes', checkin = v_fim - interval '8 hours'
   where id = 'w-guilherme';

  insert into public.incidents (worker_id, device_id, zone_id, tipo, severidade, status, detalhe, snapshot,
                                criado_em, reconhecido_em, reconhecido_por)
  values ('w-guilherme', 'capacete01', 'alto-forno', 'caido', 'critico', 'em_atendimento',
          'Desmaio por calor extremo · sensação 43,1 °C', v_snap,
          v_fim, v_fim + interval '38 seconds', 'Operador da sala de controle')
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.simulador_ativo()        from public, anon, authenticated;
revoke execute on function public.preparar_demo_pitch()    from public, anon, authenticated;
revoke execute on function public.definir_simulador(boolean) from public;
grant  execute on function public.definir_simulador(boolean) to anon, authenticated;
grant  execute on function public.simulate_event(text)       to anon, authenticated;
