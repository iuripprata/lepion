import { useSyncExternalStore } from "react";
import { supabase } from "./supabase";

// ---------------------------------------------------------------------------
// Tipos (espelham as tabelas do Supabase; horários em milissegundos)
// ---------------------------------------------------------------------------
export type Sev = "ok" | "atencao" | "critico" | "offline";
export type IncType =
  "queda" | "impacto" | "caido" | "sos" | "calor" | "gas" | "ar_seco" | "bateria" | "offline";
export type IncStatus = "aberto" | "em_atendimento" | "resolvido" | "falso_positivo";

export interface Zone {
  id: string;
  nome: string;
  gateway_id: string;
  ordem: number;
  limite_sensacao: number;
  gas_razao_atencao: number;
  gas_razao_perigo: number;
  limite_umidade_min: number;
}
export interface Worker {
  id: string;
  nome: string;
  cargo: string;
  turno: "A" | "B" | "C";
  supervisor: boolean;
  checkin: number | null;
  ultima_pausa: number | null;
  device_id: string;
  zone_id: string; // derivados do EPI vinculado
}
export interface Device {
  id: string;
  worker_id: string | null;
  tipo: "capacete" | "traje";
  zone_id: string;
  simulado: boolean;
  bateria: number | null;
  rssi: number | null;
  ultimo_sinal_em: number | null;
  ultima_calibracao_gas: number | null;
}
export interface Reading {
  temperatura?: number;
  umidade?: number;
  sensacao?: number;
  gas_razao?: number;
  gas_bruto?: number;
  gas_pronto?: boolean;
  aceleracao_g?: number;
  inclinacao?: number;
  movimento?: boolean;
  nivel?: string;
  evento?: string;
  criado_em?: number;
}
export interface Incident {
  id: string;
  worker_id: string;
  device_id: string;
  zone_id: string;
  tipo: IncType;
  severidade: "atencao" | "critico";
  status: IncStatus;
  detalhe: string;
  snapshot: Reading;
  criado_em: number;
  reconhecido_em?: number | undefined;
  reconhecido_por?: string | undefined;
  resolvido_em?: number | undefined;
  resolvido_por?: string | undefined;
}
export interface HistPoint {
  t: number;
  temperatura: number | null;
  sensacao: number | null;
  umidade: number | null;
  gas_razao: number | null;
}

export interface State {
  ready: boolean;
  error: string | null;
  live: boolean;
  now: number;
  zones: Zone[];
  workers: Worker[];
  devices: Record<string, Device>;
  current: Record<string, Reading>;
  history: Record<string, HistPoint[]>;
  heatWeekly: { semana: number; media: number }[];
  incidents: Incident[]; // mais recentes primeiro
  simuladorAtivo: boolean; // com o simulador desligado, os trabalhadores simulados ficam escondidos
  muted: boolean;
  shift: "todos" | "A" | "B" | "C";
  zoneFilter: string;
}

const MIN = 60_000;
export const OFFLINE_MS = 2 * MIN;
const OPEN: IncStatus[] = ["aberto", "em_atendimento"];
const EVENTOS: IncType[] = ["queda", "impacto", "caido", "sos"];

const EMPTY_ZONE: Zone = {
  id: "",
  nome: "—",
  gateway_id: "—",
  ordem: 99,
  limite_sensacao: 35,
  gas_razao_atencao: 1.5,
  gas_razao_perigo: 2,
  limite_umidade_min: 30,
};

let state: State = {
  ready: false,
  error: null,
  live: false,
  now: Date.now(),
  zones: [],
  workers: [],
  devices: {},
  current: {},
  history: {},
  heatWeekly: [],
  incidents: [],
  simuladorAtivo: true,
  muted: false,
  shift: "todos",
  zoneFilter: "todas",
};

