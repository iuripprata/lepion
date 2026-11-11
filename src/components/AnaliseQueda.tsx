import { analiseQueda, fmt1, type Reading } from "@/lib/store";

/**
 * Análise da queda feita no próprio capacete (firmware v3): tipo provável,
 * se a pessoa se mexeu, opinião da IA embarcada e os números do evento.
 * Não aparece para leituras do v2 ou do simulador, que não trazem esses campos.
 */
export function AnaliseQueda({ r, compacta = false }: { r: Reading; compacta?: boolean }) {
  const a = analiseQueda(r);
  if (!a) return null;

  if (compacta) {
    const partes = [a.tipo, a.consciente, a.ia !== null ? `IA ${a.ia}%` : null].filter(Boolean);
    return <span className="block text-[13px] leading-[18px] text-muted-foreground">Capacete: {partes.join(" · ")}</span>;
  }

  const numeros: [string, string][] = [];
  if (a.pico_g !== null) numeros.push(["Pico de impacto", `${fmt1(a.pico_g)} g`]);
  if (a.pico_giro !== null) numeros.push(["Pico de giro", `${Math.round(a.pico_giro)} °/s`]);
  if (a.queda_livre_ms !== null) numeros.push(["Queda livre", `${Math.round(a.queda_livre_ms)} ms`]);
  if (a.nota_gas !== null) numeros.push(["Nota de gás", String(Math.round(a.nota_gas))]);
  if (a.nota_calor !== null) numeros.push(["Nota de calor", String(Math.round(a.nota_calor))]);

  return (
    <section aria-labelledby="analise-queda" className="rounded-lg border border-border bg-card p-4">
      <h2 id="analise-queda" className="mb-3 font-semibold">O que o capacete concluiu</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <div className="text-xs uppercase text-muted-foreground">Tipo provável</div>
          <div className="font-display text-xl font-semibold">{a.tipo ?? "Não informado"}</div>
          {a.consciente && <div className={`text-sm ${a.desacordado ? "font-semibold text-crit" : "text-muted-foreground"}`}>{a.consciente}</div>}
        </div>
        {a.ia !== null && (
          <div>
            <div className="text-xs uppercase text-muted-foreground">Opinião da IA embarcada</div>
            <div className="font-display text-xl font-semibold tabular-nums">{a.ia}%</div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden><div className="h-full rounded-full bg-primary" style={{ width: `${a.ia}%` }} /></div>
            <div className="mt-1 text-xs text-muted-foreground">chance de ser uma queda real</div>
          </div>
        )}
        {a.risco !== null && (
          <div>
            <div className="text-xs uppercase text-muted-foreground">Risco calculado</div>
            <div className="font-display text-xl font-semibold tabular-nums">{a.risco}<span className="text-sm text-muted-foreground"> / 100</span></div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden><div className="h-full rounded-full bg-primary" style={{ width: `${a.risco}%` }} /></div>
          </div>
        )}
      </div>
      {numeros.length > 0 && (
        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-border pt-3 text-sm">
          {numeros.map(([k, v]) => <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-mono">{v}</dd></div>)}
        </dl>
      )}
      <p className="mt-3 text-xs text-muted-foreground">Estimativa do capacete. Se não foi uma queda real, marque como falso positivo: isso ajuda a calibrar o capacete.</p>
    </section>
  );
}
