-- LEPION — correção da carga inicial
-- A primeira versão do seed sorteava zona e cargo numa subconsulta sem relação
-- com a linha; o Postgres avalia isso uma única vez, então quase todos os
-- trabalhadores caíram na mesma zona e com o mesmo cargo. O seed já foi
-- corrigido; esta migração redistribui os dados de um banco já populado.
-- Num banco novo ela apenas sorteia de novo (inofensivo).

update public.workers
   set cargo = (array['Operador de alto-forno','Técnica de manutenção','Operador de ponte rolante','Soldador','Eletricista',
                      'Inspetora de qualidade','Auxiliar de produção','Mecânico','Operador de lingotamento','Técnico de segurança'])
               [1 + floor(random() * 10)::int]
 where id ~ '^w[0-9]+$' and substring(id from 2)::int >= 9;

update public.devices d
   set zone_id = (array['alto-forno','alto-forno','aciaria','aciaria','laminacao','coqueria','patio','manutencao'])
                 [1 + floor(random() * 8)::int]
  from public.workers w
 where w.id = d.worker_id and d.simulado
   and w.id ~ '^w[0-9]+$' and substring(w.id from 2)::int >= 9;

-- perfis de temperatura coerentes com a nova zona (zonas quentes: alto-forno e aciaria)
update public.devices d
   set sim_perfil = sim_perfil || jsonb_build_object('temp',
         case when zone_id in ('alto-forno','aciaria') then round((31 + random() * 1.5)::numeric, 1)
              else round((28 + random() * 1.5)::numeric, 1) end)
  from public.workers w
 where w.id = d.worker_id and d.simulado
   and w.id ~ '^w[0-9]+$' and substring(w.id from 2)::int >= 9
   and not (d.sim_perfil ? 'offline');

-- histórico acompanha a zona do EPI
update public.readings r set zone_id = d.zone_id from public.devices d where d.id = r.device_id and r.zone_id is distinct from d.zone_id;
update public.incidents i set zone_id = d.zone_id from public.devices d where d.id = i.device_id and i.zone_id is distinct from d.zone_id;
