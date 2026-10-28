-- LEPION — carga inicial de demonstração
-- 6 zonas, 31 trabalhadores simulados (mesmos nomes e cenários da versão
-- Lovable) e o Guilherme, que usa o capacete físico "capacete01".
-- Gera também histórico: leituras das últimas 12 semanas (a cada 3 h),
-- das últimas 8 h (a cada 5 min) e ~220 incidentes resolvidos em 6 meses.

select setseed(0.42);

insert into public.zones (id, nome, gateway_id, ordem) values
  ('alto-forno', 'Alto-forno',               'G1', 1),
  ('aciaria',    'Aciaria',                  'G2', 2),
  ('laminacao',  'Laminação',                'G3', 3),
  ('coqueria',   'Coqueria',                 'G4', 4),
  ('patio',      'Pátio de matérias-primas', 'G5', 5),
  ('manutencao', 'Manutenção',               'G6', 6);

-- Trabalhadores simulados -----------------------------------------------------
with nomes(i, nome) as (
  select ord - 1, nome from unnest(array[
    'Carlos Menezes','Ana Ribeiro','João Batista','Marcos Lima','Paulo Sérgio','Rita Alves','Lucas Pereira',
    'Bruno Matos','Fernanda Costa','Rafael Souza','Juliana Rocha','Diego Martins','Patrícia Gomes','André Carvalho',
    'Camila Nunes','Thiago Barros','Larissa Freitas','Gustavo Teixeira','Mariana Dias','Felipe Moreira','Aline Cardoso',
    'Eduardo Ramos','Beatriz Lopes','Rodrigo Pinto','Vanessa Melo','Sérgio Araújo','Daniela Castro','Henrique Vieira',
    'Priscila Santos','Leandro Fonseca','Tatiana Reis']) with ordinality as t(nome, ord)
),
cargos as (
  select array['Operador de alto-forno','Técnica de manutenção','Operador de ponte rolante','Soldador','Eletricista',
               'Inspetora de qualidade','Auxiliar de produção','Mecânico','Operador de lingotamento','Técnico de segurança'] as c
),
dist as (select array['alto-forno','alto-forno','aciaria','aciaria','laminacao','coqueria','patio','manutencao'] as z)
insert into public.workers (id, nome, cargo, turno, supervisor, checkin, ultima_pausa)
select 'w' || (i + 1), nome,
       case when i < 7 then (select c[i + 1] from cargos)
            when i = 7 then 'Supervisor de turno'
            -- expressão direta (não subconsulta) para sortear um cargo por linha
            else (array['Operador de alto-forno','Técnica de manutenção','Operador de ponte rolante','Soldador','Eletricista',
                        'Inspetora de qualidade','Auxiliar de produção','Mecânico','Operador de lingotamento','Técnico de segurança'])
                 [1 + floor(random() * 10)::int] end,
       case when i < 26 then 'A' else 'B' end,
       i = 7,
       date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
         + interval '6 hours' + (floor(random() * 20) || ' minutes')::interval,
       now() - ((30 + floor(random() * 120)) || ' minutes')::interval
  from nomes;

with fixed(i, z) as (values (0,'alto-forno'),(1,'aciaria'),(2,'aciaria'),(3,'coqueria'),(4,'laminacao'),(5,'patio'),(6,'patio'),(7,'alto-forno')),
base as (
  select w.id as worker_id, (substring(w.id from 2))::int - 1 as i
    from public.workers w where w.id ~ '^w[0-9]+$'
)
insert into public.devices (id, worker_id, tipo, zone_id, simulado, sim_perfil, bateria, rssi, ultimo_sinal_em, ultima_calibracao_gas)
select 'EPI-' || lpad((142 + b.i * 3)::text, 4, '0'),
       b.worker_id,
       case when random() > 0.3 then 'capacete' else 'traje' end,
       -- expressão direta (não subconsulta) para sortear uma zona por linha
       coalesce((select z from fixed f where f.i = b.i),
                (array['alto-forno','alto-forno','aciaria','aciaria','laminacao','coqueria','patio','manutencao'])[1 + floor(random() * 8)::int]),
       true,
       '{}'::jsonb,
       40 + floor(random() * 58)::int,
       -45 - floor(random() * 30)::int,
       now(),
       (now() - (floor(random() * 170) || ' days')::interval)::date
  from base b;

