import { useSyncExternalStore } from "react";

/** Tema do painel: claro é o padrão; escuro fica como opção e é lembrado no navegador. */
export type Tema = "claro" | "escuro";

export const TEMA_KEY = "lepion.tema";

/**
 * Roda antes do React, no <head>, para a página já abrir no tema certo
 * (sem piscar o tema claro antes do escuro).
 */
export const TEMA_SCRIPT = `try{if(localStorage.getItem("${TEMA_KEY}")==="escuro")document.documentElement.classList.add("dark")}catch(e){}`;

const ouvintes = new Set<() => void>();

export function lerTema(): Tema {
  if (typeof document === "undefined") return "claro";
  return document.documentElement.classList.contains("dark") ? "escuro" : "claro";
}

export function aplicarTema(tema: Tema) {
  document.documentElement.classList.toggle("dark", tema === "escuro");
  try {
    localStorage.setItem(TEMA_KEY, tema);
  } catch {
    /* armazenamento bloqueado: o tema vale só nesta visita */
  }
  ouvintes.forEach((f) => f());
}

function assinar(f: () => void) {
  ouvintes.add(f);
  return () => ouvintes.delete(f);
}

export function useTema() {
  return useSyncExternalStore(assinar, lerTema, () => "claro" as Tema);
}
