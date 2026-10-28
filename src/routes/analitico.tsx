import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FileDown, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtDur, fmtTime, labelTipo, useSim, zoneOf, type Incident } from "@/lib/store";

export const Route = createFileRoute("/analitico")({
  head: () => ({
    meta: [
      { title: "Analítico — Painel LEPION" },
      { name: "description", content: "Indicadores de ocorrências, quedas, calor e zonas de risco para o SESMT." },
      { property: "og:title", content: "Analítico — Painel LEPION" },
      { property: "og:description", content: "Indicadores de ocorrências, quedas, calor e zonas de risco para o SESMT." },
    ],
  }),
  component: Analitico,
});

const D = 86_400_000;
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const axis = { stroke: "var(--muted-foreground)", fontSize: 12 };
const tip = { contentStyle: { background: "var(--card)", border: "1px solid var(--border)", color: "var(--foreground)" } };
const STATUS = { aberto: "Aberto", em_atendimento: "Em atendimento", resolvido: "Resolvido", falso_positivo: "Falso positivo" };

export function Analitico() {
  const s = useSim((x) => x);
  const [p, setP] = useState<"hoje" | "7d" | "6m">("6m");
  const span = { hoje: D, "7d": 7 * D, "6m": 180 * D }[p];
  const inc = s.incidents.filter((i) => s.now - i.criado_em <= span);
  const graves = s.incidents.filter((i) => i.severidade === "critico" && i.status !== "falso_positivo");
  const lastGrave = graves.filter((i) => s.now - i.criado_em > 3600_000)[0];
  const diasSem = graves.some((i) => s.now - i.criado_em < D) ? 0 : lastGrave ? Math.floor((s.now - lastGrave.criado_em) / D) : 0;
  const resp = inc.filter((i) => i.reconhecido_em).map((i) => i.reconhecido_em! - i.criado_em);
  const avg = resp.length ? resp.reduce((a, b) => a + b, 0) / resp.length : 0;
  const fp = inc.length ? (inc.filter((i) => i.status === "falso_positivo").length / inc.length) * 100 : 0;

  const months: { m: string; ocorrencias: number; quedas: number }[] = [];
  for (let k = 5; k >= 0; k--) {
    const d = new Date(s.now); d.setMonth(d.getMonth() - k);
    const list = s.incidents.filter((i) => { const x = new Date(i.criado_em); return x.getMonth() === d.getMonth() && x.getFullYear() === d.getFullYear(); });
    months.push({ m: MESES[d.getMonth()] ?? "", ocorrencias: list.length, quedas: list.filter((i) => i.tipo === "queda" && i.status !== "falso_positivo").length });
  }
  const weeks = s.heatWeekly.map((x) => ({ s: new Date(x.semana).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" }), indice: x.media }));
  const byZone = s.zones.map((z) => ({ zona: z.nome, n: inc.filter((i) => i.zone_id === z.id).length })).sort((a, b) => b.n - a.n);
  const top = byZone[0];
  const topTipo = Object.entries(inc.filter((i) => zoneOf(i.zone_id).nome === top?.zona).reduce<Record<string, number>>((a, i) => ((a[i.tipo] = (a[i.tipo] ?? 0) + 1), a), {})).sort((a, b) => b[1] - a[1])[0]?.[0];
  const rec = topTipo === "calor" ? "ampliar pausas de hidratação e rodízio a cada 45 min" : topTipo === "gas" ? "revisar a exaustão e calibrar os sensores de gás" : topTipo === "queda" || topTipo === "caido" ? "inspecionar pisos, guarda-corpos e acessos" : "reforçar inspeção dos EPIs e treinamento da equipe";
  const today = s.incidents.filter((i) => s.now - i.criado_em < D);

  const kpis = [["Dias sem ocorrência grave", String(diasSem)], ["Tempo médio de resposta", fmtDur(avg)], ["Ocorrências no período", String(inc.length)], ["Falsos positivos", `${fp.toFixed(1).replace(".", ",")}%`]];
  const card = "rounded-lg border border-border bg-card p-4";

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_440px]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {(["hoje", "7d", "6m"] as const).map((k) => <Button key={k} variant={p === k ? "default" : "outline"} className="h-11" onClick={() => setP(k)}>{{ hoje: "Hoje", "7d": "7 dias", "6m": "6 meses" }[k]}</Button>)}
          <Button className="ml-auto h-11" variant="outline" onClick={() => exportPdf(inc, kpis, s.now)}><FileDown />Exportar relatório SESMT</Button>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{kpis.map(([l, v]) => <div key={l} className={card}><div className="text-xs text-muted-foreground">{l}</div><div className="font-display tabular-nums text-3xl font-semibold">{v}</div></div>)}</div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className={card}><h3 className="mb-2 font-semibold">Ocorrências por mês</h3><ResponsiveContainer height={220}><BarChart data={months}><CartesianGrid stroke="var(--border)" vertical={false} /><XAxis dataKey="m" {...axis} /><YAxis {...axis} /><Tooltip {...tip} /><Bar dataKey="ocorrencias" name="Ocorrências" fill="var(--primary)" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div>
          <div className={card}><h3 className="mb-2 font-semibold">Quedas confirmadas por mês</h3><ResponsiveContainer height={220}><BarChart data={months}><CartesianGrid stroke="var(--border)" vertical={false} /><XAxis dataKey="m" {...axis} /><YAxis allowDecimals={false} {...axis} /><Tooltip {...tip} /><Bar dataKey="quedas" name="Quedas" fill="var(--crit)" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div>
          <div className={card}><h3 className="mb-2 font-semibold">Sensação térmica média semanal</h3><ResponsiveContainer height={220}><LineChart data={weeks}><CartesianGrid stroke="var(--border)" vertical={false} /><XAxis dataKey="s" {...axis} /><YAxis domain={[25, 40]} {...axis} /><Tooltip {...tip} /><ReferenceLine y={35} stroke="var(--warn)" strokeDasharray="4 4" label={{ value: "Limite 35 °C", fill: "var(--warn)", fontSize: 12 }} /><Line dataKey="indice" name="Índice °C" stroke="var(--primary)" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div>
          <div className={card}><h3 className="mb-2 font-semibold">Ocorrências por zona</h3><ResponsiveContainer height={180}><BarChart data={byZone} layout="vertical" margin={{ left: 40 }}><XAxis type="number" {...axis} /><YAxis type="category" dataKey="zona" width={110} {...axis} /><Tooltip {...tip} /><Bar dataKey="n" name="Ocorrências" fill="var(--warn)" radius={[0, 3, 3, 0]} /></BarChart></ResponsiveContainer>
            {top && <p className="mt-2 flex gap-2 rounded bg-surface-2 p-2 text-sm"><Lightbulb className="size-4 shrink-0 text-primary" /><span><b>{top.zona}</b> concentra mais alertas{topTipo ? ` (principalmente ${labelTipo(topTipo as never).toLowerCase()})` : ""}. Recomendação: {rec}.</span></p>}
          </div>
        </div>
      </div>
      <aside className={card}>
        <h3 className="mb-2 font-semibold">Log do dia</h3>
        <table className="w-full text-sm"><thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1">Hora</th><th>Ocorrência</th><th>Trabalhador</th><th>Zona</th><th>Status</th><th>Resp.</th></tr></thead>
          <tbody>{today.map((i) => <tr key={i.id} className="border-t border-border"><td className="py-2 font-mono">{fmtTime(i.criado_em).slice(0, 5)}</td><td>{labelTipo(i.tipo)}</td><td>{s.workers.find((w) => w.id === i.worker_id)?.nome.split(" ")[0] ?? "—"}</td><td>{zoneOf(i.zone_id).nome.split(" ")[0]}</td><td>{STATUS[i.status]}</td><td className="font-mono">{i.reconhecido_em ? fmtDur(i.reconhecido_em - i.criado_em) : "—"}</td></tr>)}</tbody></table>
      </aside>
    </div>
  );
}

async function exportPdf(inc: Incident[], kpis: string[][], now: number) {
  const { jsPDF } = await import("jspdf");
  const s = (await import("@/lib/store")).getState();
  const doc = new jsPDF();
  doc.setFontSize(16); doc.text("Relatório SESMT — Painel LEPION", 14, 18);
  doc.setFontSize(10); doc.text(`Gerado em ${new Date(now).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`, 14, 25);
  let y = 35; kpis.forEach(([l, v]) => { doc.text(`${l}: ${v}`, 14, y); y += 6; });
  y += 4; doc.setFontSize(12); doc.text("Ocorrências", 14, y); y += 6; doc.setFontSize(9);
  inc.slice(0, 120).forEach((i) => {
    if (y > 285) { doc.addPage(); y = 15; }
    const w = s.workers.find((x) => x.id === i.worker_id);
    doc.text(`${new Date(i.criado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}  ${labelTipo(i.tipo)}  ${w?.nome ?? "—"}  ${zoneOf(i.zone_id).nome}  ${STATUS[i.status]}`, 14, y); y += 5;
  });
  doc.save("relatorio-sesmt.pdf");
}
