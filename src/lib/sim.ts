import { useSyncExternalStore } from "react";

export type Sev = "ok" | "atencao" | "critico" | "offline";
export type IncType = "queda" | "calor" | "gas" | "ar_seco" | "inatividade" | "offline" | "bateria" | "sos";
export type IncStatus = "aberto" | "em_atendimento" | "resolvido" | "falso_positivo";

export interface Zone { id: string; nome: string; gateway_id: string; limite_temp: number; limite_co: number; limite_umidade_min: number }
export interface Worker { id: string; nome: string; cargo: string; turno: "A" | "B" | "C"; zone_id: string; device_id: string; checkin: number; ultima_pausa: number; supervisor?: boolean }
export interface Device { id: string; worker_id: string; tipo: "capacete" | "traje"; bateria: number; ultimo_sinal_em: number; ultima_calibracao_gas: number; sinal: number }
export interface Reading { temperatura: number; umidade: number; co_ppm: number; aceleracao_g: number; movimento: boolean; criado_em: number }
export interface Incident { id: string; worker_id: string; device_id: string; zone_id: string; tipo: IncType; severidade: "atencao" | "critico"; status: IncStatus; criado_em: number; reconhecido_em?: number; resolvido_em?: number; reconhecido_por?: string; snapshot: Reading; detalhe: string }

export const ZONES: Zone[] = [
  { id: "alto-forno", nome: "Alto-forno", gateway_id: "G1", limite_temp: 38, limite_co: 25, limite_umidade_min: 30 },
  { id: "aciaria", nome: "Aciaria", gateway_id: "G2", limite_temp: 38, limite_co: 25, limite_umidade_min: 30 },
  { id: "laminacao", nome: "Laminação", gateway_id: "G3", limite_temp: 36, limite_co: 25, limite_umidade_min: 30 },
  { id: "coqueria", nome: "Coqueria", gateway_id: "G4", limite_temp: 37, limite_co: 25, limite_umidade_min: 30 },
  { id: "patio", nome: "Pátio de matérias-primas", gateway_id: "G5", limite_temp: 35, limite_co: 25, limite_umidade_min: 30 },
  { id: "manutencao", nome: "Manutenção", gateway_id: "G6", limite_temp: 35, limite_co: 25, limite_umidade_min: 30 },
];

// seeded RNG for deterministic SSR/hydration
let seed = 42;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];

const NOMES = ["Carlos Menezes", "Ana Ribeiro", "João Batista", "Marcos Lima", "Paulo Sérgio", "Rita Alves", "Lucas Pereira", "Bruno Matos", "Fernanda Costa", "Rafael Souza", "Juliana Rocha", "Diego Martins", "Patrícia Gomes", "André Carvalho", "Camila Nunes", "Thiago Barros", "Larissa Freitas", "Gustavo Teixeira", "Mariana Dias", "Felipe Moreira", "Aline Cardoso", "Eduardo Ramos", "Beatriz Lopes", "Rodrigo Pinto", "Vanessa Melo", "Sérgio Araújo", "Daniela Castro", "Henrique Vieira", "Priscila Santos", "Leandro Fonseca", "Tatiana Reis", "Vinícius Azevedo"];
const CARGOS = ["Operador de alto-forno", "Técnica de manutenção", "Operador de ponte rolante", "Soldador", "Eletricista", "Inspetora de qualidade", "Auxiliar de produção", "Mecânico", "Operador de lingotamento", "Técnico de segurança"];
const ZONE_DIST = ["alto-forno","alto-forno","aciaria","aciaria","laminacao","coqueria","patio","manutencao"];

const BASE = Date.UTC(2026, 9, 28, 17, 47, 52); // 14:47:52 São Paulo
const MIN = 60_000, H = 60 * MIN, D = 24 * H;

const fixedZone: Record<number, string> = { 0: "alto-forno", 1: "aciaria", 2: "aciaria", 3: "coqueria", 4: "laminacao", 5: "patio", 6: "patio", 7: "alto-forno" };

