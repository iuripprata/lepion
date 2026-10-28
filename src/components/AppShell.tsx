import { Link } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Loader2, Zap } from "lucide-react";
import { toast } from "sonner";
import { fmtDate, fmtTime, setFilter, simulateEvent, startStore, useSim } from "@/lib/store";
import { CriticalOverlay } from "./CriticalOverlay";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

const tabs = [
  { to: "/", label: "Monitoramento" },
  { to: "/analitico", label: "Analítico" },
  { to: "/dispositivos", label: "Dispositivos" },
  { to: "/relatorios", label: "Relatórios" },
] as const;

const sel = "h-11 rounded-md border border-border bg-card px-3 text-sm text-foreground";

async function simular(kind: "queda" | "calor" | "gas") {
  try {
    await simulateEvent(kind);
  } catch (e) {
    toast.error((e as Error).message || "Não foi possível simular o evento.");
  }
}

export function AppShell({ children }: { children: ReactNode }) {
  useEffect(() => startStore(), []);
  const ready = useSim((s) => s.ready);
  const error = useSim((s) => s.error);
  const live = useSim((s) => s.live);
  const zones = useSim((s) => s.zones);
  // horário do dado mais recente recebido de qualquer EPI
  const last = useSim((s) => Object.values(s.devices).reduce((m, d) => Math.max(m, d.ultimo_sinal_em ?? 0), 0));
  const shift = useSim((s) => s.shift);
  const zf = useSim((s) => s.zoneFilter);
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border bg-card">
        <div className="flex flex-wrap items-center gap-4 px-4 py-2">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <img src="/lepion-logo.png" alt="LEPION" width={38} height={40} className="h-10 w-auto" />
            <span className="font-display text-lg">Painel de Segurança</span>
          </Link>
          <nav className="flex gap-1">
            {tabs.map((t) => (
              <Link key={t.to} to={t.to} activeOptions={{ exact: t.to === "/" }} className="flex h-11 items-center rounded-md px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground" activeProps={{ className: "!text-foreground bg-accent shadow-[inset_0_-2px_0_var(--primary)]" }}>
                {t.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex flex-wrap items-center gap-2 text-sm">
            <span className="flex items-center gap-2 text-muted-foreground" title={live ? "Recebendo atualizações em tempo real" : "Reconectando ao tempo real"}>
              <span className={`size-2 rounded-full ${live ? "bg-ok" : "bg-warn"}`} aria-hidden />
              <span>{live ? "Ao vivo" : "Reconectando"} · último registro: <span className="font-mono text-foreground" suppressHydrationWarning>{last ? `${fmtDate(last)} ${fmtTime(last)}` : "—"}</span></span>
            </span>
            <select aria-label="Turno" className={sel} value={shift} onChange={(e) => setFilter({ shift: e.target.value as never })}>
              <option value="todos">Todos os turnos</option><option value="A">Turno A</option><option value="B">Turno B</option><option value="C">Turno C</option>
            </select>
            <select aria-label="Zona" className={sel} value={zf} onChange={(e) => setFilter({ zoneFilter: e.target.value })}>
              <option value="todas">Todas as zonas</option>
              {zones.map((z) => <option key={z.id} value={z.id}>{z.nome}</option>)}
            </select>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-11 border-primary text-primary hover:bg-primary hover:text-primary-foreground"><Zap /> Simular evento</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <div className="max-w-60 px-2 py-1 text-xs text-muted-foreground">Modo demonstração: afeta só trabalhadores simulados</div>
                <DropdownMenuItem className="min-h-11" onClick={() => void simular("queda")}>Queda</DropdownMenuItem>
                <DropdownMenuItem className="min-h-11" onClick={() => void simular("calor")}>Calor acima do limite</DropdownMenuItem>
                <DropdownMenuItem className="min-h-11" onClick={() => void simular("gas")}>Vazamento de gás</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <main className="p-4">
        {error && !ready ? (
          <div role="alert" className="mx-auto mt-16 max-w-lg rounded-lg border border-crit bg-card p-6 text-center">
            <div className="font-semibold text-crit">Sem conexão com o banco de dados</div>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          </div>
        ) : !ready ? (
          <div className="mt-24 flex items-center justify-center gap-3 text-muted-foreground"><Loader2 className="size-5 animate-spin" />Carregando dados dos EPIs…</div>
        ) : (
          children
        )}
      </main>
      {ready && <CriticalOverlay />}
    </div>
  );
}
