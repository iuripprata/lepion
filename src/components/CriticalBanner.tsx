import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { fmtDur, isOpen, labelTipo, useSim, zoneOf } from "@/lib/store";
import { abrirAlerta } from "@/components/CriticalOverlay";

/**
 * Faixa vermelha no topo do monitoramento quando há ocorrência crítica.
 * Sem ninguém ter reconhecido: o toque abre o alerta em tela cheia.
 * Já em atendimento: leva ao perfil do trabalhador.
 */
export function CriticalBanner() {
  const s = useSim((x) => x);
  const visiveis = new Set(s.workers.map((w) => w.id));
  const crits = s.incidents
    .filter((i) => i.severidade === "critico" && isOpen(i) && (!i.worker_id || visiveis.has(i.worker_id)))
    .sort((a, b) => Number(!!a.reconhecido_em) - Number(!!b.reconhecido_em) || b.criado_em - a.criado_em);
  const inc = crits[0];
  if (!inc) return null;
  const w = s.workers.find((x) => x.id === inc.worker_id);
  const pendente = inc.status === "aberto" && !inc.reconhecido_em;
  const mais = crits.length - 1;
  const conteudo = (
    <>
      <svg viewBox="0 0 12 12" className="size-7 shrink-0 fill-background" aria-hidden><rect x="0.5" y="0.5" width="11" height="11" rx="1.5" /></svg>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-xs font-bold uppercase tracking-[0.08em]">
          Crítico · {pendente ? "ninguém reconheceu ainda" : "em atendimento"}{mais > 0 ? ` · +${mais}` : ""}
        </span>
        <span className="block font-display text-lg font-bold leading-6">
          {w?.nome ?? inc.device_id} · {zoneOf(inc.zone_id).nome}
        </span>
        <span className="block text-[13px] leading-[18px]">{inc.detalhe || labelTipo(inc.tipo)} · há {fmtDur(s.now - inc.criado_em)}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1 text-sm font-semibold">
        <span className="hidden sm:inline">{pendente ? "Abrir alerta" : "Ver trabalhador"}</span>
        <ChevronRight className="size-5" aria-hidden />
      </span>
    </>
  );
  const cls = "flex w-full items-center gap-3 rounded-xl bg-crit p-4 text-background hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
  if (pendente || !w) {
    return <button type="button" className={cls} onClick={() => abrirAlerta(inc.id)}>{conteudo}</button>;
  }
  return <Link to="/trabalhador/$id" params={{ id: w.id }} className={cls}>{conteudo}</Link>;
}