export interface State {
  now: number;
  workers: Worker[];
  devices: Record<string, Device>;
  current: Record<string, Reading>; // by device
  history: Record<string, Reading[]>; // by device, 8h every 5 min
  incidents: Incident[];
  muted: boolean;
  shift: "todos" | "A" | "B" | "C";
  zoneFilter: string;
}

function baseReading(z: Zone, t: number): Reading {
  const hot = z.id === "alto-forno" || z.id === "aciaria";
  return {
    temperatura: +((hot ? 34 : 29) + rnd() * 3).toFixed(1),
    umidade: Math.round(45 + rnd() * 15),
    co_ppm: Math.round(3 + rnd() * 9 + (z.id === "coqueria" ? 8 : 0)),
    aceleracao_g: +(0.95 + rnd() * 0.1).toFixed(2),
    movimento: rnd() > 0.1,
    criado_em: t,
  };
}

function build(): State {
  seed = 42;
  const workers: Worker[] = []; const devices: Record<string, Device> = {}; const current: Record<string, Reading> = {}; const history: Record<string, Reading[]> = {};
  NOMES.forEach((nome, i) => {
    const id = `w${i + 1}`; const did = `EPI-${String(142 + i * 3).padStart(4, "0")}`;
    const zone_id = fixedZone[i] ?? pick(ZONE_DIST);
    const z = ZONES.find((x) => x.id === zone_id)!;
    workers.push({ id, nome, cargo: i < 7 ? CARGOS[i] : i === 7 ? "Supervisor de turno" : pick(CARGOS), turno: i < 26 ? "A" : "B", zone_id, device_id: did, checkin: BASE - 8 * H + Math.round(rnd() * 20) * MIN, ultima_pausa: BASE - Math.round(30 + rnd() * 120) * MIN, supervisor: i === 7 });
    devices[did] = { id: did, worker_id: id, tipo: rnd() > 0.3 ? "capacete" : "traje", bateria: Math.round(40 + rnd() * 58), ultimo_sinal_em: BASE - Math.round(rnd() * 20) * 1000, ultima_calibracao_gas: BASE - Math.round(rnd() * 200) * D, sinal: Math.round(60 + rnd() * 40) };
    const hist: Reading[] = [];
    for (let k = 96; k >= 0; k--) hist.push(baseReading(z, BASE - k * 5 * MIN));
    history[did] = hist; current[did] = { ...hist[hist.length - 1] };
  });
  // scenario from the prototype
  const set = (i: number, r: Partial<Reading>, bat?: number) => { const d = workers[i].device_id; Object.assign(current[d], r); if (bat != null) devices[d].bateria = bat; };
  set(0, { temperatura: 36.4, co_ppm: 8, umidade: 54, aceleracao_g: 4.8, movimento: false }, 78);
  set(1, { temperatura: 39.8 }, 64); set(2, { temperatura: 38.9 }, 51);
  set(3, { co_ppm: 32 }, 70); set(4, { umidade: 22 }, 59); set(6, {}, 92);
  set(8, { temperatura: 41.2 });
  // ramp heat for Ana in history
  history[workers[1].device_id].forEach((r, k) => { r.temperatura = +(34 + k * 0.06 + rnd()).toFixed(1); });
  devices[workers[5].device_id].ultimo_sinal_em = BASE - 6 * MIN;
  devices[workers[20].device_id].ultimo_sinal_em = BASE - 4 * MIN; devices[workers[20].device_id].bateria = 3;
  devices[workers[3].device_id].ultima_calibracao_gas = BASE - 210 * D;

  // historic incidents (6 months)
  const incidents: Incident[] = [];
  const types: IncType[] = ["calor", "calor", "calor", "gas", "ar_seco", "queda", "bateria", "offline", "inatividade"];
  for (let k = 0; k < 220; k++) {
    const w = pick(workers); const tipo = pick(types); const t = BASE - Math.round(rnd() * 180 * D) - H;
    const fp = rnd() < 0.12; const resp = Math.round(15 + rnd() * 90) * 1000;
    incidents.push({ id: `i${k}`, worker_id: w.id, device_id: w.device_id, zone_id: w.zone_id, tipo, severidade: tipo === "queda" ? "critico" : "atencao", status: fp ? "falso_positivo" : "resolvido", criado_em: t, reconhecido_em: t + resp, resolvido_em: t + resp + 10 * MIN, reconhecido_por: "Operador", snapshot: current[w.device_id], detalhe: labelTipo(tipo) });
  }
  // today's
  const today = (i: number, tipo: IncType, sev: "atencao" | "critico", ago: number, detalhe: string, status: IncStatus = "aberto") => {
    const w = workers[i]; incidents.push({ id: `t${i}${tipo}`, worker_id: w.id, device_id: w.device_id, zone_id: w.zone_id, tipo, severidade: sev, status, criado_em: BASE - ago, snapshot: { ...current[w.device_id] }, detalhe, ...(status !== "aberto" ? { reconhecido_em: BASE - ago + 30000, reconhecido_por: "Operador" } : {}) });
  };
  today(0, "queda", "critico", 40000, "Queda detectada");
  today(1, "calor", "atencao", 2 * MIN + 49000, "Calor · 39,8 °C");
  today(2, "calor", "atencao", 4 * MIN, "Calor · 38,9 °C");
  today(3, "gas", "atencao", 9 * MIN, "Gás CO · 32 ppm", "em_atendimento");
  today(4, "ar_seco", "atencao", 15 * MIN, "Ar seco · umidade 22%");
  today(5, "offline", "atencao", 6 * MIN, "Sem sinal há 6 min");
  today(10, "calor", "atencao", 3 * H, "Calor · 38,4 °C", "resolvido");
  today(12, "bateria", "atencao", 5 * H, "Bateria 8%", "resolvido");
  incidents.sort((a, b) => b.criado_em - a.criado_em);
  return { now: BASE, workers, devices, current, history, incidents, muted: false, shift: "A", zoneFilter: "todas" };
}

