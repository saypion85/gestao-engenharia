import { describe, expect, it } from "vitest";
import { classe, pontuacao, regraDeCorteAplicada, severidade, FLUXO } from "./dominio";

const base = { probabilidade: null, sev_pessoas: null, sev_operacao: null, sev_financeiro: null, sev_legal: null, risco_queda_eletro: false };

describe("prioridade (modelo Prioridade.xlsx)", () => {
  it("severidade é o maior impacto entre as colunas", () => {
    expect(severidade({ ...base, sev_pessoas: 2, sev_operacao: 4, sev_legal: 1 })).toBe(4);
  });

  it("sem avaliação completa não há pontuação nem classe", () => {
    expect(pontuacao({ ...base, probabilidade: 3 })).toBeNull();
    expect(classe({ ...base, sev_pessoas: 3 })).toBeNull();
  });

  it("faixas de classe pela pontuação P × S", () => {
    expect(classe({ ...base, probabilidade: 5, sev_operacao: 3 })).toBe("critico"); // 15
    expect(classe({ ...base, probabilidade: 4, sev_operacao: 3 })).toBe("alto"); // 12
    expect(classe({ ...base, probabilidade: 2, sev_operacao: 4 })).toBe("medio"); // 8
    expect(classe({ ...base, probabilidade: 2, sev_operacao: 2 })).toBe("baixo"); // 4
  });

  it("exemplos da planilha", () => {
    expect(classe({ ...base, probabilidade: 4, sev_pessoas: 5 })).toBe("critico"); // Parede Armazém 08 = 20
    expect(classe({ ...base, probabilidade: 3, sev_operacao: 3 })).toBe("medio"); // Soldador único = 9
    expect(classe({ ...base, probabilidade: 4, sev_operacao: 3 })).toBe("alto"); // Infiltração Caju 44 = 12
  });

  it("regra de corte: severidade 5 vira Crítico mesmo com pontuação baixa", () => {
    const a = { ...base, probabilidade: 1, sev_pessoas: 5 };
    expect(pontuacao(a)).toBe(5);
    expect(classe(a)).toBe("critico");
    expect(regraDeCorteAplicada(a)).toBe(true);
  });

  it("regra de corte: queda/eletrocussão com P ≥ 3 vira Crítico", () => {
    expect(classe({ ...base, probabilidade: 3, sev_pessoas: 2, risco_queda_eletro: true })).toBe("critico");
    expect(classe({ ...base, probabilidade: 2, sev_pessoas: 2, risco_queda_eletro: true })).toBe("baixo");
  });
});

describe("fluxo de etapas", () => {
  it("execução interna pula as etapas de contratação", () => {
    expect(FLUXO.interna).toEqual(["recebida", "estudo_projeto", "aprovacao", "execucao", "encerramento", "concluida"]);
    expect(FLUXO.contratada).toContain("rms_suprimentos");
  });
});
