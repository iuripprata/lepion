import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import {
  acknowledgeIncident, fmtTime, isOpen, labelTipo, setIncidentStatus, useSim, zoneOf, type Incident, type Sev,
} from "@/lib/store";
import { SevTag } from "@/components/sev";

export const Route = createFileRoute("/ocorrencias")({
  head: () => ({
    meta: [
      { title: "Ocorrências — Painel LEPION" },
      { name: "description", content: "Ocorrências do dia: abertas, em atendimento e encerradas, com as ações de cada uma." },
      { property: "og:title", content: "Ocorrências — Painel LEPION" },
      { property: "og:description", content: "Ocorrências do dia: abertas, em atendimento e encerradas, com as ações de cada uma." },
    ],
  }),
  component: Ocorrencias,
});

const D = 86_400_000;
type Aba = "abertas" | "atendimento" | "encerradas";
const ABAS: [Aba, string][] = [["abertas", "Abertas"], ["atendimento", "Em atendimento"], ["encerradas", "Encerradas"]];

function abaDe(i: Incident): Aba {
  if (i.status === "resolvido" || i.status === "falso_positivo") return "encerradas";
  if (i.status === "em_atendimento" || i.reconhecido_em) return "atendimento";
  return "abertas";
}
const sevDe = (i: Incident): Sev => (i.tipo === "offline" ? "offline" : i.severidade);

function Ocorrencias() {
  const s = useSim((x) => x);
  const [aba, setAba] = useState<Aba>("abertas");
  const visiveis = new Set(s.workers.map((w) => w.id));
  // últimas 24 h dos trabalhadores visíveis, mais qualquer ocorrência ainda aberta
  const doDia = s.incidents.filter((i) => (!i.worker_id || visiveis.has(i.worker_id)) && (isOpen(i) || s.now - i.criado_em < D));
  const por = (a: Aba) => doDia.filter((i) => abaDe(i) === a);
  const lista = por(aba).sort((a, b) => (a.severidade === "critico" ? 0 : 1) - (b.severidade === "critico" ? 0 : 1) || b.criado_em - a.criado_em);
  const pedem = por("abertas").length + por("atendimento").length;
  const crit = doDia.filter((i) => isOpen(i) && i.severidade === "critico").length;
  const run = (p: Promise<unknown>, ok: string) => p.then(() => toast.success(ok)).catch((e: Error) => toast.error(`Não foi possível salvar: ${e.message}`));
  const btn = "h-12 rounded-[10px] border border-[#343878] bg-card text-sm font-semibold hover:bg-accent";

  return (
    <div className="mx-auto max-w-[760px] space-y-5 lg:max-w-6xl">
      <div className="space-y-1">
        <h1 className="font-display text-[clamp(22px,7vw,30px)] font-bold leading-tight">
          {pedem ? `${pedem} ${pedem === 1 ? "ocorrência pede" : "ocorrências pedem"} ação agora` : "Nenhuma ocorrência pede ação agora"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {crit ? `${crit} ${crit === 1 ? "crítica" : "críticas"} · ` : ""}{por("abertas").length} {por("abertas").length === 1 ? "aberta" : "abertas"}, {por("atendimento").length} em atendimento · {doDia.length} nas últimas 24 h
        </p>
      </div>

      <div role="tablist" aria-label="Situação das ocorrências" className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-card p-1">
        {ABAS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={aba === id}
            onClick={() => setAba(id)}
            className={`flex min-h-12 flex-col items-center justify-center rounded-[9px] text-[13px] font-semibold leading-4 ${aba === id ? "bg-surface-2 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <span className="font-display text-lg leading-5 tabular-nums">{por(id).length}</span>
            {label}
          </button>
        ))}
      </div>

      {lista.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          {{ abertas: "Nenhuma ocorrência aberta.", atendimento: "Nenhuma ocorrência em atendimento.", encerradas: "Nenhuma ocorrência encerrada nas últimas 24 h." }[aba]}
        </p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-3">
          {lista.map((i) => {
            const w = s.workers.find((x) => x.id === i.worker_id);
            const sev = sevDe(i);
            const a = abaDe(i);
            return (
              <li key={i.id} className={`space-y-2.5 rounded-xl border bg-card p-4 ${sev === "critico" && a !== "encerradas" ? "border-crit" : "border-border"}`}>
                <div className="flex items-center justify-between gap-2">
                  <SevTag sev={sev} />
                  <span className="font-mono text-[13px] text-[#8E98C8]">{fmtTime(i.criado_em).slice(0, 5)}</span>
                </div>
                <div className="space-y-1">
                  <h2 className="font-display text-lg font-bold leading-[22px]">{i.detalhe || labelTipo(i.tipo)}</h2>
                  {w ? (
                    <Link to="/trabalhador/$id" params={{ id: w.id }} className="text-sm text-muted-foreground hover:text-foreground hover:underline">{w.nome} · {zoneOf(i.zone_id).nome}</Link>
                  ) : (
                    <span className="text-sm text-muted-foreground">{i.device_id} · {zoneOf(i.zone_id).nome}</span>
                  )}
                  <p className="text-[13px] leading-[18px] text-[#8E98C8]">
                    {a === "encerradas"
                      ? `${i.status === "falso_positivo" ? "Falso positivo" : "Resolvida"}${i.resolvido_em ? ` às ${fmtTime(i.resolvido_em).slice(0, 5)}` : ""}${i.resolvido_por === "sistema" ? " · encerrada pelo sistema" : i.resolvido_por ? ` · ${i.resolvido_por}` : ""}`
                      : i.reconhecido_em
                        ? `Reconhecida às ${fmtTime(i.reconhecido_em)} por ${i.reconhecido_por ?? "—"}`
                        : "Ninguém reconheceu ainda"}
                  </p>
                </div>
                {a === "abertas" && (
                  <button type="button" className="h-12 w-full rounded-[10px] bg-surface-2 text-[15px] font-semibold hover:bg-[#343878]" onClick={() => void run(acknowledgeIncident(i.id), "Ocorrência reconhecida.")}>
                    Reconhecer
                  </button>
                )}
                {a === "atendimento" && (
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" className={btn} onClick={() => void run(setIncidentStatus(i.id, "resolvido"), "Ocorrência encerrada.")}>Resolvido</button>
                    <button type="button" className={btn} onClick={() => void run(setIncidentStatus(i.id, "falso_positivo"), "Marcado como falso positivo.")}>Falso positivo</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-center text-xs text-[#8E98C8]">Cada ação fica registrada com o horário · dados usados apenas para segurança</p>
    </div>
  );
}