// ---------------------------------------------------------------------------
// Assinatura (mesma API que as telas já usavam: useSim / getState)
// ---------------------------------------------------------------------------
const subs = new Set<() => void>();
let pending = false;
function emit() {
  if (pending) return;
  pending = true;
  // agrupa várias mudanças do tempo real numa única renderização
  setTimeout(() => {
    pending = false;
    state = { ...state };
    subs.forEach((f) => f());
  }, 30);
}
const subscribe = (f: () => void) => (subs.add(f), () => subs.delete(f));
export const useSim = <T>(sel: (s: State) => T) =>
  useSyncExternalStore(
    subscribe,
    () => sel(state),
    () => sel(state),
  );
export const getState = () => state;
/** Só para testes. */
export const __setState = (s: Partial<State>) => {
  state = { ...state, ...s };
};

// ---------------------------------------------------------------------------
// Conversão das linhas do banco
// ---------------------------------------------------------------------------
// colunas conhecidas (evita índices genéricos, exigido pelo tsconfig)
type Col =
  | "id"
  | "nome"
  | "gateway_id"
  | "ordem"
  | "limite_sensacao"
  | "gas_razao_atencao"
  | "gas_razao_perigo"
  | "limite_umidade_min"
  | "worker_id"
  | "tipo"
  | "zone_id"
  | "simulado"
  | "bateria"
  | "rssi"
  | "ultimo_sinal_em"
  | "ultima_calibracao_gas"
  | "ultima_leitura"
  | "temperatura"
  | "umidade"
  | "sensacao"
  | "gas_razao"
  | "gas_bruto"
  | "gas_pronto"
  | "aceleracao_g"
  | "inclinacao"
  | "movimento"
  | "nivel"
  | "evento"
  | "criado_em"
  | "cargo"
  | "turno"
  | "supervisor"
  | "checkin"
  | "ultima_pausa"
  | "device_id"
  | "severidade"
  | "status"
  | "detalhe"
  | "snapshot"
  | "reconhecido_em"
  | "reconhecido_por"
  | "resolvido_em"
  | "resolvido_por"
  | "semana"
  | "media"
  | "simulador_ativo"
  | "t";
type Row = Partial<Record<Col, unknown>>;
const ms = (v: unknown) => (v ? Date.parse(String(v)) : null);
// coluna "date" (sem hora): meio-dia em São Paulo, para não virar o dia anterior no fuso -03:00
const day = (v: unknown) => (v ? Date.parse(`${String(v).slice(0, 10)}T12:00:00-03:00`) : null);
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export function toZone(r: Row): Zone {
  return {
    id: String(r.id),
    nome: String(r.nome),
    gateway_id: String(r.gateway_id),
    ordem: Number(r.ordem ?? 0),
    limite_sensacao: Number(r.limite_sensacao),
    gas_razao_atencao: Number(r.gas_razao_atencao),
    gas_razao_perigo: Number(r.gas_razao_perigo),
    limite_umidade_min: Number(r.limite_umidade_min),
  };
}
export function toDevice(r: Row): Device {
  return {
    id: String(r.id),
    worker_id: (r.worker_id as string) ?? null,
    tipo: (r.tipo as Device["tipo"]) ?? "capacete",
    zone_id: String(r.zone_id ?? ""),
    simulado: Boolean(r.simulado),
    bateria: num(r.bateria),
    rssi: num(r.rssi),
    ultimo_sinal_em: ms(r.ultimo_sinal_em),
    ultima_calibracao_gas: day(r.ultima_calibracao_gas),
  };
}
export function toReading(v: unknown): Reading {
  if (!v || typeof v !== "object") return {};
  const r = v as Row;
  const out: Reading = {};
  for (const k of [
    "temperatura",
    "umidade",
    "sensacao",
    "gas_razao",
    "gas_bruto",
    "aceleracao_g",
    "inclinacao",
  ] as const) {
    if (typeof r[k] === "number") out[k] = r[k] as number;
  }
  if (typeof r.gas_pronto === "boolean") out.gas_pronto = r.gas_pronto;
  if (typeof r.movimento === "boolean") out.movimento = r.movimento;
  if (typeof r.nivel === "string") out.nivel = r.nivel;
  if (typeof r.evento === "string") out.evento = r.evento;
  if (r.criado_em) out.criado_em = Date.parse(String(r.criado_em));
  return out;
}
function toWorkerBase(r: Row): Omit<Worker, "device_id" | "zone_id"> {
  return {
    id: String(r.id),
    nome: String(r.nome),
    cargo: String(r.cargo),
    turno: (r.turno as Worker["turno"]) ?? "A",
    supervisor: Boolean(r.supervisor),
    checkin: ms(r.checkin),
    ultima_pausa: ms(r.ultima_pausa),
  };
}
export function toIncident(r: Row): Incident {
  return {
    id: String(r.id),
    worker_id: String(r.worker_id ?? ""),
    device_id: String(r.device_id ?? ""),
    zone_id: String(r.zone_id ?? ""),
    tipo: r.tipo as IncType,
    severidade: r.severidade as Incident["severidade"],
    status: r.status as IncStatus,
    detalhe: String(r.detalhe ?? ""),
    snapshot: toReading(r.snapshot),
    criado_em: ms(r.criado_em) ?? 0,
    reconhecido_em: ms(r.reconhecido_em) ?? undefined,
    reconhecido_por: (r.reconhecido_por as string) ?? undefined,
    resolvido_em: ms(r.resolvido_em) ?? undefined,
    resolvido_por: (r.resolvido_por as string) ?? undefined,
  };
}

