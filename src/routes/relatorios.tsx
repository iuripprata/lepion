import { createFileRoute } from "@tanstack/react-router";
import { Analitico } from "./analitico";

export const Route = createFileRoute("/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios SESMT — Painel LEPION" },
      { name: "description", content: "Relatórios de ocorrências para o SESMT com exportação em PDF." },
      { property: "og:title", content: "Relatórios SESMT — Painel LEPION" },
      { property: "og:description", content: "Relatórios de ocorrências para o SESMT com exportação em PDF." },
    ],
  }),
  component: Analitico,
});