-- Perfis de simulação: valores de base em torno dos quais as leituras variam
update public.devices set sim_perfil = jsonb_build_object(
  'temp', case when zone_id in ('alto-forno','aciaria') then round((31 + random() * 1.5)::numeric, 1)
               else round((28 + random() * 1.5)::numeric, 1) end,
  'umid', 46 + floor(random() * 10),
  'gas_razao', round((0.95 + random() * 0.15)::numeric, 2))
 where simulado;

-- Cenários da demonstração (os mesmos da versão Lovable)
update public.devices set sim_perfil = sim_perfil || '{"temp":38.4,"umid":52}' where worker_id = 'w2';  -- Ana: calor
update public.devices set sim_perfil = sim_perfil || '{"temp":36.4,"umid":50}' where worker_id = 'w3';  -- João: calor
update public.devices set sim_perfil = sim_perfil || '{"gas_razao":1.62}', ultima_calibracao_gas = (now() - interval '210 days')::date
 where worker_id = 'w4';                                                                                -- Marcos: gás + calibração vencida
update public.devices set sim_perfil = sim_perfil || '{"umid":22}' where worker_id = 'w5';              -- Paulo: ar seco
update public.devices set sim_perfil = sim_perfil || '{"offline":true}', ultimo_sinal_em = now() - interval '6 minutes'
 where worker_id = 'w6';                                                                                -- Rita: sem sinal
update public.devices set sim_perfil = sim_perfil || '{"offline":true}', bateria = 3, ultimo_sinal_em = now() - interval '4 minutes'
 where worker_id = 'w21';                                                                               -- Aline: bateria esgotada

-- Guilherme + capacete físico --------------------------------------------------
insert into public.workers (id, nome, cargo, turno, checkin, ultima_pausa)
values ('w-guilherme', 'Guilherme', 'Operador — capacete protótipo LEPION', 'A', now(), now());

insert into public.devices (id, worker_id, tipo, zone_id, simulado, ultima_calibracao_gas)
values ('capacete01', 'w-guilherme', 'capacete', 'alto-forno', false, current_date);

-- Histórico de leituras dos simulados -----------------------------------------
-- 12 semanas, uma leitura a cada 3 h (base do gráfico semanal de calor)
insert into public.readings (device_id, zone_id, criado_em, nivel, evento, temperatura, umidade, sensacao, gas_razao, gas_bruto, gas_pronto, aceleracao_g, inclinacao)
select d.id, d.zone_id, ts, 'NORMAL', null,
       round(t, 1), round(u), round(t + greatest(0, u - 40) * 0.08, 1),
       round(g, 2), round(g * 900)::int, true, 1.0, 3
  from public.devices d
 cross join generate_series(now() - interval '84 days', now() - interval '8 hours', interval '3 hours') ts
 cross join lateral (select
     -- leve tendência de aquecimento ao longo das semanas + ciclo do dia
     (coalesce((d.sim_perfil->>'temp')::numeric, 30) - 2.5
       + extract(epoch from (ts - (now() - interval '84 days'))) / 86400 / 84 * 2.2
       + 1.5 * sin(extract(hour from ts at time zone 'America/Sao_Paulo') / 24 * 2 * pi() - pi() / 2)
       + (random() - 0.5))::numeric as t,
     (coalesce((d.sim_perfil->>'umid')::numeric, 50) + (random() - 0.5) * 6)::numeric as u,
     greatest(0.5, 1.0 + (random() - 0.5) * 0.1)::numeric as g) v
 where d.simulado;

