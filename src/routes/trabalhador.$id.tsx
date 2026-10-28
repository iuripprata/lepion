import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowLeft, Coffee, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SevTag } from "@/components/sev";
import {
  fmt1, fmtDate, fmtGas, fmtTime, isOpen, labelTipo, loadHistory, registerPause, setIncidentStatus, useSim, workerStatus, zoneOf,
} from "@/lib/store";

export const Route = createFileRoute("/trabalhador/$id")({
  head: () => ({
    meta: [
      { title: "Trabalhador — Painel de Segurança" },
      { name: "description", content: "Leituras do EPI, exposição ao calor e histórico do trabalhador." },
      { property: "og:title", content: "Trabalhador — Painel de Segurança" },
      { property: "og:description", content: "Leituras do EPI, exposição ao calor e histórico do trabalhador." },
    ],
  }),
  component: Perfil,
});

const MIN = 60_000;
const axis = { stroke: "var(--muted-foreground)", fontSize: 12 };
const STATUS = { aberto: "Aberto", em_atendimento: "Em atendimento", resolvido: "Resolvido", falso_positivo: "Falso positivo" } as const;

function Perfil() {
  const { id } = Route.useParams();
  const s = useSim((x) => x);
  const w = s.workers.find((x) => x.id === id);
  const deviceId = w?.device_id;

  useEffect(() => {
    if (!deviceId) return;
    const load = () => loadHistory(deviceId).catch((e: Error) => toast.error(`Histórico indisponível: ${e.message}`));
    void load();
    const t = setInterval(load, 5 * MIN);
    return () => clearInterval(t);
  }, [deviceId]);

  if (!w) {
    return (
      <div className="mx-auto mt-16 max-w-md text-center">
        <h1 className="text-xl font-semibold">Trabalhador não encontrado</h1>
        <Link to="/" className="mt-4 inline-block text-primary hover:underline">Voltar ao monitoramento</Link>
      </div>
    );
  }

  const d = s.devices[w.device_id]; const r = s.current[w.device_id] ?? {}; const z = zoneOf(w.zone_id);
  const st = workerStatus(s, w);
  const hist = s.history[w.device_id] ?? [];
  const chart = hist.map((h) => ({ t: fmtTime(h.t).slice(0, 5), sensacao: h.sensacao ?? h.temperatura }));
  // cada ponto do histórico é uma janela de 5 min; no máximo as 8 h consultadas
  const acima = Math.min(8 * 60, hist.filter((h) => (h.sensacao ?? h.temperatura ?? 0) >= z.limite_sensacao).length * 5);
  const semPausa = w.ultima_pausa ? Math.round((s.now - w.ultima_pausa) / MIN) : null;
  const quente = (r.sensacao ?? r.temperatura ?? 0) >= z.limite_sensacao;
  const precisaPausa = (semPausa !== null && semPausa > 90) || quente;
  const abertos = s.incidents.filter((i) => i.worker_id === w.id && isOpen(i));
  const past = s.incidents.filter((i) => i.worker_id === w.id && s.now - i.criado_em < 30 * 86_400_000);

  const cards: [string, string, boolean][] = [
    ["Temperatura", r.temperatura !== undefined ? `${fmt1(r.temperatura)} °C` : "—", false],
    ["Sensação térmica", r.sensacao !== undefined ? `${fmt1(r.sensacao)} °C` : "—", quente],
    ["Umidade", r.umidade !== undefined ? `${Math.round(r.umidade)}%` : "—", r.umidade !== undefined && r.umidade < z.limite_umidade_min],
    ["Gás (× ar limpo)", r.gas_pronto === false ? "aquecendo" : fmtGas(r.gas_razao), r.gas_razao !== undefined && r.gas_razao >= z.gas_razao_atencao],
    ["Inclinação", r.inclinacao !== undefined ? `${Math.round(r.inclinacao)}°` : "—", r.inclinacao !== undefined && r.inclinacao > 60],
    ["Bateria", d?.bateria == null ? "—" : `${d.bateria}%`, d?.bateria != null && d.bateria < 10],
  ];
  const card = "rounded-lg border border-border bg-card p-4";
  const run = (p: Promise<unknown>, ok: string) => p.then(() => toast.success(ok)).catch((e: Error) => toast.error(`Não foi possível salvar: ${e.message}`));

  return (
    <div className="space-y-4">
      <Link to="/" className="inline-flex h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Voltar ao monitoramento</Link>
      <div className={`${card} flex flex-wrap items-center gap-6`}>
        <div className="grid size-16 place-items-center rounded-full bg-surface-2 text-xl font-semibold">{w.nome.split(" ").map((p) => p[0]).join("").slice(0, 2)}</div>
        <div className="flex-1"><h1 className="text-2xl font-semibold">{w.nome}</h1><div className="text-muted-foreground">{w.cargo} · Turno {w.turno} · Zona {z.nome}</div><div className="mt-1 text-sm">{st.motivo}</div></div>
        <SevTag sev={st.sev} className="text-sm" />
        <dl className="grid grid-cols-3 gap-6 text-sm">
          <div><dt className="text-muted-foreground">EPI vinculado</dt><dd className="font-mono">{w.device_id} · {d?.simulado ? "simulado" : "físico"}</dd></div>
          <div><dt className="text-muted-foreground">Check-in</dt><dd className="font-mono">{w.checkin ? fmtTime(w.checkin).slice(0, 5) : "—"}</dd></div>
          <div><dt className="text-muted-foreground">Último sinal</dt><dd className="font-mono">{fmtTime(d?.ultimo_sinal_em)}</dd></div>
        </dl>
      </div>

      {abertos.length > 0 && (
        <div className={`${card} border-warn`}>
          <h2 className="mb-2 font-semibold">Ocorrências em aberto</h2>
          <ul className="divide-y divide-border">
            {abertos.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <span className="font-mono text-muted-foreground">{fmtTime(i.criado_em).slice(0, 5)}</span>
                <span className="flex-1">{i.detalhe} · {STATUS[i.status]}</span>
                <Button variant="outline" className="h-11" onClick={() => void run(setIncidentStatus(i.id, "resolvido"), "Ocorrência encerrada.")}>Encerrar</Button>
                <Button variant="ghost" className="h-11" onClick={() => void run(setIncidentStatus(i.id, "falso_positivo"), "Marcado como falso positivo.")}>Falso positivo</Button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">Calor, gás, ar seco, bateria e falta de sinal também se encerram sozinhos quando a leitura volta ao normal.</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">{cards.map(([l, v, bad]) => <div key={l} className={`${card} ${bad ? "border-warn" : ""}`}><div className="text-xs text-muted-foreground">{l}</div><div className={`font-display tabular-nums text-2xl font-semibold ${bad ? "text-warn" : ""}`}>{v}</div>{bad && <div className="text-xs text-warn">▲ fora do limite</div>}</div>)}</div>
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className={card}>
          <h2 className="mb-2 font-semibold">Sensação térmica nas últimas 8 horas</h2>
          {chart.length === 0 ? <p className="py-16 text-center text-sm text-muted-foreground">Sem leituras nas últimas 8 horas.</p> : (
            <ResponsiveContainer height={260}>
              <ComposedChart data={chart}><CartesianGrid stroke="var(--border)" vertical={false} /><XAxis dataKey="t" interval={Math.max(0, Math.floor(chart.length / 8))} {...axis} /><YAxis domain={[24, 44]} {...axis} />
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)" }} />
                <ReferenceArea y1={z.limite_sensacao} y2={44} fill="var(--crit)" fillOpacity={0.12} />
                <ReferenceLine y={z.limite_sensacao} stroke="var(--warn)" strokeDasharray="4 4" label={{ value: `Limite ${z.limite_sensacao} °C`, fill: "var(--warn)", fontSize: 12, position: "insideTopLeft" }} />
                <Area dataKey="sensacao" fill="var(--primary)" fillOpacity={0.1} stroke="none" />
                <Line dataKey="sensacao" name="Sensação °C" stroke="var(--primary)" strokeWidth={2} dot={false} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="space-y-4">
          <div className={card}>
            <div className="grid grid-cols-2 gap-3">
              <div><div className="text-xs text-muted-foreground">Exposição acumulada</div><div className="font-display tabular-nums text-2xl font-semibold">{acima} min</div><div className="text-xs text-muted-foreground">acima do limite (8 h)</div></div>
              <div><div className="text-xs text-muted-foreground">Desde a última pausa</div><div className="font-display tabular-nums text-2xl font-semibold">{semPausa === null ? "—" : `${semPausa} min`}</div></div>
            </div>
          </div>
          <div className={`${card} ${precisaPausa ? "border-warn" : ""}`}>
            <h2 className="font-semibold">{precisaPausa ? "Pausa recomendada" : "Sem pausa necessária agora"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{precisaPausa ? "15 min em área climatizada com hidratação." : "Leituras dentro dos limites e pausa recente."}</p>
            <Button className="mt-3 h-11 w-full" onClick={() => void run(registerPause(w.id), "Pausa registrada.")}><Coffee />Registrar pausa</Button>
          </div>
        </div>
      </div>
      <div className={card}>
        <h2 className="mb-2 font-semibold">Histórico dos últimos 30 dias</h2>
        {past.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma ocorrência.</p> :
          <ul className="divide-y divide-border text-sm">{past.map((i) => <li key={i.id} className="flex gap-4 py-2"><span className="font-mono text-muted-foreground">{fmtDate(i.criado_em)} {fmtTime(i.criado_em).slice(0, 5)}</span><span className="flex-1">{i.detalhe || labelTipo(i.tipo)} · {zoneOf(i.zone_id).nome}</span><span className="text-muted-foreground">{STATUS[i.status]}{i.resolvido_por === "sistema" ? " (automático)" : ""}</span></li>)}</ul>}
      </div>
      <p className="flex items-center gap-2 text-xs text-muted-foreground"><Lock className="size-3" />Dados usados apenas para segurança.</p>
    </div>
  );
}
