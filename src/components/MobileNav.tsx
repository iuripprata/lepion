import { Link } from "@tanstack/react-router";
import { BarChart3, BellRing, FileText, HardHat, Users } from "lucide-react";
import { isOpen, useSim } from "@/lib/store";

/** Abas fixas no rodapé, só no celular (abaixo de 1024 px). */
const TABS = [
  { to: "/", label: "Equipe", Icon: Users, exact: true },
  { to: "/ocorrencias", label: "Ocorrências", Icon: BellRing, exact: false },
  { to: "/analitico", label: "Analítico", Icon: BarChart3, exact: false },
  { to: "/dispositivos", label: "EPIs", Icon: HardHat, exact: false },
  { to: "/relatorios", label: "Relatórios", Icon: FileText, exact: false },
] as const;

export function MobileNav() {
  // ocorrências que ainda pedem ação (abertas ou em atendimento) dos trabalhadores visíveis
  const abertas = useSim((s) => {
    const ids = new Set(s.workers.map((w) => w.id));
    return s.incidents.filter((i) => isOpen(i) && (!i.worker_id || ids.has(i.worker_id))).length;
  });
  return (
    <nav
      aria-label="Seções do painel"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-card px-1 pb-[max(env(safe-area-inset-bottom),4px)] lg:hidden"
    >
      {TABS.map(({ to, label, Icon, exact }) => (
        <Link
          key={to}
          to={to}
          activeOptions={{ exact }}
          className="group relative flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-md text-[11px] font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-ring data-[status=active]:font-semibold data-[status=active]:text-primary"
        >
          <span className="absolute inset-x-[22%] top-0 h-[3px] rounded-b bg-transparent group-data-[status=active]:bg-primary" aria-hidden />
          <span className="relative">
            <Icon className="size-[22px]" strokeWidth={1.8} aria-hidden />
            {to === "/ocorrencias" && abertas > 0 && (
              <span className="absolute -right-3 -top-1.5 min-w-[18px] rounded-full bg-crit px-1 text-center font-sans text-[11px] font-bold leading-[18px] text-background">
                {abertas > 99 ? "99+" : abertas}
              </span>
            )}
          </span>
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
