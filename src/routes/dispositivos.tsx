import { createFileRoute, Link } from "@tanstack/react-router";
import { fmtDate, fmtTime, useSim } from "@/lib/sim";
import { SevTag } from "@/components/sev";

export const Route = createFileRoute("/dispositivos")({
  head: () => ({
    meta: [
      { title: "Dispositivos — Painel de Segurança" },
      { name: "description", content: "Bateria, sinal, sincronização e calibração dos EPIs conectados." },
      { property: "og:title", content: "Dispositivos — Painel de Segurança" },
      { property: "og:description", content: "Bateria, sinal, sincronização e calibração dos EPIs conectados." },
    ],
  }),
  component: Dispositivos,
});

const VALIDADE = 180 * 86_400_000;

function Dispositivos() {
  const s = useSim((x) => x);
  const devs = Object.values(s.devices);
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h1 className="mb-1 text-lg font-semibold">EPIs conectados</h1>
      <p className="mb-4 text-sm text-muted-foreground">Calibração do sensor de gás válida por 180 dias.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-2">EPI</th><th>Tipo</th><th>Bateria</th><th>Sinal</th><th>Última sincronização</th><th>Calibração do gás</th><th>Trabalhador</th></tr></thead>
          <tbody>
            {devs.map((d) => {
              const w = s.workers.find((x) => x.id === d.worker_id)!;
              const off = s.now - d.ultimo_sinal_em > 120_000;
              const venc = s.now - d.ultima_calibracao_gas > VALIDADE;
              return (
                <tr key={d.id} className="border-t border-border">
                  <td className="py-2 font-mono">{d.id}</td><td className="capitalize">{d.tipo}</td>
                  <td><span className={`font-mono ${d.bateria < 10 ? "text-crit" : d.bateria < 25 ? "text-warn" : ""}`}>{d.bateria}%</span></td>
                  <td>{off ? <SevTag sev="offline" /> : <span className="font-mono">{d.sinal}%</span>}</td>
                  <td className="font-mono">{fmtTime(d.ultimo_sinal_em)}</td>
                  <td>{venc ? <span className="flex items-center gap-2"><SevTag sev="atencao" /><span className="text-warn">Vencida · {fmtDate(d.ultima_calibracao_gas)}</span></span> : <span className="font-mono">{fmtDate(d.ultima_calibracao_gas)}</span>}</td>
                  <td><Link to="/trabalhador/$id" params={{ id: w.id }} className="hover:underline">{w.nome}</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