/** Recalcula o vínculo trabalhador → EPI → zona. */
function link(
  workers: Omit<Worker, "device_id" | "zone_id">[],
  devices: Record<string, Device>,
): Worker[] {
  const byWorker = new Map(
    Object.values(devices)
      .filter((d) => d.worker_id)
      .map((d) => [d.worker_id!, d]),
  );
  return workers
    .filter((w) => byWorker.has(w.id))
    .map((w) => {
      const d = byWorker.get(w.id)!;
      return { ...w, device_id: d.id, zone_id: d.zone_id };
    });
}

// Lista completa vinda do banco; state.workers é a parte visível dela.
let baseWorkers: Omit<Worker, "device_id" | "zone_id">[] = [];

/** Com o simulador desligado, mostra só quem usa um EPI físico. */
export function filtrarSimulados(
  workers: Worker[],
  devices: Record<string, Device>,
  simuladorAtivo: boolean,
): Worker[] {
  return simuladorAtivo ? workers : workers.filter((w) => devices[w.device_id]?.simulado === false);
}

function relink() {
  state.workers = filtrarSimulados(
    link(baseWorkers, state.devices),
    state.devices,
    state.simuladorAtivo,
  );
}

// ---------------------------------------------------------------------------
// Carga inicial + tempo real
// ---------------------------------------------------------------------------
let started = false;
export function startStore() {
  if (started || typeof window === "undefined") return;
  started = true;
  void loadAll();
  setInterval(() => {
    state.now = Date.now();
    emit();
  }, 1000);
  // rede de segurança caso o canal de tempo real caia: recarrega a cada minuto
  setInterval(() => void loadAll(true), 60_000);

  supabase
    .channel("lepion-painel")
    .on("postgres_changes", { event: "*", schema: "public", table: "devices" }, (p) => {
      if (p.eventType === "DELETE") return;
      const d = toDevice(p.new as Row);
      state.devices = { ...state.devices, [d.id]: d };
      state.current = { ...state.current, [d.id]: toReading((p.new as Row).ultima_leitura) };
      relink();
      emit();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "incidents" }, (p) => {
      if (p.eventType === "DELETE") {
        const id = String((p.old as Row).id);
        state.incidents = state.incidents.filter((i) => i.id !== id);
      } else {
        const inc = toIncident(p.new as Row);
        const rest = state.incidents.filter((i) => i.id !== inc.id);
        state.incidents = [inc, ...rest].sort((a, b) => b.criado_em - a.criado_em);
      }
      emit();
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "workers" }, (p) => {
      const base = toWorkerBase(p.new as Row);
      baseWorkers = baseWorkers.map((w) => (w.id === base.id ? { ...w, ...base } : w));
      relink();
      emit();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "config" }, (p) => {
      if (p.eventType === "DELETE") return;
      state.simuladorAtivo = (p.new as Row).simulador_ativo !== false;
      relink();
      emit();
    })
    .subscribe((status) => {
      state.live = status === "SUBSCRIBED";
      emit();
    });
}