let state: State = build();
const subs = new Set<() => void>();
const emit = () => { state = { ...state }; subs.forEach((f) => f()); };
export const useSim = <T,>(sel: (s: State) => T) => useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => sel(state), () => sel(state));
export const getState = () => state;

export function zoneOf(id: string) { return ZONES.find((z) => z.id === id)!; }
export function labelTipo(t: IncType) {
  return ({ queda: "Queda detectada", calor: "Calor", gas: "Gás CO", ar_seco: "Ar seco", inatividade: "Inatividade", offline: "Sem sinal", bateria: "Bateria baixa", sos: "SOS acionado" } as const)[t];
}
export function sevRank(s: Sev) { return { critico: 0, atencao: 1, offline: 2, ok: 3 }[s]; }

export function workerStatus(s: State, w: Worker): { sev: Sev; motivo: string } {
  const d = s.devices[w.device_id]; const r = s.current[w.device_id]; const z = zoneOf(w.zone_id);
  const open = s.incidents.filter((i) => i.worker_id === w.id && (i.status === "aberto" || i.status === "em_atendimento"));
  const crit = open.find((i) => i.severidade === "critico");
  if (crit) return { sev: "critico", motivo: `${crit.detalhe} · ${crit.reconhecido_em ? "em atendimento" : "sem resposta"}` };
  if (s.now - d.ultimo_sinal_em > 2 * MIN) return { sev: "offline", motivo: d.bateria < 10 ? `Bateria ${d.bateria}% · sem sinal` : `Sem sinal há ${Math.round((s.now - d.ultimo_sinal_em) / MIN)} min` };
  if (r.co_ppm > z.limite_co * 2) return { sev: "critico", motivo: `Gás CO · ${r.co_ppm} ppm` };
  if (r.temperatura > z.limite_temp) return { sev: "atencao", motivo: `Calor · ${fmt1(r.temperatura)} °C` };
  if (r.co_ppm > z.limite_co) return { sev: "atencao", motivo: `Gás CO · ${r.co_ppm} ppm` };
  if (r.umidade < z.limite_umidade_min) return { sev: "atencao", motivo: `Ar seco · umidade ${r.umidade}%` };
  if (d.bateria < 10) return { sev: "atencao", motivo: `Bateria baixa · ${d.bateria}%` };
  return { sev: "ok", motivo: "Todas as leituras normais" };
}

