-- LEPION · firmware v3: o capacete passa a mandar o TIPO PROVÁVEL da queda.
-- Campos novos no JSON (todos opcionais; capacetes antigos e o simulador continuam iguais):
--   "detalhe":        texto pronto, ex. "Queda de ~30 cm para o lado, parado: possivel desacordado (4.0 g)"
--   "tipo_queda":     queda_parado | queda_se_mexendo | pancada | queda_lenta | capacete_fora | sos
--   "pico_g", "pico_giro", "queda_livre_ms", "consciente", "score_risco" (0-100), "nota_gas", "nota_calor", "ia_prob" (0-1, IA embarcada)
-- O que muda: o "detalhe" do incidente de queda/impacto/caído/SOS passa a usar o texto do
-- capacete (antes era sempre "Queda detectada"), e esses campos ficam no snapshot da leitura.
-- Marcar incidentes como "falso_positivo" no painel cria a base para calibrar os limiares.
-- Única mudança em relação a 20261028190100_functions.sql: as linhas com v_detalhe e o snapshot.

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
  -- texto do tipo provavel de queda, montado pelo firmware v3 (no maximo 140 caracteres)
  v_detalhe text   := nullif(left(regexp_replace(coalesce(p ->> 'detalhe', ''), '[[:cntrl:]]', '', 'g'), 140), '');
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
    'detalhe', v_detalhe, 'tipo_queda', nullif(left(p ->> 'tipo_queda', 24), ''),
    'pico_g', public._num(p, 'pico_g'), 'pico_giro', public._num(p, 'pico_giro'),
    'queda_livre_ms', public._num(p, 'queda_livre_ms'),
    'score_risco', public._num(p, 'score_risco'), 'nota_gas', public._num(p, 'nota_gas'), 'nota_calor', public._num(p, 'nota_calor'), 'ia_prob', public._num(p, 'ia_prob'),
    'consciente', case when jsonb_typeof(p -> 'consciente') = 'boolean' then (p ->> 'consciente')::boolean end,
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
      'detalhe', coalesce(v_detalhe, case v_evento when 'QUEDA' then 'Queda detectada' when 'IMPACTO' then 'Impacto forte na cabeça'
                               when 'TRABALHADOR_CAIDO' then 'Trabalhador caído' else 'SOS acionado' end));
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
