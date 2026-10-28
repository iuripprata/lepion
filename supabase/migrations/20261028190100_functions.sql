-- LEPION — regras de alerta, ingestão, simulador e ações do painel
--
-- Uma única função (process_reading) aplica as regras a qualquer leitura, venha
-- ela do capacete real (via Edge Function "ingest") ou do simulador. Assim o
-- capacete físico e os trabalhadores simulados nunca divergem.
--
-- Formato de entrada = JSON do firmware capacete_v2 (enviaStatus), mais campos
-- opcionais: bssid, rssi, bateria, zona.
--   {"id":"capacete01","nivel":"NORMAL","evento":"","acel_g":1.01,"inclinacao":3.2,
--    "temp":31.5,"umid":55,"sensacao":33.1,"gas_bruto":812,"gas_razao":1.02,"gas_pronto":true}

-- número de um campo JSON, ou null se ausente/não numérico
create or replace function public._num(p jsonb, k text)
returns numeric language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p -> k) = 'number' then (p ->> k)::numeric else null end
$$;

-- formata 39.8 como "39,8"
create or replace function public._br(v numeric, casas int default 1)
returns text language sql immutable set search_path = '' as $$
  select replace(round(v, casas)::text, '.', ',')
$$;

-- ---------------------------------------------------------------------------
-- Núcleo: grava a leitura, atualiza o EPI e abre/atualiza/encerra incidentes
-- ---------------------------------------------------------------------------
create or replace function public.process_reading(p_device text, p jsonb, p_at timestamptz default now())
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  d        public.devices%rowtype;
  z        public.zones%rowtype;
  v_zone   text;
  v_temp   numeric := public._num(p, 'temp');
  v_umid   numeric := public._num(p, 'umid');
  v_sens   numeric := public._num(p, 'sensacao');
  v_razao  numeric := public._num(p, 'gas_razao');
  v_bruto  int     := public._num(p, 'gas_bruto')::int;
  v_pronto boolean := coalesce(case when jsonb_typeof(p -> 'gas_pronto') = 'boolean' then (p ->> 'gas_pronto')::boolean end, false);
  v_acel   numeric := public._num(p, 'acel_g');
  v_incl   numeric := public._num(p, 'inclinacao');
  v_bat    int     := public._num(p, 'bateria')::int;
  v_rssi   int     := public._num(p, 'rssi')::int;
  v_bssid  text    := upper(nullif(trim(p ->> 'bssid'), ''));
  v_nivel  text    := upper(nullif(trim(p ->> 'nivel'), ''));
  v_evento text    := upper(nullif(trim(p ->> 'evento'), ''));
  v_calor  numeric;
  v_snap   jsonb;
  v_conds  jsonb := '[]'::jsonb;
  v_open   public.incidents%rowtype;
  v_new    int := 0;
  c        record;
