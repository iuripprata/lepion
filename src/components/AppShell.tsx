import { Link } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { ShieldAlert, Zap } from "lucide-react";
import { ZONES, fmtDate, fmtTime, setFilter, simulateEvent, startSim, useSim } from "@/lib/sim";
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

export function AppShell({ children }: { children: ReactNode }) {
  useEffect(() => startSim(), []);
  const now = useSim((s) => s.now);
  const shift = useSim((s) => s.shift);
  const zf = useSim((s) => s.zoneFilter);
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border bg-card">
        <div className="flex flex-wrap items-center gap-4 px-4 py-2">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <span className="grid size-8 place-items-center rounded bg-primary text-primary-foreground"><ShieldAlert className="size-5" /></span>
            Painel de Segurança
          </Link>
          <nav className="flex gap-1">
            {tabs.map((t) => (
              <Link key={t.to} to={t.to} activeOptions={{ exact: t.to === "/" }} className="flex h-11 items-center rounded-md px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground" activeProps={{ className: "!text-foreground bg-accent shadow-[inset_0_-2px_0_var(--primary)]" }}>
                {t.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Último registro: <span className="font-mono text-foreground" suppressHydrationWarning>{fmtDate(now)} {fmtTime(now)}</span></span>
            <select aria-label="Turno" className={sel} value={shift} onChange={(e) => setFilter({ shift: e.target.value as never })}>
              <option value="todos">Todos os turnos</option><option value="A">Turno A</option><option value="B">Turno B</option><option value="C">Turno C</option>
            </select>
            <select aria-label="Zona" className={sel} value={zf} onChange={(e) => setFilter({ zoneFilter: e.target.value })}>
              <option value="todas">Todas as zonas</option>
              {ZONES.map((z) => <option key={z.id} value={z.id}>{z.nome}</option>)}
            </select>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-11 border-primary text-primary hover:bg-primary hover:text-primary-foreground"><Zap /> Simular evento</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <div className="px-2 py-1 text-xs text-muted-foreground">Modo demonstração</div>
                <DropdownMenuItem className="min-h-11" onClick={() => simulateEvent("queda")}>Queda confirmada</DropdownMenuItem>
                <DropdownMenuItem className="min-h-11" onClick={() => simulateEvent("calor")}>Calor acima do limite</DropdownMenuItem>
                <DropdownMenuItem className="min-h-11" onClick={() => simulateEvent("gas")}>Vazamento de gás CO</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <main className="p-4">{children}</main>
      <CriticalOverlay />
    </div>
  );
}
