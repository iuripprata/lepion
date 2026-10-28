# LEPION — Painel de Segurança

Plataforma do capacete inteligente LEPION (ideathon SEBRAE + ArcelorMittal, Desafio 2:
Segurança Inteligente em Áreas Industriais). O capacete com ESP32 envia leituras de queda, impacto,
calor, umidade e gás; a plataforma guarda o log, abre ocorrências e mostra tudo em tempo real.

## Como funciona

- **Front-end** (esta pasta): React + TanStack Start, gerado no Lovable.
- **Banco e regras**: Supabase (projeto `lepion`, região São Paulo). Esquema, regras de alerta, simulador
  e carga inicial estão em [`supabase/migrations`](supabase/migrations).
- **Entrada do capacete**: Edge Function [`supabase/functions/ingest`](supabase/functions/ingest).
  Guia para o firmware: [`docs/INTEGRACAO_ESP32.md`](docs/INTEGRACAO_ESP32.md).
- **Demonstração**: 31 trabalhadores são simulados no próprio banco (uma leitura por minuto) e o
  Guilherme usa o capacete físico `capacete01`. O botão **Simular evento** só afeta os simulados.

O painel está sem login nesta fase do protótipo: ele só lê os dados e executa ações estreitas
(reconhecer, encerrar, registrar pausa, simular). Antes de dados reais de trabalhadores, ative o login.

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/6f9ec1b0-2613-4d32-b638-63b46cb15dc3).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
npm test
```

O app já aponta para o projeto Supabase `lepion`. Para usar outro projeto, defina
`VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`.
