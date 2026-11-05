import { describe, expect, it } from "vitest";
import { desvioDias, itensIniciais, situacaoItem, type ItemCronograma } from "./cronograma";

const base: ItemCronograma = { demanda_id: 1, etapa: "execucao", nome: "Execução", ordem: 0, inicio_previsto: "2026-11-01", fim_previsto: "2026-11-10", inicio_real: null, fim_real: null, observacao: null };

describe("situação dos itens do cronograma", () => {
  it("concluída no prazo e com atraso", () => {
    expect(situacaoItem({ ...base, inicio_real: "2026-11-01", fim_real: "2026-11-10" }, "2026-11-20")).toBe("concluida_no_prazo");
    expect(situacaoItem({ ...base, inicio_real: "2026-11-01", fim_real: "2026-11-13" }, "2026-11-20")).toBe("concluida_atrasada");
    expect(desvioDias({ ...base, fim_real: "2026-11-13" }, "2026-11-20")).toBe(3);
  });
  it("em andamento vira atrasada quando passa do fim previsto", () => {
    expect(situacaoItem({ ...base, inicio_real: "2026-11-02" }, "2026-11-05")).toBe("em_andamento");
    expect(situacaoItem({ ...base, inicio_real: "2026-11-02" }, "2026-11-15")).toBe("atrasada");
    expect(desvioDias({ ...base, inicio_real: "2026-11-02" }, "2026-11-15")).toBe(5);
  });
  it("sem realizado: programada, início atrasado ou sem previsão", () => {
    expect(situacaoItem(base, "2026-10-30")).toBe("programada");
    expect(situacaoItem(base, "2026-11-03")).toBe("inicio_atrasado");
    expect(situacaoItem({ ...base, inicio_previsto: null, fim_previsto: null }, "2026-11-03")).toBe("sem_previsao");
    expect(situacaoItem(base, "2026-11-03", true)).toBe("nao_realizada");
  });
});

describe("cronograma inicial", () => {
  it("usa o fluxo da forma de execução e as datas conhecidas", () => {
    const itens = itensIniciais({ id: 7, forma_execucao: "interna", etapa: "execucao", recebida_em: "2026-10-01", inicio: "2026-10-20", fim: null }, "2026-11-05");
    expect(itens.map((i) => i.etapa)).toEqual(["recebida", "estudo_projeto", "aprovacao", "execucao", "encerramento"]);
    expect(itens[0]).toMatchObject({ inicio_real: "2026-10-01", fim_real: "2026-10-01" });
    expect(itens[3]).toMatchObject({ inicio_real: "2026-10-20", fim_real: null });
  });
  it("etapa atual sem data de início recebe hoje", () => {
    const itens = itensIniciais({ id: 7, forma_execucao: "contratada", etapa: "rms_suprimentos", recebida_em: null, inicio: null, fim: null }, "2026-11-05");
    expect(itens.find((i) => i.etapa === "rms_suprimentos")?.inicio_real).toBe("2026-11-05");
    expect(itens).toHaveLength(8);
  });
});
