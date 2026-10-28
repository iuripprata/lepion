import { createClient } from "@supabase/supabase-js";

// Projeto Supabase "lepion" (região São Paulo).
// A chave publicável é feita para ficar no navegador: o banco só permite leitura
// e as ações estreitas definidas em supabase/migrations (RLS + funções RPC).
// Para apontar para outro projeto, defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.
const url = import.meta.env["VITE_SUPABASE_URL"] ?? "https://onbwojqqihuqzofokdfv.supabase.co";
const key =
  import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ??
  "sb_publishable_skTujb9Kf-LNZxIT0ZYazA_f6XbdIL5";

export const supabase = createClient(url, key, {
  auth: { persistSession: false },
  realtime: { params: { eventsPerSecond: 20 } },
});
