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

import { calcularDatas, duracaoEntre, fimPorDuracao, somarDias, proximoUtil } from "./cronograma";

describe("calendário", () => {
  it("dias corridos contam fins de semana", () => {
    expect(fimPorDuracao("2026-11-05", 5, false)).toBe("2026-11-09"); // qui → seg
    expect(duracaoEntre("2026-11-05", "2026-11-09", false)).toBe(5);
  });
  it("dias úteis pulam sábado e domingo", () => {
    expect(fimPorDuracao("2026-11-05", 5, true)).toBe("2026-11-11"); // qui, sex, seg, ter, qua
    expect(duracaoEntre("2026-11-05", "2026-11-11", true)).toBe(5);
    expect(proximoUtil("2026-11-07")).toBe("2026-11-09"); // sábado → segunda
    expect(somarDias("2026-11-06", 1, true)).toBe("2026-11-09"); // sexta + 1 útil = segunda
    expect(somarDias("2026-11-09", -1, true)).toBe("2026-11-06");
  });
});

describe("predecessoras (término → início)", () => {
  const item = (chave: string, nome: string, extra: object = {}) => ({ chave, demanda_id: 1, etapa: null, nome, ordem: 0, inicio_previsto: null, fim_previsto: null, inicio_real: null, fim_real: null, observacao: null, duracao_dias: null, ...extra });

  it("sucessora começa no dia seguinte ao término e segue a duração", () => {
    const { itens, erros } = calcularDatas([
      item("a", "Projeto", { inicio_previsto: "2026-11-02", duracao_dias: 5 }),
      item("b", "MD", { duracao_dias: 3 }),
      item("c", "RMS", { duracao_dias: 2 }),
    ], [{ item: "b", pred: "a", folga: 0 }, { item: "c", pred: "b", folga: 2 }], false);
    expect(erros).toEqual([]);
    expect(itens[0]).toMatchObject({ inicio_previsto: "2026-11-02", fim_previsto: "2026-11-06" });
    expect(itens[1]).toMatchObject({ inicio_previsto: "2026-11-07", fim_previsto: "2026-11-09" });
    expect(itens[2]).toMatchObject({ inicio_previsto: "2026-11-12", fim_previsto: "2026-11-13" }); // +2 dias de folga
  });

  it("em dias úteis, o início que cairia no sábado vai para segunda", () => {
    const { itens } = calcularDatas([
      item("a", "Projeto", { inicio_previsto: "2026-11-02", duracao_dias: 5 }), // seg a sex
      item("b", "MD", { duracao_dias: 3 }),
    ], [{ item: "b", pred: "a", folga: 0 }], true);
    expect(itens[0].fim_previsto).toBe("2026-11-06");
    expect(itens[1]).toMatchObject({ inicio_previsto: "2026-11-09", fim_previsto: "2026-11-11" });
  });

  it("com várias predecessoras, vale a que termina por último", () => {
    const { itens } = calcularDatas([
      item("a", "A", { inicio_previsto: "2026-11-02", duracao_dias: 2 }),
      item("b", "B", { inicio_previsto: "2026-11-02", duracao_dias: 8 }),
      item("c", "C", { duracao_dias: 1 }),
    ], [{ item: "c", pred: "a", folga: 0 }, { item: "c", pred: "b", folga: 0 }], false);
    expect(itens[2].inicio_previsto).toBe("2026-11-10");
  });

  it("dependência circular é recusada", () => {
    const { erros } = calcularDatas([item("a", "A", { duracao_dias: 1 }), item("b", "B", { duracao_dias: 1 })],
      [{ item: "a", pred: "b", folga: 0 }, { item: "b", pred: "a", folga: 0 }], false);
    expect(erros[0]).toMatch(/circular/);
  });

  it("predecessora sem término é avisada", () => {
    const { erros } = calcularDatas([item("a", "A"), item("b", "B", { duracao_dias: 2 })], [{ item: "b", pred: "a", folga: 0 }], false);
    expect(erros[0]).toMatch(/ainda não tem término previsto/);
  });
});
