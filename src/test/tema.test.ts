import { beforeEach, describe, expect, it } from "vitest";

import { aplicarTema, lerTema, TEMA_KEY, TEMA_SCRIPT } from "@/lib/tema";

describe("tema do painel", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark");
    localStorage.clear();
  });

  it("abre no tema claro quando nada foi escolhido", () => {
    // o script do <head> roda antes do React
    new Function(TEMA_SCRIPT)();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(lerTema()).toBe("claro");
  });

  it("lembra o tema escuro escolhido antes", () => {
    localStorage.setItem(TEMA_KEY, "escuro");
    new Function(TEMA_SCRIPT)();
    expect(lerTema()).toBe("escuro");
  });

  it("troca de tema e guarda a escolha", () => {
    aplicarTema("escuro");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem(TEMA_KEY)).toBe("escuro");

    aplicarTema("claro");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem(TEMA_KEY)).toBe("claro");
  });
});