begin
  select * into d from public.devices where id = p_device for update;
  if not found then
    raise exception 'dispositivo desconhecido: %', p_device using errcode = 'P0002';
  end if;

  -- O firmware envia -1 quando o DHT11 falha
  if v_temp < -0.5 then v_temp := null; end if;
  if v_umid < -0.5 then v_umid := null; end if;
  if v_sens < -0.5 then v_sens := null; end if;
  if v_bat is not null and (v_bat < 0 or v_bat > 100) then v_bat := null; end if;

  -- Zona: pelo roteador Wi-Fi (BSSID); senão pelo campo "zona"; senão mantém a atual
  v_zone := coalesce(
    (select zone_id from public.access_points where bssid = v_bssid),
    (select id from public.zones where id = p ->> 'zona'),
    d.zone_id);
  select * into z from public.zones where id = v_zone;

  v_snap := jsonb_strip_nulls(jsonb_build_object(
    'temperatura', v_temp, 'umidade', v_umid, 'sensacao', v_sens,
    'gas_razao', v_razao, 'gas_bruto', v_bruto, 'gas_pronto', v_pronto,
    'aceleracao_g', v_acel, 'inclinacao', v_incl,
    'nivel', v_nivel, 'evento', v_evento,
    'movimento', v_evento is null,
    'criado_em', p_at));

  insert into public.readings (device_id, zone_id, criado_em, nivel, evento, temperatura, umidade, sensacao,
                               gas_razao, gas_bruto, gas_pronto, aceleracao_g, inclinacao, bateria, rssi)
  values (p_device, v_zone, p_at, v_nivel, v_evento, v_temp, v_umid, v_sens,
          v_razao, v_bruto, v_pronto, v_acel, v_incl, v_bat, v_rssi);

  update public.devices set
    zone_id         = v_zone,
    ultimo_sinal_em = p_at,
    nivel           = v_nivel,
    bssid           = coalesce(v_bssid, bssid),
    rssi            = coalesce(v_rssi, rssi),
    bateria         = coalesce(v_bat, bateria),
    ultima_leitura  = v_snap
  where id = p_device;

  -- ---------------- Regras (iguais às do firmware v2) ----------------
  if v_evento in ('QUEDA', 'IMPACTO', 'TRABALHADOR_CAIDO', 'SOS') then
    v_conds := v_conds || jsonb_build_object(
      'tipo', case v_evento when 'QUEDA' then 'queda' when 'IMPACTO' then 'impacto'
                            when 'TRABALHADOR_CAIDO' then 'caido' else 'sos' end,
      'sev', 'critico',
      'detalhe', case v_evento when 'QUEDA' then 'Queda detectada' when 'IMPACTO' then 'Impacto forte na cabeça'
                               when 'TRABALHADOR_CAIDO' then 'Trabalhador caído' else 'SOS acionado' end);
  end if;

  v_calor := coalesce(v_sens, v_temp);
  if v_calor is not null and v_calor >= z.limite_sensacao then
    v_conds := v_conds || jsonb_build_object('tipo', 'calor', 'sev', 'atencao',
      'detalhe', 'Calor · sensação ' || public._br(v_calor) || ' °C');
  end if;

  if v_pronto and v_razao is not null then
    if v_razao >= z.gas_razao_perigo then
      v_conds := v_conds || jsonb_build_object('tipo', 'gas', 'sev', 'critico',
        'detalhe', 'Gás · ' || public._br(v_razao, 1) || '× o ar limpo (evacuar)');
    elsif v_razao >= z.gas_razao_atencao then
      v_conds := v_conds || jsonb_build_object('tipo', 'gas', 'sev', 'atencao',
        'detalhe', 'Gás · ' || public._br(v_razao, 1) || '× o ar limpo');
    end if;
  end if;

  if v_umid is not null and v_umid < z.limite_umidade_min then
    v_conds := v_conds || jsonb_build_object('tipo', 'ar_seco', 'sev', 'atencao',
      'detalhe', 'Ar seco · umidade ' || round(v_umid) || '%');
  end if;

  if coalesce(v_bat, d.bateria) < 10 then
    v_conds := v_conds || jsonb_build_object('tipo', 'bateria', 'sev', 'atencao',
      'detalhe', 'Bateria ' || coalesce(v_bat, d.bateria) || '%');
  end if;

  -- ---------------- Abre, atualiza ou reabre incidentes ----------------
  for c in select x ->> 'tipo' as tipo, x ->> 'sev' as sev, x ->> 'detalhe' as detalhe
           from jsonb_array_elements(v_conds) x
  loop
    select * into v_open from public.incidents
     where device_id = p_device and tipo = c.tipo and status in ('aberto', 'em_atendimento')
     order by criado_em desc limit 1;
    if found then
      -- já existe um aberto: só sobe a severidade (ex.: gás de atenção para perigo)
      if v_open.severidade = 'atencao' and c.sev = 'critico' then
        update public.incidents set severidade = 'critico', detalhe = c.detalhe, snapshot = v_snap where id = v_open.id;
      end if;
      continue;
    end if;

    if c.tipo in ('queda', 'impacto', 'caido', 'sos') then
      -- o firmware repete o evento enquanto a emergência dura: um incidente por evento
      if exists (select 1 from public.incidents
                  where device_id = p_device and tipo = c.tipo and criado_em > p_at - interval '60 seconds') then
        continue;
      end if;
    else
      -- condição que oscila no limite: reabre o incidente encerrado pelo sistema há pouco
      update public.incidents set status = 'aberto', resolvido_em = null, resolvido_por = null,
                                  severidade = c.sev, detalhe = c.detalhe, snapshot = v_snap
       where id = (select id from public.incidents
                    where device_id = p_device and tipo = c.tipo and resolvido_por = 'sistema'
                      and resolvido_em > p_at - interval '5 minutes'
                    order by resolvido_em desc limit 1);
      if found then continue; end if;
    end if;

    insert into public.incidents (worker_id, device_id, zone_id, tipo, severidade, detalhe, snapshot, criado_em)
    values (d.worker_id, p_device, v_zone, c.tipo, c.sev, c.detalhe, v_snap, p_at);
    v_new := v_new + 1;
  end loop;

  -- Condições que voltaram ao normal são encerradas pelo sistema.
  -- Queda, impacto, caído e SOS nunca se encerram sozinhos: exigem o operador.
  update public.incidents set status = 'resolvido', resolvido_em = p_at, resolvido_por = 'sistema'
   where device_id = p_device and status in ('aberto', 'em_atendimento')
     and tipo in ('calor', 'gas', 'ar_seco', 'bateria', 'offline')
     and not (v_conds @> jsonb_build_array(jsonb_build_object('tipo', tipo)));

  return jsonb_build_object(
    'ok', true,
    'zona', v_zone,
    'novos_incidentes', v_new,
    'incidentes_abertos', (select count(*) from public.incidents
                            where device_id = p_device and status in ('aberto', 'em_atendimento')));
