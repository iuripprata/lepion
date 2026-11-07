import { createFileRoute, Link } from "@tanstack/react-router";
import { deviceOffline, fmtDate, fmtTime, rssiPct, useSim } from "@/lib/store";
import { SevTag } from "@/components/sev";

export const Route = createFileRoute("/dispositivos")({
  head: () => ({
    meta: [
      { title: "Dispositivos — Painel LEPION" },
      { name: "description", content: "Bateria, sinal, sincronização e calibração dos EPIs conectados." },
      { property: "og:title", content: "Dispositivos — Painel LEPION" },
      { property: "og:description", content: "Bateria, sinal, sincronização e calibração dos EPIs conectados." },
    ],
  }),
  component: Dispositivos,
});

const VALIDADE = 180 * 86_400_000;

function Dispositivos() {
  const s = useSim((x) => x);
  // capacete físico primeiro, depois os simulados
  // só EPIs de trabalhadores visíveis (com o simulador desligado, os simulados somem)
  const visiveis = new Set(s.workers.map((w) => w.id));
  const devs = Object.values(s.devices).filter((d) => d.worker_id && visiveis.has(d.worker_id)).sort((a, b) => Number(a.simulado) - Number(b.simulado) || a.id.localeCompare(b.id));
  const online = devs.filter((d) => !deviceOffline(s, d)).length;
  return (
    <>
    <div className="mx-auto max-w-[760px] space-y-5 lg:hidden">
      <div className="space-y-1">
        <h1 className="font-display text-[clamp(22px,7vw,30px)] font-bold leading-tight">{online} de {devs.length} EPIs enviando dados</h1>
        <p className="text-sm text-muted-foreground">Calibração do sensor de gás válida por 180 dias.</p>
      </div>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-3">
        {devs.map((d) => {
          const w = s.workers.find((x) => x.id === d.worker_id);
          const off = deviceOffline(s, d);
          const venc = d.ultima_calibracao_gas !== null && s.now - d.ultima_calibracao_gas > VALIDADE;
          const sinal = rssiPct(d.rssi);
          return (
            <li key={d.id} className="space-y-3 rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="block font-mono text-[15px] font-semibold">{d.id}</span>
                  {w ? <Link to="/trabalhador/$id" params={{ id: w.id }} className="block truncate text-[13px] text-muted-foreground hover:underline">{w.nome}{d.simulado ? "" : " · capacete físico"}</Link> : <span className="text-[13px] text-muted-foreground">—</span>}
                </span>
                <SevTag sev={off ? "offline" : "ok"} />
              </div>
              <dl className="grid grid-cols-3 gap-2">
                <div className="space-y-1"><dt className="text-[11px] text-[#8E98C8]">Sinal</dt><dd className="font-display text-lg font-bold">{off ? "—" : sinal === null ? "online" : `${sinal}%`}</dd>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden><div className="h-full rounded-full bg-primary" style={{ width: `${off ? 0 : sinal ?? 100}%` }} /></div></div>
                <div className="space-y-1"><dt className="text-[11px] text-[#8E98C8]">Último dado</dt><dd className="font-mono text-sm leading-[22px]">{fmtTime(d.ultimo_sinal_em).slice(0, 5)}</dd></div>
                <div className="space-y-1"><dt className="text-[11px] text-[#8E98C8]">Gás calibrado</dt><dd className={`font-mono text-sm leading-[22px] ${venc ? "text-warn" : ""}`}>{d.ultima_calibracao_gas ? fmtDate(d.ultima_calibracao_gas).slice(0, 5) : "—"}{venc ? " ▲" : ""}</dd></div>
              </dl>
              <p className="text-xs text-[#8E98C8]">{d.simulado ? "Simulado" : "Físico"} · bateria {d.bateria === null ? "não medida" : `${d.bateria}%`}{venc ? " · calibração vencida" : ""}</p>
            </li>
          );
        })}
      </ul>
    </div>
    <div className="hidden rounded-lg border border-border bg-card p-4 lg:block">
      <h1 className="mb-1 text-lg font-semibold">EPIs conectados</h1>
      <p className="mb-4 text-sm text-muted-foreground">Calibração do sensor de gás válida por 180 dias.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-2">EPI</th><th>Origem</th><th>Tipo</th><th>Bateria</th><th>Sinal</th><th>Última sincronização</th><th>Calibração do gás</th><th>Trabalhador</th></tr></thead>
          <tbody>
            {devs.map((d) => {
              const w = s.workers.find((x) => x.id === d.worker_id);
              const off = deviceOffline(s, d);
              const venc = d.ultima_calibracao_gas !== null && s.now - d.ultima_calibracao_gas > VALIDADE;
              const sinal = rssiPct(d.rssi);
              return (
                <tr key={d.id} className="border-t border-border">
                  <td className="py-2 font-mono">{d.id}</td><td>{d.simulado ? <span className="text-muted-foreground">Simulado</span> : <span className="font-semibold text-primary">Físico</span>}</td><td className="capitalize">{d.tipo}</td>
                  <td>{d.bateria === null ? <span className="text-muted-foreground">não medida</span> : <span className={`font-mono ${d.bateria < 10 ? "text-crit" : d.bateria < 25 ? "text-warn" : ""}`}>{d.bateria}%</span>}</td>
                  <td>{off ? <SevTag sev="offline" /> : <span className="font-mono">{sinal === null ? "online" : `${sinal}%`}</span>}</td>
                  <td className="font-mono">{fmtTime(d.ultimo_sinal_em)}</td>
                  <td>{venc ? <span className="flex items-center gap-2"><SevTag sev="atencao" /><span className="text-warn">Vencida · {fmtDate(d.ultima_calibracao_gas)}</span></span> : <span className="font-mono">{fmtDate(d.ultima_calibracao_gas)}</span>}</td>
                  <td>{w ? <Link to="/trabalhador/$id" params={{ id: w.id }} className="hover:underline">{w.nome}</Link> : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
    </>
  );
}
