import { describe, expect, it } from "vitest";
import {
  getState,
  toDevice,
  toIncident,
  toReading,
  workerStatus,
  fmtGas,
  rssiPct,
  type Device,
  type Incident,
  type State,
  type Worker,
} from "@/lib/store";

const NOW = Date.parse("2026-10-28T18:00:00Z");

function make(over: { device?: Partial<Device>; incidents?: Partial<Incident>[] } = {}): {
  s: State;
  w: Worker;
} {
  const d: Device = {
    id: "capacete01",
    worker_id: "w1",
    tipo: "capacete",
    zone_id: "alto-forno",
    simulado: false,
    bateria: null,
    rssi: -60,
    ultimo_sinal_em: NOW - 5_000,
    ultima_calibracao_gas: null,
    ...over.device,
  };
  const w: Worker = {
    id: "w1",
    nome: "Guilherme",
    cargo: "Operador",
    turno: "A",
    supervisor: false,
    checkin: null,
    ultima_pausa: null,
    device_id: d.id,
    zone_id: d.zone_id,
  };
  const incidents = (over.incidents ?? []).map((i, k) => ({
    id: `i${k}`,
    worker_id: "w1",
    device_id: d.id,
    zone_id: d.zone_id,
    tipo: "calor",
    severidade: "atencao",
    status: "aberto",
    detalhe: "Calor · sensação 36,0 °C",
    snapshot: {},
    criado_em: NOW - 60_000,
    ...i,
  })) as Incident[];
  return { s: { ...getState(), now: NOW, workers: [w], devices: { [d.id]: d }, incidents }, w };
}

describe("workerStatus", () => {
  it("fica OK quando o EPI está online e não há ocorrências abertas", () => {
    const { s, w } = make();
    expect(workerStatus(s, w).sev).toBe("ok");
  });

  it("mostra ATENÇÃO com o detalhe vindo do banco", () => {
    const { s, w } = make({ incidents: [{}] });
    expect(workerStatus(s, w)).toEqual({ sev: "atencao", motivo: "Calor · sensação 36,0 °C" });
  });

  it("CRÍTICO tem prioridade sobre tudo, inclusive sobre estar offline", () => {
    const { s, w } = make({
      device: { ultimo_sinal_em: NOW - 10 * 60_000 },
      incidents: [{}, { tipo: "queda", severidade: "critico", detalhe: "Queda detectada" }],
    });
    expect(workerStatus(s, w)).toEqual({
      sev: "critico",
      motivo: "Queda detectada · sem resposta",
    });
  });

  it("indica 'em atendimento' depois do reconhecimento", () => {
    const { s, w } = make({
      incidents: [
        { tipo: "queda", severidade: "critico", detalhe: "Queda detectada", reconhecido_em: NOW },
      ],
    });
    expect(workerStatus(s, w).motivo).toBe("Queda detectada · em atendimento");
  });

  it("fica OFFLINE após 2 minutos sem sinal", () => {
    const { s, w } = make({ device: { ultimo_sinal_em: NOW - 3 * 60_000 } });
    expect(workerStatus(s, w)).toEqual({ sev: "offline", motivo: "Sem sinal há 3 min" });
  });

  it("explica quando o capacete nunca se conectou", () => {
    const { s, w } = make({ device: { ultimo_sinal_em: null } });
    expect(workerStatus(s, w)).toEqual({ sev: "offline", motivo: "Aguardando a primeira conexão" });
  });

  it("ignora ocorrências já encerradas", () => {
    const { s, w } = make({
      incidents: [
        { status: "resolvido" },
        { tipo: "queda", severidade: "critico", status: "falso_positivo" },
      ],
    });
    expect(workerStatus(s, w).sev).toBe("ok");
  });
});

describe("conversão das linhas do banco", () => {
  it("lê a última leitura no formato gravado pela função process_reading", () => {
    const r = toReading({
      temperatura: 31.5,
      sensacao: 33.1,
      gas_razao: 1.02,
      gas_pronto: true,
      movimento: true,
      nivel: "NORMAL",
      criado_em: "2026-10-28T18:00:00Z",
    });
    expect(r).toEqual({
      temperatura: 31.5,
      sensacao: 33.1,
      gas_razao: 1.02,
      gas_pronto: true,
      movimento: true,
      nivel: "NORMAL",
      criado_em: NOW,
    });
    expect(toReading(null)).toEqual({});
  });

  it("converte horários e campos vazios do EPI", () => {
    const d = toDevice({
      id: "capacete01",
      worker_id: "w1",
      tipo: "capacete",
      zone_id: "aciaria",
      simulado: false,
      bateria: null,
      rssi: -70,
      ultimo_sinal_em: "2026-10-28T18:00:00Z",
      ultima_calibracao_gas: null,
    });
    expect(d.bateria).toBeNull();
    expect(d.ultimo_sinal_em).toBe(NOW);
    expect(d.ultima_calibracao_gas).toBeNull();
  });

  it("converte o incidente, sem inventar horários ausentes", () => {
    const i = toIncident({
      id: "x",
      worker_id: "w1",
      device_id: "capacete01",
      zone_id: "aciaria",
      tipo: "gas",
      severidade: "critico",
      status: "aberto",
      detalhe: "Gás · 2,2× o ar limpo (evacuar)",
      snapshot: { gas_razao: 2.2 },
      criado_em: "2026-10-28T18:00:00Z",
      reconhecido_em: null,
    });
    expect(i.criado_em).toBe(NOW);
    expect(i.reconhecido_em).toBeUndefined();
    expect(i.snapshot.gas_razao).toBe(2.2);
  });
});

describe("formatação", () => {
  it("mostra o gás como razão do ar limpo, em pt-BR", () => {
    expect(fmtGas(1.62)).toBe("1,6×");
    expect(fmtGas(undefined)).toBe("—");
  });
  it("converte RSSI em porcentagem de sinal", () => {
    expect(rssiPct(-50)).toBe(100);
    expect(rssiPct(-75)).toBe(50);
    expect(rssiPct(null)).toBeNull();
  });
});

describe("datas sem hora", () => {
  it("mantém o dia da calibração no fuso de São Paulo", () => {
    const d = toDevice({ id: "x", zone_id: "patio", ultima_calibracao_gas: "2026-10-28" });
    expect(
      new Date(d.ultima_calibracao_gas!).toLocaleDateString("pt-BR", {
        timeZone: "America/Sao_Paulo",
      }),
    ).toBe("28/10/2026");
  });
});
