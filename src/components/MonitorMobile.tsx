import { Link } from "@tanstack/react-router";
import { ChevronRight, Search } from "lucide-react";
import { fmt1, fmtGas, fmtTime, isOpen, setFilter, sevRank, useSim, zoneOf, type Sev, type Worker } from "@/lib/store";
import { SEV_LABEL, SevShape, SevTag, sevBorder } from "@/components/sev";
import { CriticalBanner } from "@/components/CriticalBanner";

type Row = { w: Worker; sev: Sev; motivo: string };

const RESUMO: [Sev, string][] = [
  ["critico", "caído, queda ou impacto"],
  ["atencao", "calor, gás ou ar seco"],
  ["offline", "EPI sem sinal"],
  ["ok", "trabalhando normal"],
];
const SEV_COR: Record<Sev, string> = { ok: "bg-ok", atencao: "bg-warn", critico: "bg-crit", offline: "bg-off" };
const iniciais = (nome: string) => nome.split(" ").map((p) => p[0]).join("").slice(0, 2);
const sobretitulo = "font-sans text-[13px] font-semibold uppercase tracking-[0.2em] text-primary";

/** Tela de monitoramento para celular (abaixo de 1024 px): a equipe primeiro, ação com uma mão. */
export function MonitorMobile({ ws, q, setQ }: { ws: Row[]; q: string; setQ: (v: string) => void }) {
  const s = useSim((x) => x);
  const count = (k: Sev) => ws.filter((x) => x.sev === k).length;
  const pedem = ws.length - count("ok");
  // contagem por zona respeita o turno, mas não o filtro de zona (os botões são o próprio filtro)
  const doTurno = s.workers.filter((w) => s.shift === "todos" || w.turno === s.shift);
  const chips = [{ id: "todas", nome: "Todas", n: doTurno.length }, ...s.zones.map((z) => ({ id: z.id, nome: z.nome, n: doTurno.filter((w) => w.zone_id === z.id).length }))];
  const busca = q.trim().toLowerCase();
  const lista = ws.filter((x) => x.w.nome.toLowerCase().includes(busca));
  const atencao = lista.filter((x) => x.sev !== "ok");
  const normais = lista.filter((x) => x.sev === "ok");
  const zonas = s.zones
    .map((z) => {
      const all = ws.filter((x) => x.w.zone_id === z.id);
      const worst: Sev = all.reduce((m, x) => (sevRank(x.sev) < sevRank(m) ? x.sev : m), "ok" as Sev);
      const rs = all.filter((x) => x.sev !== "offline").map((x) => s.current[x.w.device_id] ?? {});
      const nums = (k: "sensacao" | "temperatura" | "gas_razao") => rs.map((r) => r[k]).filter((v): v is number => typeof v === "number");
      const maxS = Math.max(...nums("sensacao"), ...nums("temperatura"), -Infinity);
      const maxG = Math.max(...nums("gas_razao"), -Infinity);
      const por = (k: Sev) => all.filter((x) => x.sev === k).length;
      const partes = (["critico", "atencao", "offline"] as Sev[]).filter((k) => por(k)).map((k) => `${por(k)} ${SEV_LABEL[k].toLowerCase()}`);
      return { z, all, worst, por, maxS, maxG, resumo: all.length === 0 ? "Nenhum EPI nesta zona" : `${all.length} ${all.length === 1 ? "EPI" : "EPIs"} · ${partes.length ? partes.join(", ") : "todos OK"}` };
    })
    .sort((a, b) => (a.all.length === 0 ? 1 : 0) - (b.all.length === 0 ? 1 : 0) || sevRank(a.worst) - sevRank(b.worst));
  const recentes = s.incidents.filter((i) => isOpen(i) && ws.some((x) => x.w.id === i.worker_id)).length;

  const card = (x: Row) => (
    <li key={x.w.id}>
      <Link
        to="/trabalhador/$id"
        params={{ id: x.w.id }}
        className={`flex min-h-11 items-center gap-3 rounded-xl border bg-card p-3.5 hover:bg-accent ${x.sev === "critico" ? "border-crit" : "border-border"}`}
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#C4D0F8] font-display text-base font-bold text-background">{iniciais(x.w.nome)}</span>
        <span className="min-w-0 flex-1 space-y-1">
          <span className="flex items-center justify-between gap-2">
            <span className="truncate font-semibold">{x.w.nome}</span>
            <SevTag sev={x.sev} />
          </span>
          <span className="block text-[13px] leading-[18px] text-muted-foreground">{x.motivo}</span>
          <span className="block text-xs text-[#8E98C8]">{zoneOf(x.w.zone_id).nome} · {x.w.cargo}</span>
        </span>
      </Link>
    </li>
  );

  return (
    <div className="space-y-6 lg:hidden">
      <CriticalBanner />

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="font-display text-[clamp(22px,7vw,30px)] font-bold leading-tight">
            {ws.length} em campo{pedem ? `, ${pedem} ${pedem === 1 ? "pede" : "pedem"} atenção` : ", todos OK"}
          </h1>
          <select aria-label="Turno" className="h-11 rounded-md border border-border bg-card px-3 text-foreground" value={s.shift} onChange={(e) => setFilter({ shift: e.target.value as never })}>
            <option value="todos">Todos os turnos</option><option value="A">Turno A</option><option value="B">Turno B</option><option value="C">Turno C</option>
          </select>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(132px,1fr))] gap-3">
          {RESUMO.map(([k, desc]) => (
            <div key={k} className="space-y-2 rounded-xl border border-border bg-card px-4 py-3.5">
              <SevTag sev={k} />
              <div className="font-display text-[32px] font-bold leading-9 tabular-nums">{count(k)}</div>
              <div className="text-[13px] leading-[18px] text-muted-foreground">{desc}</div>
            </div>
          ))}
        </div>
      </section>

      <div role="group" aria-label="Filtrar por zona" className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
        {chips.map((c) => {
          const on = s.zoneFilter === c.id;
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={on}
              onClick={() => setFilter({ zoneFilter: c.id })}
              className={`h-11 shrink-0 whitespace-nowrap rounded-full border px-4 text-sm font-medium ${on ? "border-primary bg-primary text-primary-foreground" : "border-[#343878] bg-card text-foreground"}`}
            >
              {c.nome} · {c.n}
            </button>
          );
        })}
      </div>

      <div className="relative">
        <label htmlFor="busca-m" className="sr-only">Buscar trabalhador</label>
        <Search className="absolute left-3.5 top-3.5 size-4 text-muted-foreground" aria-hidden />
        <input id="busca-m" type="search" placeholder="Buscar trabalhador" value={q} onChange={(e) => setQ(e.target.value)} className="h-12 w-full rounded-lg border border-[#343878] bg-card pl-10 pr-3 text-base text-foreground placeholder:text-[#8E98C8]" />
      </div>

      {atencao.length > 0 && (
        <section className="space-y-3">
          <h2 className={sobretitulo}>Precisam de atenção</h2>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-3">{atencao.map(card)}</ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className={sobretitulo}>Por zona</h2>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-3">
          {zonas.map(({ z, all, worst, por, maxS, maxG, resumo }) => (
            <li key={z.id}>
              <button type="button" onClick={() => setFilter({ zoneFilter: s.zoneFilter === z.id ? "todas" : z.id })} className={`w-full space-y-2.5 rounded-xl border bg-card p-3.5 text-left hover:bg-accent ${all.length ? sevBorder(worst) : "border-border"}`}>
                <span className="flex items-center justify-between gap-2">
                  <span className="font-display text-[17px] font-bold">{z.nome}</span>
                  {all.length ? <SevTag sev={worst} /> : <span className="rounded border border-border px-2 py-0.5 font-mono text-xs text-muted-foreground">SEM EPI</span>}
                </span>
                <span className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                  {(["ok", "atencao", "critico", "offline"] as Sev[]).map((k) => por(k) > 0 && <span key={k} className={SEV_COR[k]} style={{ flex: `${por(k)} 0 0` }} />)}
                </span>
                <span className="flex flex-wrap justify-between gap-2 text-[13px] leading-[18px] text-muted-foreground">
                  <span>{resumo}</span>
                  {Number.isFinite(maxS) && <span className="font-mono text-[#8E98C8]">{fmt1(maxS)} °C · {fmtGas(Number.isFinite(maxG) ? maxG : undefined)}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {normais.length > 0 && (
        <section className="space-y-3">
          <h2 className={sobretitulo}>Trabalhando normal · {normais.length}</h2>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-3">{normais.map(card)}</ul>
        </section>
      )}

      <Link to="/ocorrencias" className="flex h-12 items-center justify-center gap-2 rounded-xl border border-[#343878] font-semibold text-primary">
        Ocorrências abertas · {recentes}
        <ChevronRight className="size-4" aria-hidden />
      </Link>

      <p className="flex items-center justify-center gap-3 text-xs text-[#8E98C8]">
        {(["ok", "atencao", "critico", "offline"] as Sev[]).map((k) => <span key={k} className="flex items-center gap-1"><SevShape sev={k} className="size-2.5" />{SEV_LABEL[k]}</span>)}
      </p>
      <p className="text-center text-xs text-[#8E98C8]">Dados usados apenas para segurança · atualizado {fmtTime(s.now).slice(0, 5)}</p>
    </div>
  );
}
