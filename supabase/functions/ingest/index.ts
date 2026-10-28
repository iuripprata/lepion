// LEPION — Edge Function "ingest"
// Recebe o JSON do capacete (firmware capacete_v2, função enviaStatus) por HTTPS.
//
//   POST https://<projeto>.supabase.co/functions/v1/ingest
//   Content-Type: application/json
//   x-device-key: <chave do capacete>
//   {"id":"capacete01","nivel":"NORMAL","evento":"","acel_g":1.01,"inclinacao":3.2,
//    "temp":31.5,"umid":55,"sensacao":33.1,"gas_bruto":812,"gas_razao":1.02,"gas_pronto":true,
//    "bssid":"AA:BB:CC:DD:EE:FF","rssi":-61}          <- bssid, rssi e bateria são opcionais
//
// Toda a regra de negócio fica no banco (public.ingest_device → process_reading),
// a mesma usada pelos trabalhadores simulados.
import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const MAX_BODY = 4096;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const NUMERIC = [
  "acel_g",
  "inclinacao",
  "temp",
  "umid",
  "sensacao",
  "gas_bruto",
  "gas_razao",
  "bateria",
  "rssi",
];

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { ok: false, erro: "use POST" });

  const key = req.headers.get("x-device-key") ?? "";
  if (!key) return json(401, { ok: false, erro: "cabeçalho x-device-key ausente" });

  const raw = await req.text();
  if (raw.length > MAX_BODY) return json(413, { ok: false, erro: "corpo maior que 4 KB" });

  let p: Record<string, unknown>;
  try {
    p = JSON.parse(raw);
  } catch {
    return json(400, { ok: false, erro: "JSON inválido" });
  }
  if (typeof p !== "object" || p === null || Array.isArray(p)) {
    return json(400, { ok: false, erro: "esperado um objeto JSON" });
  }
  if (typeof p.id !== "string" || !ID_RE.test(p.id)) {
    return json(400, { ok: false, erro: "campo id inválido" });
  }
  for (const k of NUMERIC) {
    if (k in p && p[k] !== null && (typeof p[k] !== "number" || !Number.isFinite(p[k] as number))) {
      return json(400, { ok: false, erro: `campo ${k} deve ser numérico` });
    }
  }

  const { data, error } = await supabase.rpc("ingest_device", { p_device: p.id, p_key: key, p });
  if (error) {
    if (error.code === "28000")
      return json(401, { ok: false, erro: "chave do dispositivo inválida" });
    if (error.code === "P0002") return json(404, { ok: false, erro: "dispositivo não cadastrado" });
    console.error("ingest_device falhou", error);
    return json(500, { ok: false, erro: "erro interno" });
  }
  return json(200, data);
});
