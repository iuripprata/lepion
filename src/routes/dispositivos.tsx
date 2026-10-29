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
  return (
    <div className="rounded-lg border border-border bg-card p-4">
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
  );
}