async function loadAll(quiet = false) {
  const since = new Date(Date.now() - 183 * 86_400_000).toISOString();
  const [z, w, d, i, h, c] = await Promise.all([
    supabase.from("zones").select("*").order("ordem"),
    supabase.from("workers").select("*").order("nome"),
    supabase.from("devices").select("*"),
    supabase
      .from("incidents")
      .select("*")
      .gte("criado_em", since)
      .order("criado_em", { ascending: false })
      .limit(3000),
    supabase.rpc("indice_calor_semanal", { p_semanas: 12 }),
    supabase.from("config").select("simulador_ativo").maybeSingle(),
  ]);
  const err = z.error ?? w.error ?? d.error ?? i.error ?? h.error;
  if (err) {
    if (!quiet || !state.ready) state.error = `Não foi possível carregar os dados: ${err.message}`;
    emit();
    return;
  }
  const devices: Record<string, Device> = {};
  const current: Record<string, Reading> = {};
  for (const r of d.data as Row[]) {
    const dev = toDevice(r);
    devices[dev.id] = dev;
    current[dev.id] = toReading(r.ultima_leitura);
  }
  state.zones = (z.data as Row[]).map(toZone);
  state.devices = devices;
  state.current = current;
  // sem a tabela config (banco antigo), o simulador conta como ligado
  state.simuladorAtivo = c.error ? true : (c.data as Row | null)?.simulador_ativo !== false;
  baseWorkers = (w.data as Row[]).map(toWorkerBase);
  relink();
  state.incidents = (i.data as Row[]).map(toIncident);
  state.heatWeekly = ((h.data ?? []) as Row[]).map((x) => ({
    semana: Date.parse(String(x.semana)),
    media: Number(x.media),
  }));
  state.error = null;
  state.ready = true;
  state.now = Date.now();
  emit();
}

export async function loadHistory(deviceId: string, horas = 8) {
  const { data, error } = await supabase.rpc("historico_dispositivo", {
    p_device: deviceId,
    p_horas: horas,
  });
  if (error) throw error;
  state.history = {
    ...state.history,
    [deviceId]: ((data ?? []) as Row[]).map((x) => ({
      t: Date.parse(String(x.t)),
      temperatura: num(x.temperatura),
      sensacao: num(x.sensacao),
      umidade: num(x.umidade),
      gas_razao: num(x.gas_razao),
    })),
  };
  emit();
}

// ---------------------------------------------------------------------------
// Ações (gravam no banco; a tela atualiza na hora e o tempo real confirma)
// ---------------------------------------------------------------------------
const OPERADOR = "Operador da sala de controle";

function patchIncident(id: string, patch: Partial<Incident>) {
  state.incidents = state.incidents.map((i) => (i.id === id ? { ...i, ...patch } : i));
  emit();
}

export async function acknowledgeIncident(id: string) {
  const inc = state.incidents.find((i) => i.id === id);
  patchIncident(id, {
    reconhecido_em: inc?.reconhecido_em ?? Date.now(),
    reconhecido_por: inc?.reconhecido_por ?? OPERADOR,
  });
  const { error } = await supabase.rpc("reconhecer_incidente", { p_id: id, p_por: OPERADOR });
  if (error) {
    void loadAll(true);
    throw error;
  }
}

export async function setIncidentStatus(id: string, status: Exclude<IncStatus, "aberto">) {
  const inc = state.incidents.find((i) => i.id === id);
  const t = Date.now();
  patchIncident(id, {
    status,
    reconhecido_em: inc?.reconhecido_em ?? t,
    reconhecido_por: inc?.reconhecido_por ?? OPERADOR,
    ...(status === "em_atendimento" ? {} : { resolvido_em: t, resolvido_por: OPERADOR }),
  });
  const { error } = await supabase.rpc("atualizar_incidente", {
    p_id: id,
    p_status: status,
    p_por: OPERADOR,
  });
  if (error) {
    void loadAll(true);
    throw error;
  }
}

