import type { Sev } from "@/lib/store";
import { cn } from "@/lib/utils";

export const SEV_LABEL: Record<Sev, string> = { ok: "OK", atencao: "ATENÇÃO", critico: "CRÍTICO", offline: "OFFLINE" };
const TEXT: Record<Sev, string> = { ok: "text-ok", atencao: "text-warn", critico: "text-crit", offline: "text-off" };
const BORDER: Record<Sev, string> = { ok: "border-ok/50", atencao: "border-warn/60", critico: "border-crit", offline: "border-off/50" };
export const sevText = (s: Sev) => TEXT[s];
export const sevBorder = (s: Sev) => BORDER[s];

export function SevShape({ sev, className }: { sev: Sev; className?: string }) {
  const c = cn("inline-block size-3 shrink-0", className);
  if (sev === "ok") return <svg viewBox="0 0 12 12" className={cn(c, "fill-ok")} aria-hidden><circle cx="6" cy="6" r="5.5" /></svg>;
  if (sev === "atencao") return <svg viewBox="0 0 12 12" className={cn(c, "fill-warn")} aria-hidden><path d="M6 0.5 11.5 11.5H0.5Z" /></svg>;
  if (sev === "critico") return <svg viewBox="0 0 12 12" className={cn(c, "fill-crit")} aria-hidden><rect x="0.5" y="0.5" width="11" height="11" /></svg>;
  return <svg viewBox="0 0 12 12" className={cn(c, "stroke-off fill-none")} strokeWidth="2" aria-hidden><circle cx="6" cy="6" r="4.5" /></svg>;
}

export function SevTag({ sev, className }: { sev: Sev; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-xs font-semibold", TEXT[sev], BORDER[sev], className)}>
      <SevShape sev={sev} className="size-2.5" />
      {SEV_LABEL[sev]}
    </span>
  );
}