-- Últimas 8 h, a cada 5 min (gráfico do turno no perfil do trabalhador)
insert into public.readings (device_id, zone_id, criado_em, nivel, evento, temperatura, umidade, sensacao, gas_razao, gas_bruto, gas_pronto, aceleracao_g, inclinacao)
select d.id, d.zone_id, ts, 'NORMAL', null,
       round(t, 1), round(u), round(t + greatest(0, u - 40) * 0.08, 1),
       round(g, 2), round(g * 900)::int, true, round((1 + (random() - 0.5) * 0.04)::numeric, 2), round((random() * 8)::numeric, 1)
  from public.devices d
 cross join generate_series(now() - interval '8 hours', now() - interval '5 minutes', interval '5 minutes') ts
 cross join lateral (select
     -- os cenários de calor sobem ao longo do turno
     (coalesce((d.sim_perfil->>'temp')::numeric, 30) - 3
       + extract(epoch from (ts - (now() - interval '8 hours'))) / 28800 * 3
       + (random() - 0.5) * 0.8)::numeric as t,
     (coalesce((d.sim_perfil->>'umid')::numeric, 50) + (random() - 0.5) * 4)::numeric as u,
     greatest(0.5, coalesce((d.sim_perfil->>'gas_razao')::numeric, 1.0) + (random() - 0.5) * 0.06)::numeric as g) v
 where d.simulado
   and (not coalesce((d.sim_perfil->>'offline')::boolean, false) or ts < d.ultimo_sinal_em);

-- Incidentes históricos (6 meses), todos já encerrados -------------------------
insert into public.incidents (worker_id, device_id, zone_id, tipo, severidade, status, detalhe, criado_em,
                              reconhecido_em, reconhecido_por, resolvido_em, resolvido_por)
select d.worker_id, d.id, d.zone_id, x.tipo,
       case when x.tipo in ('queda','impacto','caido') then 'critico'
            when x.tipo = 'gas' and random() < 0.3 then 'critico' else 'atencao' end,
       case when random() < 0.09 then 'falso_positivo' else 'resolvido' end,
       case x.tipo when 'calor' then 'Calor · sensação ' || replace(round((35.5 + random() * 4)::numeric, 1)::text, '.', ',') || ' °C'
                   when 'gas' then 'Gás · ' || replace(round((1.5 + random() * 0.8)::numeric, 1)::text, '.', ',') || '× o ar limpo'
                   when 'ar_seco' then 'Ar seco · umidade ' || (18 + floor(random() * 10)) || '%'
                   when 'queda' then 'Queda detectada'
                   when 'impacto' then 'Impacto forte na cabeça'
                   when 'caido' then 'Trabalhador caído'
                   when 'bateria' then 'Bateria ' || (3 + floor(random() * 6)) || '%'
                   else 'Sem sinal' end,
       x.t,
       x.t + x.resp,
       'Operador da sala de controle',
       x.t + x.resp + interval '10 minutes',
       'Operador da sala de controle'
  from generate_series(1, 220) k
 cross join lateral (
   select (array['calor','calor','calor','calor','gas','ar_seco','queda','impacto','caido','bateria','offline'])
            [1 + floor(random() * 11)::int] as tipo,
          -- mais ocorrências nos meses antigos: o painel mostra a queda ao longo do tempo
          now() - interval '1 hour' - (power(random(), 0.8) * 180 || ' days')::interval as t,
          ((15 + floor(random() * 90)) || ' seconds')::interval as resp,
          k as kk) x
 cross join lateral (select * from public.devices dd where dd.simulado and dd.id <> 'EPI-0000' || x.kk
                      order by random() limit 1) d;

-- Primeira rodada do simulador: gera o estado atual e os incidentes em aberto
select public.simulate_tick();
select public.check_offline();
