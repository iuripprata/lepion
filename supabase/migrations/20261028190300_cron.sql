-- LEPION — rotinas automáticas
--  * a cada minuto: simula os EPIs sem capacete físico e detecta EPIs sem sinal
--  * todo dia às 03:17: apaga leituras com mais de 90 dias (o banco gratuito tem 500 MB)
create extension if not exists pg_cron;

select cron.schedule('lepion-minuto', '* * * * *', $$select public.lepion_minuto()$$);
select cron.schedule('lepion-limpeza', '17 6 * * *',  -- 06:17 UTC = 03:17 em São Paulo
  $$delete from public.readings where criado_em < now() - interval '90 days'$$);
