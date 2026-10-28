import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowLeft, Coffee, Lock, Vibrate } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SevTag } from "@/components/sev";
import { fmt1, fmtDate, fmtTime, getState, labelTipo, registerPause, useSim, workerStatus, zoneOf } from "@/lib/sim";

export const Route = createFileRoute("/trabalhador/$id")({
  loader: ({ params }) => {
    const w = getState().workers.find((x) => x.id === params.id);
    if (!w) throw notFound();
    return { nome: w.nome };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.nome ?? "Trabalhador"} — Painel de Segurança` },
      { name: "description", content: "Leituras do EPI, exposição ao calor e histórico do trabalhador." },
      { property: "og:title", content: `${loaderData?.nome ?? "Trabalhador"} — Painel de Segurança` },
      { property: "og:description", content: "Leituras do EPI, exposição ao calor e histórico do trabalhador." },
    ],
  }),
  component: Perfil,
});

const MIN = 60_000;
const axis = { stroke: "var(--muted-foreground)", fontSize: 12 };

function Perfil() {
  const { id } = Route.useParams();
  const s = useSim((x) => x);
  const w = s.workers.find((x) => x.id === id)!;
  const d = s.devices[w.device_id]; const r = s.current[w.device_id]; const z = zoneOf(w.zone_id);
  const st = workerStatus(s, w);
  const hist = s.history[w.device_id].map((h) => ({ t: fmtTime(h.criado_em).slice(0, 5), temp: h.temperatura }));
  const acima = s.history[w.device_id].filter((h) => h.temperatura > z.limite_temp).length * 5;
  const semPausa = Math.round((s.now - w.ultima_pausa) / MIN);
  const precisaPausa = semPausa > 90 || r.temperatura > z.limite_temp;
  const past = s.incidents.filter((i) => i.worker_id === w.id && s.now - i.criado_em < 30 * 86_400_000);
  const cards = [["Temperatura", `${fmt1(r.temperatura)} °C`, r.temperatura > z.limite_temp], ["Umidade", `${r.umidade}%`, r.umidade < z.limite_umidade_min], ["Gás CO", `${r.co_ppm} ppm`, r.co_ppm > z.limite_co], ["Aceleração", `${fmt1(r.aceleracao_g)} g`, r.aceleracao_g > 2.5], ["Movimento", r.movimento ? "Sim" : "Não", !r.movimento], ["Bateria", `${d.bateria}%`, d.bateria < 10]] as const;
  const card = "rounded-lg border border-border bg-card p-4";
  return (
    <div className="space-y-4">
      <Link to="/" className="inline-flex h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Voltar ao monitoramento</Link>
      <div className={`${card} flex flex-wrap items-center gap-6`}>
        <div className="grid size-16 place-items-center rounded-full bg-surface-2 text-xl font-semibold">{w.nome.split(" ").map((p) => p[0]).join("").slice(0, 2)}</div>
        <div className="flex-1"><h1 className="text-2xl font-semibold">{w.nome}</h1><div className="text-muted-foreground">{w.cargo} · Turno {w.turno} · Zona {z.nome}</div><div className="mt-1 text-sm">{st.motivo}</div></div>
        <SevTag sev={st.sev} className="text-sm" />
        <dl className="grid grid-cols-3 gap-6 text-sm">
          <div><dt className="text-muted-foreground">EPI vinculado</dt><dd className="font-mono">{d.id} · {d.tipo}</dd></div>
          <div><dt className="text-muted-foreground">Check-in</dt><dd className="font-mono">{fmtTime(w.checkin).slice(0, 5)}</dd></div>
          <div><dt className="text-muted-foreground">Bateria</dt><dd className="font-mono">{d.bateria}%</dd></div>
        </dl>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">{cards.map(([l, v, bad]) => <div key={l} className={`${card} ${bad ? "border-warn" : ""}`}><div className="text-xs text-muted-foreground">{l}</div><div className={`font-mono text-2xl font-semibold ${bad ? "text-warn" : ""}`}>{v}</div>{bad && <div className="text-xs text-warn">▲ acima do limite</div>}</div>)}</div>
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className={card}>
          <h2 className="mb-2 font-semibold">Temperatura no turno</h2>
          <ResponsiveContainer height={260}>
            <ComposedChart data={hist}><CartesianGrid stroke="var(--border)" vertical={false} /><XAxis dataKey="t" interval={11} {...axis} /><YAxis domain={[26, 44]} {...axis} />
              <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)" }} />
              <ReferenceArea y1={z.limite_temp} y2={44} fill="var(--crit)" fillOpacity={0.12} />
              <ReferenceLine y={z.limite_temp} stroke="var(--warn)" strokeDasharray="4 4" label={{ value: `Limite ${z.limite_temp} °C`, fill: "var(--warn)", fontSize: 12, position: "insideTopLeft" }} />
              <Area dataKey="temp" fill="var(--primary)" fillOpacity={0.1} stroke="none" />
              <Line dataKey="temp" name="°C" stroke="var(--primary)" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-4">
          <div className={card}>
            <div className="grid grid-cols-2 gap-3">
              <div><div className="text-xs text-muted-foreground">Exposição acumulada</div><div className="font-mono text-2xl font-semibold">{acima} min</div><div className="text-xs text-muted-foreground">acima do limite</div></div>
              <div><div className="text-xs text-muted-foreground">Desde a última pausa</div><div className="font-mono text-2xl font-semibold">{semPausa} min</div></div>
            </div>
          </div>
          <div className={`${card} ${precisaPausa ? "border-warn" : ""}`}>
            <h2 className="font-semibold">{precisaPausa ? "Pausa recomendada" : "Sem pausa necessária agora"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{precisaPausa ? "15 min em área climatizada com hidratação." : "Leituras dentro dos limites e pausa recente."}</p>
            <div className="mt-3 grid gap-2">
              <Button variant="outline" className="h-11" onClick={() => toast(`Aviso de pausa enviado ao ${d.id}.`)}><Vibrate />Avisar no EPI</Button>
              <Button className="h-11" onClick={() => { registerPause(w.id); toast.success("Pausa registrada."); }}><Coffee />Registrar pausa</Button>
            </div>
          </div>
        </div>
      </div>
      <div className={card}>
        <h2 className="mb-2 font-semibold">Histórico dos últimos 30 dias</h2>
        {past.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma ocorrência.</p> :
          <ul className="divide-y divide-border text-sm">{past.map((i) => <li key={i.id} className="flex gap-4 py-2"><span className="font-mono text-muted-foreground">{fmtDate(i.criado_em)} {fmtTime(i.criado_em).slice(0, 5)}</span><span className="flex-1">{labelTipo(i.tipo)} · {zoneOf(i.zone_id).nome}</span><span className="text-muted-foreground">{i.status.replace("_", " ")}</span></li>)}</ul>}
      </div>
      <p className="flex items-center gap-2 text-xs text-muted-foreground"><Lock className="size-3" />Dados usados apenas para segurança.</p>
    </div>
  );
}