export async function registerPause(workerId: string) {
  baseWorkers = baseWorkers.map((w) =>
    w.id === workerId ? { ...w, ultima_pausa: Date.now() } : w,
  );
  relink();
  emit();
  const { error } = await supabase.rpc("registrar_pausa", { p_worker: workerId });
  if (error) {
    void loadAll(true);
    throw error;
  }
}

export async function simulateEvent(kind: "queda" | "calor" | "gas") {
  state.muted = false;
  const { error } = await supabase.rpc("simulate_event", { p_tipo: kind });
  if (error) throw error;
}

export async function setSimulador(ativo: boolean) {
  const antes = state.simuladorAtivo;
  state.simuladorAtivo = ativo;
  relink();
  emit();
  const { error } = await supabase.rpc("definir_simulador", { p_ativo: ativo });
  if (error) {
    state.simuladorAtivo = antes;
    relink();
    emit();
    throw error;
  }
}

export function setFilter(p: Partial<Pick<State, "shift" | "zoneFilter" | "muted">>) {
  Object.assign(state, p);
  emit();
}

// ---------------------------------------------------------------------------
// Regras de exibição (o banco decide os incidentes; aqui só se resume o status)
// ---------------------------------------------------------------------------
export function zoneOf(id: string, s: State = state): Zone {
  return s.zones.find((z) => z.id === id) ?? { ...EMPTY_ZONE, id };
}
export function isOpen(i: Incident) {
  return OPEN.includes(i.status);
}
export function isEvent(t: IncType) {
  return EVENTOS.includes(t);
}

export function labelTipo(t: IncType) {
  return (
    (
      {
        queda: "Queda detectada",
        impacto: "Impacto forte",
        caido: "Trabalhador caído",
        sos: "SOS acionado",
        calor: "Calor",
        gas: "Gás",
        ar_seco: "Ar seco",
        offline: "Sem sinal",
        bateria: "Bateria baixa",
      } as const
    )[t] ?? t
  );
}
export function sevRank(s: Sev) {
  return { critico: 0, atencao: 1, offline: 2, ok: 3 }[s];
}

export function deviceOffline(s: State, d: Device | undefined) {
  return !d || d.ultimo_sinal_em === null || s.now - d.ultimo_sinal_em > OFFLINE_MS;
}

export function workerStatus(s: State, w: Worker): { sev: Sev; motivo: string } {
  const d = s.devices[w.device_id];
  const open = s.incidents.filter((i) => i.worker_id === w.id && isOpen(i) && i.tipo !== "offline");
  const crit = open.find((i) => i.severidade === "critico");
  if (crit)
    return {
      sev: "critico",
      motivo: `${crit.detalhe} · ${crit.reconhecido_em ? "em atendimento" : "sem resposta"}`,
    };
  if (deviceOffline(s, d)) {
    if (!d || d.ultimo_sinal_em === null)
      return { sev: "offline", motivo: "Aguardando a primeira conexão" };
    const min = Math.round((s.now - d.ultimo_sinal_em) / MIN);
    return {
      sev: "offline",
      motivo:
        d.bateria !== null && d.bateria < 10
          ? `Bateria ${d.bateria}% · sem sinal`
          : `Sem sinal há ${min} min`,
    };
  }
  const warn = open.find((i) => i.severidade === "atencao");
  if (warn) return { sev: "atencao", motivo: warn.detalhe };
  return { sev: "ok", motivo: "Todas as leituras normais" };
}

// ---------------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------------
export const fmt1 = (n: number | null | undefined) =>
  n === null || n === undefined || Number.isNaN(n)
    ? "—"
    : n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const fmtGas = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `${fmt1(n)}×`;
export const fmtTime = (t: number | null | undefined) =>
  t ? new Date(t).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";
export const fmtDate = (t: number | null | undefined) =>
  t ? new Date(t).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";
export const fmtDur = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
export const rssiPct = (rssi: number | null) =>
  rssi === null ? null : Math.max(0, Math.min(100, 2 * (rssi + 100)));
