import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Search } from "lucide-react";
import { fmt1, fmtGas, fmtTime, sevRank, useSim, workerStatus, zoneOf, type Sev, type State } from "@/lib/store";
import { SEV_LABEL, SevShape, SevTag, sevBorder, sevText } from "@/components/sev";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Monitoramento — Painel de Segurança" },
      { name: "description", content: "Status em tempo real dos trabalhadores e mapa de risco por zona da usina." },
      { property: "og:title", content: "Monitoramento — Painel de Segurança" },
      { property: "og:description", content: "Status em tempo real dos trabalhadores e mapa de risco por zona da usina." },
    ],
  }),
  component: Monitor,
});

export function visibleWorkers(s: State) {
  return s.workers.filter((w) => (s.shift === "todos" || w.turno === s.shift) && (s.zoneFilter === "todas" || w.zone_id === s.zoneFilter));
}

function Monitor() {
  const s = useSim((x) => x);
  const [q, setQ] = useState("");
  const ws = visibleWorkers(s).map((w) => ({ w, ...workerStatus(s, w) })).sort((a, b) => sevRank(a.sev) - sevRank(b.sev));
  const count = (k: Sev) => ws.filter((x) => x.sev === k).length;
  const tempOf = (deviceId: string) => s.current[deviceId]?.temperatura ?? -Infinity;
  const online = ws.filter((x) => x.sev !== "offline");
  const hottest = online.reduce<(typeof ws)[number] | undefined>((m, x) => (!m || tempOf(x.w.device_id) > tempOf(m.w.device_id) ? x : m), undefined);
  const crit = ws.find((x) => x.sev === "critico");
  const kpis = [
    ["EM CAMPO", ws.length, "EPIs vinculados no filtro", "text-foreground"],
    ["OK", count("ok"), "dentro dos limites", "text-ok"],
    ["ATENÇÃO", count("atencao"), "calor, gás ou umidade", "text-warn"],
    ["CRÍTICO", count("critico"), crit ? `${(crit.motivo.split(" ·")[0] ?? "").toLowerCase()} — ${zoneOf(crit.w.zone_id).nome}` : "nenhum", "text-crit"],
    ["OFFLINE", count("offline"), "sem sinal ou bateria", "text-off"],
    ["TEMP. MÁXIMA", hottest ? `${fmt1(s.current[hottest.w.device_id]?.temperatura)} °C` : "—", hottest ? zoneOf(hottest.w.zone_id).nome : "", "text-primary"],
  ] as const;
  const list = ws.filter((x) => x.w.nome.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map(([l, v, sub, c]) => (
          <div key={l} className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs font-semibold tracking-wide text-muted-foreground">{l}</div>
            <div className={`font-mono text-3xl font-semibold ${c}`}>{v}</div>
            <div className="truncate text-xs text-muted-foreground">{sub}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <aside className="rounded-lg border border-border bg-card">
          <div className="border-b border-border p-3">
            <div className="text-sm font-semibold">Trabalhadores em campo <span className="font-normal text-muted-foreground">ordenado por gravidade</span></div>
            <div className="relative mt-2"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input aria-label="Buscar trabalhador" placeholder="Buscar" className="h-11 pl-9" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          </div>
          <ul className="max-h-[720px] divide-y divide-border overflow-y-auto">
            {list.map(({ w, sev, motivo }) => (
              <li key={w.id}>
                <Link to="/trabalhador/$id" params={{ id: w.id }} className={`block border-l-4 p-3 hover:bg-accent ${sev === "ok" ? "border-l-transparent" : sevBorder(sev)}`}>
                  <div className="flex items-center justify-between gap-2"><span className="font-medium">{w.nome}</span><SevTag sev={sev} /></div>
                  <div className="text-xs text-muted-foreground">{w.cargo} · {zoneOf(w.zone_id).nome}</div>
                  <div className="mt-1 flex justify-between text-xs"><span className={sev === "ok" ? "text-muted-foreground" : sevText(sev)}>{motivo}</span><span className="font-mono text-muted-foreground">{s.devices[w.device_id]?.bateria == null ? "Bat. —" : `Bat. ${s.devices[w.device_id]?.bateria}%`}</span></div>
                </Link>
              </li>
            ))}
          </ul>
        </aside>
        <div className="space-y-4">
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div><h2 className="font-semibold">Mapa de risco por zona</h2><p className="text-xs text-muted-foreground">Localização pelo roteador Wi-Fi a que cada EPI está conectado</p></div>
              <div className="flex gap-3 text-xs">{(["ok", "atencao", "critico", "offline"] as Sev[]).map((k) => <span key={k} className="flex items-center gap-1"><SevShape sev={k} />{SEV_LABEL[k]}</span>)}</div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {s.zones.map((z) => {
                const zw = ws.filter((x) => x.w.zone_id === z.id && x.sev !== "offline");
                const worst: Sev = zw.length ? zw.reduce((m, x) => (sevRank(x.sev) < sevRank(m) ? x.sev : m), "ok" as Sev) : "offline";
                const rs = zw.map((x) => s.current[x.w.device_id] ?? {});
                const vals = (k: "temperatura" | "sensacao" | "gas_razao" | "umidade") => rs.map((r) => r[k]).filter((v): v is number => typeof v === "number");
                const maxT = Math.max(...vals("temperatura"), -Infinity); const maxS = Math.max(...vals("sensacao"), -Infinity);
                const maxGas = Math.max(...vals("gas_razao"), -Infinity); const minU = Math.min(...vals("umidade"), Infinity);
                const crits = zw.filter((x) => x.sev === "critico").length;
                let main = [Number.isFinite(maxT) ? `${fmt1(maxT)} °C` : "—", zw.length ? "Leituras dentro dos limites" : "Ninguém conectado na zona"];
                if (crits) main = [`${crits} ${crits > 1 ? "críticos" : "crítico"}`, zw.find((x) => x.sev === "critico")?.motivo.split(" ·")[0] ?? ""];
                else if (maxGas >= z.gas_razao_atencao) main = [fmtGas(maxGas), "Gás em relação ao ar limpo"];
                else if (minU < z.limite_umidade_min) main = [`${Math.round(minU)}%`, "Umidade relativa (ar seco)"];
                else if (maxS >= z.limite_sensacao) main = [`${fmt1(maxS)} °C`, "Sensação térmica máxima na zona"];
                const all = ws.filter((x) => x.w.zone_id === z.id);
                return (
                  <div key={z.id} className={`min-h-44 rounded-lg border-2 bg-surface-2 p-3 ${sevBorder(worst)} ${worst === "critico" ? "bg-crit/10" : worst === "atencao" ? "bg-warn/5" : ""}`}>
                    <div className="flex items-start justify-between"><div><div className="font-semibold">{z.nome}</div><div className="font-mono text-xs text-muted-foreground">Gateway {z.gateway_id}</div></div><SevTag sev={worst} /></div>
                    <div className={`mt-3 font-mono text-2xl font-semibold ${worst === "ok" ? "" : sevText(worst)}`}>{main[0]}</div>
                    <div className="text-xs text-muted-foreground">{main[1]}</div>
                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex flex-wrap gap-1">{all.map((x) => <span key={x.w.id} title={`${x.w.nome} · ${SEV_LABEL[x.sev]}`}><SevShape sev={x.sev} className="size-2.5" /></span>)}</div>
                      <span className="text-xs text-muted-foreground">{all.length} {all.length === 1 ? "pessoa" : "pessoas"}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="mb-2 flex justify-between"><h2 className="font-semibold">Alertas recentes</h2><Link to="/analitico" className="text-sm text-primary hover:underline">Ver log completo</Link></div>
            <ul className="divide-y divide-border">
              {s.incidents.slice(0, 7).map((i) => {
                const w = s.workers.find((x) => x.id === i.worker_id);
                const sev: Sev = i.status === "resolvido" || i.status === "falso_positivo" ? "ok" : i.tipo === "offline" ? "offline" : i.severidade;
                const st = { aberto: i.reconhecido_em ? "Reconhecido" : i.severidade === "critico" ? "Aguardando reconhecimento" : "Aberto", em_atendimento: "Em atendimento", resolvido: "Resolvido", falso_positivo: "Falso positivo" }[i.status];
                return <li key={i.id} className="flex flex-wrap items-center gap-3 py-2 text-sm"><span className="font-mono text-muted-foreground">{fmtTime(i.criado_em)}</span><SevTag sev={sev} /><span className="flex-1">{i.detalhe} — {w?.nome ?? "—"}, {zoneOf(i.zone_id).nome}</span><span className="text-muted-foreground">{st}</span></li>;
              })}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
