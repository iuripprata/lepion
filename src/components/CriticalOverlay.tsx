import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft, Check, CheckCheck, Phone, Siren, Vibrate, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  acknowledgeIncident, fmt1, fmtDur, fmtGas, fmtTime, labelTipo, setIncidentStatus, useSim, zoneOf, type Incident,
} from "@/lib/store";

function useAlarm(on: boolean) {
  const ctx = useRef<AudioContext | null>(null);
  useEffect(() => {
    if (!on) return;
    const beep = () => {
      try {
        ctx.current ??= new AudioContext();
        const c = ctx.current; const o = c.createOscillator(); const g = c.createGain();
        o.frequency.value = 880; o.type = "square"; g.gain.value = 0.06;
        o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + 0.35);
      } catch { /* áudio bloqueado pelo navegador */ }
    };
    beep(); const id = setInterval(beep, 900);
    return () => clearInterval(id);
  }, [on]);
}

/** Linha do tempo fiel ao que o firmware v2 realmente faz. */
function timelineOf(inc: Incident): [number, string, string][] {
  const r = inc.snapshot; const t = inc.criado_em;
  const base: Record<string, [number, string, string][]> = {
    queda: [
      [t, "Queda livre seguida de impacto", `O acelerômetro registrou queda livre (abaixo de 0,4 g) e, logo depois, impacto${r.aceleracao_g ? ` de ${fmt1(r.aceleracao_g)} g` : ""}.`],
      [t, "Capacete entrou em EMERGÊNCIA", "LED vermelho piscando rápido e apito rápido no próprio capacete."],
    ],
    impacto: [
      [t, "Impacto forte na cabeça", `Pancada acima de 3 g${r.aceleracao_g ? ` (pico de ${fmt1(r.aceleracao_g)} g)` : ""}, mesmo sem queda.`],
      [t, "Capacete entrou em EMERGÊNCIA", "LED vermelho piscando rápido e apito rápido no próprio capacete."],
    ],
    caido: [
      [t - 10_000, "Capacete deitado", `Inclinação acima de 60°${r.inclinacao ? ` (${fmt1(r.inclinacao)}°)` : ""}.`],
      [t, "Trabalhador caído", "Capacete deitado por mais de 10 s: o capacete entrou em EMERGÊNCIA."],
    ],
    gas: [[t, "Gás acima do ar limpo", inc.detalhe]],
  };
  const steps = base[inc.tipo] ?? [[t, "Leitura fora do limite", inc.detalhe]];
  return [...steps, [t, "Alerta recebido pela plataforma", "Sala de controle notificada com alarme sonoro."]];
}

