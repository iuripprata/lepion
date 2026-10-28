# Integração do capacete (ESP32) com a plataforma LEPION

Este guia é para quem vai implementar o envio por Wi-Fi no firmware `capacete_v2.ino`.
A plataforma já aceita **exatamente o JSON que a função `enviaStatus()` imprime hoje** no Monitor Serial.

## Como os dados fluem

```
Capacete (ESP32)  --HTTPS POST a cada 5 s-->  Edge Function "ingest"  -->  função SQL process_reading
                                                                             |-- grava a leitura (tabela readings)
                                                                             |-- atualiza o EPI (tabela devices)
                                                                             '-- abre / atualiza / encerra incidentes
Painel (navegador)  <--tempo real (Supabase Realtime)-- tabelas devices e incidents
```

As regras de alerta ficam no banco e são as mesmas do firmware v2
(sensação ≥ 35 °C, gás 1,5× / 2× o ar limpo, eventos QUEDA / IMPACTO / TRABALHADOR_CAIDO).
Os trabalhadores simulados passam pela mesma função, então o capacete real e a simulação nunca divergem.

## Endpoint

| Item | Valor |
| --- | --- |
| URL | `https://onbwojqqihuqzofokdfv.supabase.co/functions/v1/ingest` |
| Método | `POST` |
| Cabeçalhos | `Content-Type: application/json` e `x-device-key: <chave do capacete>` |
| Corpo | o JSON do `enviaStatus()` (até 4 KB) |

A chave do `capacete01` foi entregue separadamente. **Não coloque a chave no repositório**: deixe-a num
arquivo `segredos.h` fora do Git (adicione ao `.gitignore`).

### Corpo da requisição

O mesmo JSON do firmware v2, sem mudanças:

```json
{"id":"capacete01","nivel":"NORMAL","evento":"","acel_g":1.01,"inclinacao":3.2,
 "temp":31.5,"umid":55,"sensacao":33.1,"gas_bruto":812,"gas_razao":1.02,"gas_pronto":true}
```

Campos opcionais que a plataforma também entende:

| Campo | Para quê |
| --- | --- |
| `bssid` | Endereço do roteador Wi-Fi conectado (`WiFi.BSSIDstr()`). Define a **zona** do trabalhador no mapa. |
| `rssi` | Força do sinal (`WiFi.RSSI()`), mostrada na tela Dispositivos. |
| `bateria` | 0–100 %, quando houver medição da 18650 (ex.: divisor de tensão num pino ADC). |

Valores `-1.0` em `temp`, `umid` e `sensacao` (falha do DHT11) são tratados como "sem leitura".
Com `gas_pronto: false` (sensor ainda aquecendo) o gás é ignorado.

### Respostas

| Código | Significado |
| --- | --- |
| `200` | Gravado. Ex.: `{"ok":true,"zona":"alto-forno","novos_incidentes":0,"incidentes_abertos":0}` |
| `400` | JSON inválido ou campo numérico com texto |
| `401` | Cabeçalho `x-device-key` ausente ou chave errada |
| `413` | Corpo maior que 4 KB |
| `500` | Erro interno (aparece nos logs da função no Supabase) |

## Recomendações para o envio Wi-Fi

1. **Não envie dentro do `loop()` principal.** Uma requisição HTTPS leva de 200 ms a 1 s. Nesse tempo o MPU6050
   deixaria de ser lido a 100 Hz e a detecção de queda falharia. A ESP32 tem dois núcleos: crie uma tarefa
   FreeRTOS no núcleo 0 só para o envio (`xTaskCreatePinnedToCore`) e passe os dados por uma fila (`xQueueSend`).
   O `loop()` continua no núcleo 1 cuidando dos sensores, LEDs e buzzer.
2. **Frequência:** a cada 5 s em situação normal e **imediatamente quando o `nivel` mudar** (ex.: NORMAL → EMERGENCIA).
   Assim uma queda chega ao painel em cerca de 1 s.
3. **Sem Wi-Fi:** guarde as últimas leituras numa fila circular e reenvie quando voltar. O capacete continua
   avisando o trabalhador com luz e som mesmo offline, porque a lógica de alerta roda nele.
4. **HTTPS:** use `WiFiClientSecure` com o certificado raiz do domínio `supabase.co`. `setInsecure()` só para
   testes rápidos na bancada.
5. **Reaproveite a conexão** (`HTTPClient` com `setReuse(true)`) para não refazer o TLS a cada envio.
6. Depois de 2 minutos sem receber dados, a plataforma marca o EPI como **offline** e abre um incidente.

## Testar sem o capacete

```sh
curl -X POST https://onbwojqqihuqzofokdfv.supabase.co/functions/v1/ingest \
  -H "Content-Type: application/json" \
  -H "x-device-key: COLE_A_CHAVE_AQUI" \
  -d '{"id":"capacete01","nivel":"EMERGENCIA","evento":"QUEDA","acel_g":4.8,"inclinacao":80,"temp":30,"umid":55,"sensacao":31,"gas_bruto":800,"gas_razao":1.0,"gas_pronto":true}'
```

O alerta crítico de queda do Guilherme deve abrir no painel em seguida.

## Tarefas no banco (SQL Editor do Supabase)

**Cadastrar os roteadores Wi-Fi da fábrica** (localização por zona):

```sql
insert into public.access_points (bssid, zone_id, descricao) values
  ('AA:BB:CC:DD:EE:01', 'alto-forno', 'Roteador do alto-forno'),
  ('AA:BB:CC:DD:EE:02', 'aciaria',    'Roteador da aciaria');
```

**Cadastrar um novo capacete** e gerar a chave (a chave aparece só nesta consulta; guarde-a):

```sql
insert into public.workers (id, nome, cargo) values ('w-maria', 'Maria', 'Operadora');
insert into public.devices (id, worker_id, zone_id) values ('capacete02', 'w-maria', 'aciaria');
select public.rotate_device_key('capacete02');
```

**Trocar a chave** de um capacete (a anterior deixa de funcionar na hora):

```sql
select public.rotate_device_key('capacete01');
```

**Ajustar os limites de uma zona** (os mesmos nomes das constantes do firmware):

```sql
update public.zones set limite_sensacao = 34, gas_razao_atencao = 1.4 where id = 'coqueria';
```

## Limites do plano gratuito do Supabase

- O projeto **pausa após cerca de 7 dias sem acesso**. Abra o painel alguns dias antes da apresentação.
- 500 MB de banco. Um capacete enviando a cada 5 s gera ~17 mil leituras por dia; uma rotina apaga
  leituras com mais de 90 dias, todo dia às 03:17.

## Segurança nesta fase

- O painel está **sem login**: quem tiver o link vê os dados e pode reconhecer ou encerrar alertas e simular eventos.
  Pelo navegador ninguém apaga dados, grava leituras ou lê as chaves dos EPIs.
- Antes de usar com trabalhadores reais, ative login e restrinja as políticas de acesso (LGPD).
