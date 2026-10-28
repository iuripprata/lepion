import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { fmt1, fmtDur, fmtTime, labelTipo, updateIncident, useSim, zoneOf, resolveWorker } from "@/lib/sim";
import { toast } from "sonner";
import { Phone, Siren, Vibrate, Check, X, ArrowLeft } from "lucide-react";

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
      } catch { /* audio blocked */ }
    };
    beep(); const id = setInterval(beep, 900);
    return () => clearInterval(id);
  }, [on]);
}

export function CriticalOverlay() {
  const s = useSim((x) => x);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const inc = s.incidents.find((i) => i.severidade === "critico" && i.status === "aberto" && !dismissed.includes(i.id));
  const unacked = s.incidents.some((i) => i.severidade === "critico" && i.status === "aberto" && !i.reconhecido_em);
  useAlarm(unacked && !s.muted);
  if (!inc) return null;

  const w = s.workers.find((x) => x.id === inc.worker_id)!; const z = zoneOf(inc.zone_id); const d = s.devices[inc.device_id];
  const el = s.now - inc.criado_em; const sup = s.workers.find((x) => x.supervisor)!;
  const same = s.workers.filter((x) => x.zone_id === z.id && x.id !== w.id);
  const r = inc.snapshot;
  const acked = !!inc.reconhecido_em;
  const isFall = inc.tipo === "queda";
  const t0 = inc.criado_em - 14000;
  const timeline = isFall ? [
    [t0, "Queda livre detectada", "Aceleração próxima de zero por 0,4 s."],
    [t0 + 1000, "Impacto registrado", `Pico de ${fmt1(r.aceleracao_g)} g no acelerômetro do ${d.tipo}.`],
    [t0 + 2000, "EPI pede confirmação ao trabalhador", "Vibração e bipe: “apertar o botão se estiver bem” — janela de 10 s."],
    [t0 + 12000, "Sem resposta e sem movimento", "Queda confirmada pelo dispositivo, reduzindo falsos positivos."],
    [inc.criado_em, "Alerta enviado", "Sala de controle e app do supervisor notificados."],
  ] : [
    [inc.criado_em - 4000, "Leitura fora do limite", inc.detalhe],
    [inc.criado_em, "Alerta enviado", "Sala de controle e app do supervisor notificados."],
  ];
  if (acked) timeline.push([inc.reconhecido_em!, "Alerta reconhecido", `Por ${inc.reconhecido_por}.`]);

  const readings = [
    ["Impacto (acelerômetro)", `${fmt1(r.aceleracao_g)} g`, r.aceleracao_g > 2.5 ? "acima do limiar de queda" : "normal"],
    ["Imobilidade", r.movimento ? "—" : `${Math.round((s.now - t0) / 1000)} s`, r.movimento ? "em movimento" : "sem movimento desde o impacto"],
    ["Temperatura", `${fmt1(r.temperatura)} °C`, r.temperatura > z.limite_temp ? "acima do limite" : "normal para a zona"],
    ["Gás CO", `${r.co_ppm} ppm`, r.co_ppm > z.limite_co ? "acima do limite" : "normal"],
    ["Umidade", `${r.umidade}%`, r.umidade < z.limite_umidade_min ? "ar seco" : "normal"],
    ["Bateria do EPI", `${d.bateria}%`, "conexão estável"],
  ];
  const btn = "h-12 w-full justify-start text-base";
  const ack = () => { updateIncident(inc.id, { reconhecido_em: s.now, reconhecido_por: "Operador da sala de controle", status: "aberto" }); toast.success("Alerta reconhecido. Alarme silenciado."); };

  return (
    <div role="alertdialog" aria-label="Alerta crítico" className="fixed inset-0 z-50 overflow-y-auto bg-background">
      <div className={`border-b-4 border-crit bg-crit/15 px-6 py-5 ${acked ? "" : "animate-crit"}`}>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 font-mono text-sm font-semibold text-crit"><svg viewBox="0 0 12 12" className="size-3 fill-crit"><rect width="12" height="12" /></svg>ALERTA CRÍTICO · {acked ? "RECONHECIDO" : "ALARME SONORO ATIVO"}</div>
            <h1 className="mt-1 text-3xl font-semibold">{labelTipo(inc.tipo)} — {w.nome}</h1>
          </div>
          <div className="text-right"><div className="text-sm text-muted-foreground">Tempo desde o evento</div><div className="font-mono text-5xl font-semibold text-crit">{fmtDur(el)}</div></div>
        </div>
        {!acked && <p className="mt-3 text-sm">Sem reconhecimento, o alerta escala para o supervisor de turno em <span className="font-mono font-semibold">{fmtDur(60000 - el)}</span> e para a brigada em <span className="font-mono font-semibold">{fmtDur(120000 - el)}</span>.</p>}
      </div>
      <div className="grid gap-6 p-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <div className="grid gap-4 rounded-lg border border-border bg-card p-5 md:grid-cols-3">
            <div className="flex gap-3"><div className="grid size-12 place-items-center rounded-full bg-surface-2 font-semibold">{w.nome.split(" ").map((p) => p[0]).join("").slice(0, 2)}</div>
              <div><Link to="/trabalhador/$id" params={{ id: w.id }} className="font-semibold underline-offset-2 hover:underline">{w.nome}</Link><div className="text-sm text-muted-foreground">{w.cargo} · Turno {w.turno}</div><div className="font-mono text-sm text-muted-foreground">{d.id} · {d.tipo}</div></div></div>
            <div><div className="text-xs uppercase text-muted-foreground">Local</div><div className="font-semibold">Zona {z.nome}</div><div className="text-sm text-muted-foreground">Gateway {z.gateway_id} · sinal {d.sinal > 75 ? "forte" : "médio"}</div></div>
            <div><div className="text-xs uppercase text-muted-foreground">Na mesma zona</div><div className="font-semibold">{same[0]?.nome ?? "Ninguém"}{same[0]?.supervisor ? " · Supervisor" : ""}</div><div className="text-sm text-muted-foreground">{same.length > 1 ? `e mais ${same.length - 1} trabalhadores` : ""}</div></div>
          </div>
          <section><h2 className="mb-3 font-semibold">Leituras do EPI no momento do evento</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {readings.map(([l, v, n]) => <div key={l} className="rounded-lg border border-border bg-card p-3"><div className="text-xs text-muted-foreground">{l}</div><div className="font-mono text-2xl font-semibold">{v}</div><div className="text-xs text-muted-foreground">{n}</div></div>)}
            </div></section>
          <section><h2 className="mb-3 font-semibold">{isFall ? "Como o sistema confirmou a queda" : "Linha do tempo do evento"}</h2>
            <ol className="space-y-3 border-l-2 border-border pl-5">
              {timeline.map(([t, a, b]) => <li key={String(a)} className="relative"><span className="absolute -left-[27px] top-1.5 size-3 rounded-full bg-primary" /><div className="font-mono text-sm text-muted-foreground">{fmtTime(t as number)}</div><div className="font-semibold">{a}</div><div className="text-sm text-muted-foreground">{b}</div></li>)}
            </ol></section>
        </div>
        <aside className="space-y-3">
          <h2 className="font-semibold">Resposta</h2>
          <Button className={`${btn} bg-crit text-background hover:bg-crit/90`} onClick={ack} disabled={acked}><Check />{acked ? "Alerta reconhecido" : "Reconhecer alerta"}</Button>
          <Button variant="outline" className={btn} onClick={() => { updateIncident(inc.id, { status: "em_atendimento", reconhecido_em: inc.reconhecido_em ?? s.now, reconhecido_por: "Operador da sala de controle" }); toast.success("Brigada de emergência acionada."); }}><Siren />Acionar brigada de emergência</Button>
          <Button variant="outline" className={btn} onClick={() => toast(`Ligando para ${sup.nome}…`)}><Phone />Ligar para {sup.nome} (supervisor)</Button>
          <Button variant="outline" className={btn} onClick={() => toast(`Vibração enviada ao ${d.id}.`)}><Vibrate />Enviar vibração ao EPI</Button>
          <Button variant="ghost" className={btn} onClick={() => { updateIncident(inc.id, { status: "falso_positivo", reconhecido_em: inc.reconhecido_em ?? s.now, resolvido_em: s.now, reconhecido_por: "Operador da sala de controle" }); resolveWorker(w.id); toast("Marcado como falso positivo."); }}><X />Marcar como falso positivo</Button>
          <div className="mt-4 rounded-lg border border-border bg-card p-4 text-sm">
            <div className="mb-2 font-semibold">Quem já foi avisado</div>
            {[["Sala de controle", acked ? "Reconhecido" : "Alarme ativo"], ["Supervisor (app)", el > 60000 || acked ? "Push enviado · lido" : "Push enviado · não lido"], ["Brigada", inc.status === "em_atendimento" || el > 120000 ? "Acionada" : "Na fila de escalonamento"]].map(([a, b]) => <div key={a} className="flex justify-between border-t border-border py-2"><span>{a}</span><span className="text-muted-foreground">{b}</span></div>)}
          </div>
          <Button variant="secondary" className={btn} onClick={() => setDismissed((d) => [...d, inc.id])}><ArrowLeft />Voltar ao monitoramento</Button>
        </aside>
      </div>
    </div>
  );
}
