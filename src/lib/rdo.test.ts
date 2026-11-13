import { describe, expect, it } from "vitest";
import { dataComSemana, destaques, diaSemana, fmtHoras, horasParalisacao, linhasTexto, resumirPeriodo, textoParaIA, type RdoResumivel } from "./rdo";

const base = (p: Partial<RdoResumivel>): RdoResumivel => ({
  id: 1, data: "2026-11-09", status: "enviado", origem: "equipe", horario_inicio: "07:00", horario_fim: "17:00",
  clima_manha: "bom", clima_tarde: "bom", area_praticavel: true, efetivo: [], equipamentos: [], atividades_executadas: null,
  ocorrencias: [], paralisacoes: [], dds_realizado: true, pt_emitida: true, ast_realizada: true, incidentes: null,
  materiais_recebidos: null, observacoes_contratada: null, apontamentos_contratante: null, ...p,
});

describe("dia da semana", () => {
  it("calcula sem depender do fuso", () => {
    expect(diaSemana("2026-11-13")).toBe("sexta-feira");
    expect(diaSemana("2026-11-15", true)).toBe("dom");
    expect(dataComSemana("2026-11-09")).toBe("segunda-feira, 09/11/2026");
  });
});

describe("paralisações", () => {
  it("calcula horas e rejeita horário incompleto ou invertido", () => {
    expect(horasParalisacao({ inicio: "08:00", fim: "10:30" })).toBe(2.5);
    expect(horasParalisacao({ inicio: "10:00", fim: "" })).toBeNull();
    expect(horasParalisacao({ inicio: "10:00", fim: "09:00" })).toBeNull();
    expect(fmtHoras(2.5)).toBe("2h30");
    expect(fmtHoras(3)).toBe("3h");
  });
});

describe("resumo do período", () => {
  const lista = [
    base({ id: 1, data: "2026-11-09", clima_tarde: "chuvoso", efetivo: [{ nome: "Ana", funcao: "Pedreira", tipo: "proprio" }, { nome: "Rui", funcao: "Servente", tipo: "terceiro" }],
      paralisacoes: [{ motivo: "chuva", inicio: "13:00", fim: "16:00", descricao: "Chuva forte" }], ocorrencias: [{ descricao: "Área interditada", impedimento: true }] }),
    base({ id: 2, data: "2026-11-10", area_praticavel: false, dds_realizado: false, equipamentos: [{ descricao: "Betoneira", quantidade: 1 }],
      paralisacoes: [{ motivo: "falta_material", inicio: "08:00", fim: "09:00", descricao: "" }, { motivo: "chuva", inicio: "", fim: "", descricao: "" }],
      efetivo: [{ funcao: "Pedreiro", quantidade: 3, tipo: "terceiro" }], status: "revisado_ressalvas", apontamentos_contratante: "Faltou sinalização" }),
    base({ id: 3, data: "2026-11-11", status: "rascunho", paralisacoes: [{ motivo: "chuva", inicio: "07:00", fim: "17:00", descricao: "" }] }),
  ];
  const s = resumirPeriodo(lista);

  it("ignora rascunhos e soma paralisações por motivo", () => {
    expect(s.rdos).toBe(2);
    expect(s.rascunhosIgnorados).toBe(1);
    expect(s.horasParalisadas).toBe(4);
    expect(s.horasMauTempo).toBe(3);
    expect(s.paralisacao[0]).toMatchObject({ motivo: "chuva", horas: 3, vezes: 2, dias: 2 });
    expect(s.paralisacoesSemHorario).toBe(1);
  });

  it("consolida clima, efetivo, segurança e apontamentos", () => {
    expect(s.diasComChuva).toBe(1);
    expect(s.diasAreaImpraticavel).toBe(1);
    expect(s.clima).toEqual({ bom: 3, chuvoso: 1 });
    expect(s.homensDia).toBe(5);
    expect(s.proprio).toBe(1);
    expect(s.picoDia).toEqual({ data: "2026-11-10", pessoas: 3 });
    expect(s.seguranca.dds).toEqual([1, 2]);
    expect(s.equipamentos).toEqual([{ descricao: "Betoneira", dias: 1 }]);
    expect(s.ressalvas).toBe(1);
    expect(s.apontamentos).toEqual([{ data: "2026-11-10", texto: "Faltou sinalização" }]);
  });

  it("gera destaques e o texto para a IA só com o que foi registrado", () => {
    const d = destaques(s).join(" ");
    expect(d).toContain("2 RDOs registrados");
    expect(d).toContain("Chuva / mau tempo (3h em 2 dias)");
    expect(d).toContain("dias sem DDS");
    const t = textoParaIA("DEM-0001 · Teste", "2026-11-09", "2026-11-11", s);
    expect(t).toContain("segunda-feira, 09/11/2026:");
    expect(t).toContain("Paralisação: Chuva / mau tempo das 13:00 às 16:00 (3h) – Chuva forte");
    expect(t).not.toContain("2026-11-11:");
  });

  it("estima linhas para o campo não esconder texto", () => {
    expect(linhasTexto("")).toBe(1);
    expect(linhasTexto("a".repeat(150), 70)).toBe(3);
    expect(linhasTexto("a\nb\nc")).toBe(3);
  });
});