export function CriticalOverlay() {
  const s = useSim((x) => x);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const inc = s.incidents.find((i) => i.severidade === "critico" && i.status === "aberto" && !dismissed.includes(i.id));
  const unacked = s.incidents.some((i) => i.severidade === "critico" && i.status === "aberto" && !i.reconhecido_em);
  useAlarm(unacked && !s.muted);
  if (!inc) return null;

  const w = s.workers.find((x) => x.id === inc.worker_id);
  const d = s.devices[inc.device_id];
  const z = zoneOf(inc.zone_id);
  const el = s.now - inc.criado_em;
  const sup = s.workers.find((x) => x.supervisor);
  const same = s.workers.filter((x) => x.zone_id === z.id && x.id !== w?.id);
  const r = inc.snapshot;
  const acked = !!inc.reconhecido_em;
  const timeline = timelineOf(inc);
  if (acked) timeline.push([inc.reconhecido_em!, "Alerta reconhecido", `Por ${inc.reconhecido_por}.`]);

  const readings: [string, string, string][] = [
    ["Aceleração", r.aceleracao_g !== undefined ? `${fmt1(r.aceleracao_g)} g` : "—", r.aceleracao_g !== undefined && r.aceleracao_g > 3 ? "acima do limiar de impacto" : "—"],
    ["Inclinação", r.inclinacao !== undefined ? `${Math.round(r.inclinacao)}°` : "—", r.inclinacao !== undefined && r.inclinacao > 60 ? "capacete deitado" : "em pé"],
    ["Sensação térmica", r.sensacao !== undefined ? `${fmt1(r.sensacao)} °C` : "—", r.sensacao !== undefined && r.sensacao >= z.limite_sensacao ? "acima do limite" : "normal"],
    ["Gás (× ar limpo)", r.gas_pronto === false ? "aquecendo" : fmtGas(r.gas_razao), r.gas_razao !== undefined && r.gas_razao >= z.gas_razao_atencao ? "acima do normal" : "normal"],
    ["Umidade", r.umidade !== undefined ? `${Math.round(r.umidade)}%` : "—", r.umidade !== undefined && r.umidade < z.limite_umidade_min ? "ar seco" : "normal"],
    ["Bateria do EPI", d?.bateria == null ? "—" : `${d.bateria}%`, `${d?.bateria == null ? "não medida · " : ""}${d?.simulado ? "EPI simulado" : "capacete físico"}`],
  ];

  const run = (p: Promise<unknown>, ok: string) => p.then(() => toast.success(ok)).catch((e: Error) => toast.error(`Não foi possível salvar: ${e.message}`));
  const btn = "h-12 w-full justify-start text-base";

  return (
    <div role="alertdialog" aria-label="Alerta crítico" className="fixed inset-0 z-50 overflow-y-auto bg-background">
      <div className={`border-b-4 border-crit bg-crit/15 px-6 py-5 ${acked ? "" : "animate-crit"}`}>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 font-mono text-sm font-semibold text-crit"><svg viewBox="0 0 12 12" className="size-3 fill-crit" aria-hidden><rect width="12" height="12" /></svg>ALERTA CRÍTICO · {acked ? "RECONHECIDO" : "ALARME SONORO ATIVO"}</div>
            <h1 className="mt-1 text-3xl font-semibold">{inc.detalhe || labelTipo(inc.tipo)} — {w?.nome ?? inc.device_id}</h1>
          </div>
          <div className="text-right"><div className="text-sm text-muted-foreground">Tempo desde o evento</div><div className="font-mono text-5xl font-semibold text-crit">{fmtDur(el)}</div></div>
        </div>
        {!acked && <p className="mt-3 text-sm">Reconheça o alerta para silenciar o alarme. O tempo até o reconhecimento entra no indicador de tempo de resposta.</p>}
      </div>
      <div className="grid gap-6 p-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <div className="grid gap-4 rounded-lg border border-border bg-card p-5 md:grid-cols-3">
            <div className="flex gap-3"><div className="grid size-12 place-items-center rounded-full bg-surface-2 font-semibold">{(w?.nome ?? "?").split(" ").map((p) => p[0]).join("").slice(0, 2)}</div>
              <div>
                {w ? <Link to="/trabalhador/$id" params={{ id: w.id }} className="font-semibold underline-offset-2 hover:underline">{w.nome}</Link> : <span className="font-semibold">—</span>}
                <div className="text-sm text-muted-foreground">{w?.cargo} · Turno {w?.turno}</div>
                <div className="font-mono text-sm text-muted-foreground">{inc.device_id} · {d?.tipo ?? "capacete"}</div>
              </div></div>
            <div><div className="text-xs uppercase text-muted-foreground">Local</div><div className="font-semibold">Zona {z.nome}</div><div className="text-sm text-muted-foreground">Gateway {z.gateway_id}</div></div>
            <div><div className="text-xs uppercase text-muted-foreground">Na mesma zona</div><div className="font-semibold">{same[0]?.nome ?? "Ninguém"}{same[0]?.supervisor ? " · Supervisor" : ""}</div><div className="text-sm text-muted-foreground">{same.length > 1 ? `e mais ${same.length - 1} ${same.length === 2 ? "trabalhador" : "trabalhadores"}` : ""}</div></div>
          </div>
          <section><h2 className="mb-3 font-semibold">Leituras do EPI no momento do evento</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {readings.map(([l, v, n]) => <div key={l} className="rounded-lg border border-border bg-card p-3"><div className="text-xs text-muted-foreground">{l}</div><div className="font-mono text-2xl font-semibold">{v}</div><div className="text-xs text-muted-foreground">{n}</div></div>)}
            </div></section>
          <section><h2 className="mb-3 font-semibold">Linha do tempo do evento</h2>
            <ol className="space-y-3 border-l-2 border-border pl-5">
              {timeline.map(([t, a, b]) => <li key={a} className="relative"><span className="absolute -left-[27px] top-1.5 size-3 rounded-full bg-primary" /><div className="font-mono text-sm text-muted-foreground">{fmtTime(t)}</div><div className="font-semibold">{a}</div><div className="text-sm text-muted-foreground">{b}</div></li>)}
            </ol></section>
        </div>
        <aside className="space-y-3">
          <h2 className="font-semibold">Resposta</h2>
          <Button className={`${btn} bg-crit text-background hover:bg-crit/90`} onClick={() => void run(acknowledgeIncident(inc.id), "Alerta reconhecido. Alarme silenciado.")} disabled={acked}><Check />{acked ? "Alerta reconhecido" : "Reconhecer alerta"}</Button>
          <Button variant="outline" className={btn} onClick={() => void run(setIncidentStatus(inc.id, "em_atendimento"), "Brigada de emergência acionada. Ocorrência em atendimento.")}><Siren />Acionar brigada de emergência</Button>
          <Button variant="outline" className={btn} onClick={() => void run(setIncidentStatus(inc.id, "resolvido"), "Ocorrência encerrada.")}><CheckCheck />Encerrar: trabalhador atendido</Button>
          <Button variant="ghost" className={btn} onClick={() => void run(setIncidentStatus(inc.id, "falso_positivo"), "Marcado como falso positivo.")}><X />Marcar como falso positivo</Button>
          <div className="mt-4 rounded-lg border border-border bg-card p-4 text-sm">
            <div className="mb-2 font-semibold">Próximas integrações</div>
            <p className="text-muted-foreground">Estes recursos ainda não estão ligados ao capacete ou a outros sistemas:</p>
            <Button variant="outline" className="mt-2 h-11 w-full justify-start" onClick={() => toast(`Previsto: ligar para ${sup?.nome ?? "o supervisor"} pela central telefônica.`)}><Phone />Ligar para {sup?.nome ?? "supervisor"}</Button>
            <Button variant="outline" className="mt-2 h-11 w-full justify-start" onClick={() => toast("Previsto: o firmware v2 ainda não recebe comandos da plataforma.")}><Vibrate />Enviar aviso ao EPI</Button>
          </div>
          <Button variant="secondary" className={btn} onClick={() => setDismissed((x) => [...x, inc.id])}><ArrowLeft />Voltar ao monitoramento</Button>
        </aside>
      </div>
    </div>
  );
}