end;
$$;

-- ---------------------------------------------------------------------------
-- Entrada do capacete real: valida a chave do EPI e processa a leitura.
-- Chamada só pela Edge Function "ingest" (service_role).
-- ---------------------------------------------------------------------------
create or replace function public.ingest_device(p_device text, p_key text, p jsonb)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists (select 1 from public.device_keys
                  where device_id = p_device
                    and key_hash = encode(extensions.digest(coalesce(p_key, ''), 'sha256'), 'hex')) then
    raise exception 'chave do dispositivo inválida' using errcode = '28000';
  end if;
  return public.process_reading(p_device, p);
end;
$$;

-- Gera (ou troca) a chave de um EPI e devolve a chave em texto UMA vez.
create or replace function public.rotate_device_key(p_device text)
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_key text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  if not exists (select 1 from public.devices where id = p_device) then
    raise exception 'dispositivo desconhecido: %', p_device;
  end if;
  insert into public.device_keys (device_id, key_hash)
  values (p_device, encode(extensions.digest(v_key, 'sha256'), 'hex'))
  on conflict (device_id) do update set key_hash = excluded.key_hash, criado_em = now();
  return v_key;
end;
$$;

-- ---------------------------------------------------------------------------
-- Simulador dos trabalhadores sem capacete físico (roda a cada minuto)
-- sim_perfil: {"temp":31,"umid":50,"gas_razao":1.0,"offline":false,
--              "override":{...},"override_ate":"<ts>","evento_unico":"QUEDA"}
-- ---------------------------------------------------------------------------
create or replace function public._sim_device(p_device text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  d  public.devices%rowtype;
  pf jsonb;
  t numeric; u numeric; g numeric; s numeric;
  v_evento text;
begin
  select * into d from public.devices where id = p_device;
  pf := d.sim_perfil;
  if pf ? 'override' and (pf ->> 'override_ate')::timestamptz > now() then
    pf := pf || (pf -> 'override');
  end if;
  v_evento := pf ->> 'evento_unico';
  if v_evento is not null then
    update public.devices set sim_perfil = sim_perfil - 'evento_unico' where id = p_device;
  end if;

  t := coalesce((pf ->> 'temp')::numeric, 30) + (random() - 0.5) * 0.6;
  u := coalesce((pf ->> 'umid')::numeric, 50) + (random() - 0.5) * 3;
  g := greatest(0.5, coalesce((pf ->> 'gas_razao')::numeric, 1.0) + (random() - 0.5) * 0.06);
  s := t + greatest(0, u - 40) * 0.08;  -- aproximação da sensação térmica

  return public.process_reading(p_device, jsonb_build_object(
    'id', p_device,
    'nivel', case when v_evento is not null then 'EMERGENCIA' else 'NORMAL' end,
    'evento', coalesce(v_evento, ''),
    'acel_g', case when v_evento is not null then 4.6 else round((1 + (random() - 0.5) * 0.04)::numeric, 2) end,
    'inclinacao', case when v_evento is not null then 82 else round((random() * 8)::numeric, 1) end,
    'temp', round(t, 1), 'umid', round(u), 'sensacao', round(s, 1),
    'gas_bruto', round(g * 900), 'gas_razao', round(g, 2), 'gas_pronto', true,
    'zona', d.zone_id));
end;
$$;

create or replace function public.simulate_tick()
returns int
language plpgsql security definer set search_path = public, extensions as $$
declare r record; n int := 0;
begin
  for r in select id from public.devices
            where simulado and not coalesce((sim_perfil ->> 'offline')::boolean, false)
  loop
    perform public._sim_device(r.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- EPIs sem sinal há mais de 2 minutos viram incidente "offline"
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
  perform public.simulate_tick();
  perform public.check_offline();
end;
$$;

-- ---------------------------------------------------------------------------
-- Ações do painel (sem login nesta fase): funções estreitas e validadas.
-- ---------------------------------------------------------------------------
create or replace function public._quem(p_por text)
returns text language sql immutable set search_path = '' as $$
  select left(coalesce(nullif(trim(p_por), ''), 'Operador da sala de controle'), 80)
$$;

create or replace function public.reconhecer_incidente(p_id uuid, p_por text default null)
returns void
language sql security definer set search_path = public as $$
  update public.incidents
     set reconhecido_em  = coalesce(reconhecido_em, now()),
         reconhecido_por = coalesce(reconhecido_por, public._quem(p_por))
   where id = p_id;
$$;

create or replace function public.atualizar_incidente(p_id uuid, p_status text, p_por text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('em_atendimento', 'resolvido', 'falso_positivo') then
    raise exception 'status inválido: %', p_status;
  end if;
  update public.incidents
     set status          = p_status,
         reconhecido_em  = coalesce(reconhecido_em, now()),
         reconhecido_por = coalesce(reconhecido_por, public._quem(p_por)),
         resolvido_em    = case when p_status in ('resolvido', 'falso_positivo') then now() else resolvido_em end,
         resolvido_por   = case when p_status in ('resolvido', 'falso_positivo') then public._quem(p_por) else resolvido_por end
   where id = p_id;
end;
$$;

create or replace function public.registrar_pausa(p_worker text)
returns void
language sql security definer set search_path = public as $$
  update public.workers set ultima_pausa = now() where id = p_worker;
$$;

-- Botão "Simular evento" (modo demonstração): só afeta EPIs simulados.
create or replace function public.simulate_event(p_tipo text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_dev text;
  z public.zones%rowtype;
begin
  if p_tipo not in ('queda', 'calor', 'gas') then
    raise exception 'tipo inválido: %', p_tipo;
  end if;
  -- limite simples contra cliques repetidos
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

-- ---------------------------------------------------------------------------
-- Consultas para os gráficos (respeitam a RLS: security invoker)
-- ---------------------------------------------------------------------------
create or replace function public.historico_dispositivo(p_device text, p_horas int default 8)
returns table (t timestamptz, temperatura numeric, sensacao numeric, umidade numeric, gas_razao numeric)
language sql stable set search_path = public as $$
  select to_timestamp(floor(extract(epoch from criado_em) / 300) * 300) as t,
         round(avg(temperatura), 1), round(avg(sensacao), 1), round(avg(umidade)), round(avg(gas_razao), 2)
    from public.readings
   where device_id = p_device
     and criado_em > now() - make_interval(hours => least(greatest(p_horas, 1), 48))
   group by 1 order by 1
$$;

create or replace function public.indice_calor_semanal(p_semanas int default 12)
returns table (semana date, media numeric)
language sql stable set search_path = public as $$
  select date_trunc('week', criado_em at time zone 'America/Sao_Paulo')::date,
         round(avg(coalesce(sensacao, temperatura)), 1)
    from public.readings
   where criado_em > now() - make_interval(weeks => least(greatest(p_semanas, 1), 26))
   group by 1 order by 1
$$;

-- ---------------------------------------------------------------------------
-- Permissões: tudo fechado; o painel só executa as funções abaixo.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.reconhecer_incidente(uuid, text)    to anon, authenticated;
grant execute on function public.atualizar_incidente(uuid, text, text) to anon, authenticated;
grant execute on function public.registrar_pausa(text)               to anon, authenticated;
grant execute on function public.simulate_event(text)                to anon, authenticated;
grant execute on function public.historico_dispositivo(text, int)    to anon, authenticated;
grant execute on function public.indice_calor_semanal(int)           to anon, authenticated;

grant execute on function public.ingest_device(text, text, jsonb)    to service_role;
grant execute on function public.rotate_device_key(text)             to service_role;