export const fmt1 = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const fmtTime = (t: number) => new Date(t).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" });
export const fmtDate = (t: number) => new Date(t).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
export const fmtDur = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };

/** Applies the ingestion rules to one ESP32 payload (same logic the server will use). */
export function evaluateReading(z: Zone, p: { temperatura: number; umidade: number; co_ppm: number; bateria: number; evento?: string | null }) {
  const out: { tipo: IncType; severidade: "atencao" | "critico" }[] = [];
  if (p.evento === "queda_confirmada") out.push({ tipo: "queda", severidade: "critico" });
  if (p.evento === "sos") out.push({ tipo: "sos", severidade: "critico" });
  if (p.temperatura > z.limite_temp) out.push({ tipo: "calor", severidade: "atencao" });
  if (p.co_ppm > z.limite_co) out.push({ tipo: "gas", severidade: p.co_ppm >= z.limite_co * 2 ? "critico" : "atencao" });
  if (p.umidade < z.limite_umidade_min) out.push({ tipo: "ar_seco", severidade: "atencao" });
  if (p.bateria < 10) out.push({ tipo: "bateria", severidade: "atencao" });
  return out;
}

// ---- live simulation ----
let started = false;
export function startSim() {
  if (started) return; started = true;
  state.now = Date.now() - (Date.now() - BASE) ; // keep base clock, then tick
  setInterval(() => {
    state.now += 2000;
    for (const w of state.workers) {
      const d = state.devices[w.device_id];
      if (state.now - d.ultimo_sinal_em > 2 * MIN && w.id !== "w1") continue; // offline stays offline
      const r = state.current[w.device_id];
      r.temperatura = +(r.temperatura + (Math.random() - 0.5) * 0.2).toFixed(1);
      r.co_ppm = Math.max(0, Math.round(r.co_ppm + (Math.random() - 0.5) * 1.4));
      r.criado_em = state.now; d.ultimo_sinal_em = state.now;
      if (Math.random() < 0.01) d.bateria = Math.max(0, d.bateria - 1);
    }
    emit();
  }, 2000);
}

export function simulateEvent(kind: "queda" | "calor" | "gas") {
  const s = state;
  const pool = s.workers.filter((w) => workerStatus(s, w).sev === "ok");
  const w = pool[Math.floor(Math.random() * pool.length)] ?? s.workers[0];
  const z = zoneOf(w.zone_id); const r = s.current[w.device_id];
  let detalhe = "";
  if (kind === "queda") { Object.assign(r, { aceleracao_g: 4.6, movimento: false }); detalhe = "Queda detectada"; }
  if (kind === "calor") { r.temperatura = z.limite_temp + 2.3; detalhe = `Calor · ${fmt1(r.temperatura)} °C`; }
  if (kind === "gas") { r.co_ppm = z.limite_co * 2 + 6; detalhe = `Gás CO · ${r.co_ppm} ppm`; }
  const rules = evaluateReading(z, { ...r, bateria: s.devices[w.device_id].bateria, evento: kind === "queda" ? "queda_confirmada" : null });
  const rule = rules[0];
  s.incidents.unshift({ id: `sim${Date.now()}`, worker_id: w.id, device_id: w.device_id, zone_id: w.zone_id, tipo: rule.tipo, severidade: rule.severidade, status: "aberto", criado_em: s.now, snapshot: { ...r }, detalhe });
  s.muted = false; emit();
}

export function updateIncident(id: string, patch: Partial<Incident>) {
  state.incidents = state.incidents.map((i) => (i.id === id ? { ...i, ...patch } : i));
  emit();
}
export function setFilter(p: Partial<Pick<State, "shift" | "zoneFilter" | "muted">>) { Object.assign(state, p); emit(); }
export function registerPause(workerId: string) {
  state.workers = state.workers.map((w) => (w.id === workerId ? { ...w, ultima_pausa: state.now } : w)); emit();
}
export function resolveWorker(workerId: string) {
  const d = state.devices[state.workers.find((w) => w.id === workerId)!.device_id];
  Object.assign(state.current[d.id], { aceleracao_g: 1, movimento: true });
}
