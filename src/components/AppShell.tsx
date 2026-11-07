import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Loader2, Power, Zap } from "lucide-react";
import { toast } from "sonner";
import { fmtDate, fmtTime, setFilter, setSimulador, simulateEvent, startStore, useSim } from "@/lib/store";
import { CriticalOverlay } from "./CriticalOverlay";
import { MobileNav } from "./MobileNav";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

const tabs = [
  { to: "/", label: "Monitoramento" },
  { to: "/ocorrencias", label: "Ocorrências" },
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

async function alternarSimulador(ativo: boolean) {
  try {
    await setSimulador(ativo);
    toast.success(ativo ? "Simulador ligado: os trabalhadores simulados voltaram ao painel." : "Simulador desligado: o painel mostra só os EPIs físicos.");
  } catch (e) {
    toast.error((e as Error).message || "Não foi possível alterar o simulador.");
  }
}

type Perfil = "supervisor" | "sesmt";
const PERFIL_KEY = "lepion.perfil";
const INICIO: Record<Perfil, "/" | "/ocorrencias"> = { supervisor: "/", sesmt: "/ocorrencias" };

function lerPerfil(): Perfil {
  try {
    return localStorage.getItem(PERFIL_KEY) === "sesmt" ? "sesmt" : "supervisor";
  } catch {
    return "supervisor";
  }
}

/** Perfil de uso: muda só a tela de abertura (supervisor → equipe, SESMT → ocorrências). */
function usePerfil() {
  const [perfil, setPerfil] = useState<Perfil>("supervisor");
  const navigate = useNavigate();
  const path = useRouterState({ select: (r) => r.location.pathname });
  useEffect(() => {
    const p = lerPerfil();
    setPerfil(p);
    // abre na tela do perfil uma vez por sessão, quando a pessoa chega pela página inicial
    try {
      if (path === "/" && p === "sesmt" && !sessionStorage.getItem("lepion.inicio")) void navigate({ to: INICIO[p] });
      sessionStorage.setItem("lepion.inicio", "1");
    } catch { /* armazenamento bloqueado: segue na página atual */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const trocar = (p: Perfil) => {
    setPerfil(p);
    try { localStorage.setItem(PERFIL_KEY, p); } catch { /* sem armazenamento: vale só nesta visita */ }
    void navigate({ to: INICIO[p] });
  };
  return [perfil, trocar] as const;
}

export function AppShell({ children }: { children: ReactNode }) {
  useEffect(() => startStore(), []);
  const [perfil, trocarPerfil] = usePerfil();
  const ready = useSim((s) => s.ready);
  const error = useSim((s) => s.error);
  const live = useSim((s) => s.live);
  const zones = useSim((s) => s.zones);
  // horário do dado mais recente entre os EPIs visíveis no painel
  const last = useSim((s) => s.workers.reduce((m, w) => Math.max(m, s.devices[w.device_id]?.ultimo_sinal_em ?? 0), 0));
  const shift = useSim((s) => s.shift);
  const zf = useSim((s) => s.zoneFilter);
  const simuladorAtivo = useSim((s) => s.simuladorAtivo);
  const nSimulados = useSim((s) => Object.values(s.devices).filter((d) => d.simulado && d.worker_id).length);
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border bg-card">
        <div className="mx-auto flex max-w-[1800px] items-center gap-3 px-4 pb-2 pt-[max(env(safe-area-inset-top),8px)] lg:flex-wrap lg:gap-4">
          <Link to="/" className="flex min-w-0 shrink items-center gap-2 font-semibold">
            <img src="/lepion-logo.png" alt="LEPION" width={38} height={40} className="h-8 w-auto shrink-0 lg:h-10" />
            <span className="truncate font-display text-base lg:text-lg">Painel de Segurança</span>
          </Link>
          <nav className="hidden gap-1 lg:flex">
            {tabs.map((t) => (
              <Link key={t.to} to={t.to} activeOptions={{ exact: t.to === "/" }} className="flex h-11 items-center rounded-md px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground" activeProps={{ className: "!text-foreground bg-accent shadow-[inset_0_-2px_0_var(--primary)]" }}>
                {t.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-2 text-sm lg:shrink lg:flex-wrap">
            <span className="flex items-center gap-2 text-xs text-muted-foreground lg:text-sm" title={live ? "Recebendo atualizações em tempo real" : "Reconectando ao tempo real"}>
              <span className={`size-2 rounded-full ${live ? "bg-ok" : "bg-warn"}`} aria-hidden />
              <span className="sr-only min-[420px]:not-sr-only lg:hidden">{live ? "Ao vivo" : "Reconectando"}</span>
              <span className="hidden lg:inline">{live ? "Ao vivo" : "Reconectando"} · último registro: <span className="font-mono text-foreground" suppressHydrationWarning>{last ? `${fmtDate(last)} ${fmtTime(last)}` : "—"}</span></span>
            </span>
            <select aria-label="Perfil de uso" className={`${sel} max-w-[7.5rem] px-2 lg:max-w-none lg:px-3`} value={perfil} onChange={(e) => trocarPerfil(e.target.value as Perfil)}>
              <option value="supervisor">Supervisor</option><option value="sesmt">SESMT</option>
            </select>
            <select aria-label="Turno" className={`${sel} hidden lg:block`} value={shift} onChange={(e) => setFilter({ shift: e.target.value as never })}>
              <option value="todos">Todos os turnos</option><option value="A">Turno A</option><option value="B">Turno B</option><option value="C">Turno C</option>
            </select>
            <select aria-label="Zona" className={`${sel} hidden lg:block`} value={zf} onChange={(e) => setFilter({ zoneFilter: e.target.value })}>
              <option value="todas">Todas as zonas</option>
              {zones.map((z) => <option key={z.id} value={z.id}>{z.nome}</option>)}
            </select>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" aria-label="Simular evento" className="h-11 w-11 border-primary px-0 text-primary hover:bg-primary hover:text-primary-foreground lg:w-auto lg:px-4"><Zap /><span className="hidden lg:inline">Simular evento</span></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <div className="max-w-60 px-2 py-1 text-xs text-muted-foreground">
                  {simuladorAtivo ? "Modo demonstração: afeta só trabalhadores simulados" : "Ligue o simulador para simular eventos"}
                </div>
                <DropdownMenuItem className="min-h-11" disabled={!simuladorAtivo} onClick={() => void simular("queda")}>Queda</DropdownMenuItem>
                <DropdownMenuItem className="min-h-11" disabled={!simuladorAtivo} onClick={() => void simular("calor")}>Calor acima do limite</DropdownMenuItem>
                <DropdownMenuItem className="min-h-11" disabled={!simuladorAtivo} onClick={() => void simular("gas")}>Vazamento de gás</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="min-h-11" onClick={() => void alternarSimulador(!simuladorAtivo)}>
                  <Power />
                  {simuladorAtivo ? "Desligar simulador" : "Ligar simulador"}
                  <span className="ml-auto text-xs text-muted-foreground">{simuladorAtivo ? `${nSimulados} simulados` : "desligado"}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1800px] p-4 pb-28 lg:pb-4">
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
      <MobileNav />
      {ready && <CriticalOverlay />}
    </div>
  );
}
