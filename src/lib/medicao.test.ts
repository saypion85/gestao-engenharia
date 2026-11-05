import { describe, expect, it } from "vitest";
import { disponivelPorItem, linhasBoletim, resumoOC, valorMedicao, type ItemOC, type Medicao, type MedicaoItem } from "./medicao";

const itens: ItemOC[] = [
  { id: 1, oc_id: 1, ordem: 1, descricao: "Demolição", unidade: "m²", quantidade: 100, valor_unitario: 50 },
  { id: 2, oc_id: 1, ordem: 2, descricao: "Alvenaria", unidade: "m²", quantidade: 80, valor_unitario: 120.5 },
];
const med = (id: number, numero: number, status: Medicao["status"] = "aprovada"): Medicao => ({
  id, oc_id: 1, numero, periodo_inicio: null, periodo_fim: null, data_medicao: "2026-11-05", descricao: null, valor_informado: null,
  status, nota_fiscal: null, data_pagamento: null, observacao: null, aprovada_por_nome: null, aprovada_em: null, pagamento_por_nome: null,
});
const medicoes = [med(10, 1, "paga"), med(11, 2), med(12, 3, "cancelada"), med(13, 4, "em_elaboracao")];
const medItens: MedicaoItem[] = [
  { medicao_id: 10, oc_item_id: 1, quantidade: 40 }, { medicao_id: 11, oc_item_id: 1, quantidade: 30 },
  { medicao_id: 11, oc_item_id: 2, quantidade: 10 }, { medicao_id: 12, oc_item_id: 1, quantidade: 30 },
  { medicao_id: 13, oc_item_id: 2, quantidade: 20 },
];

describe("medição", () => {
  it("valor = quantidade medida × preço unitário", () => {
    expect(valorMedicao(medicoes[0], itens, medItens)).toBe(2000);
    expect(valorMedicao(medicoes[1], itens, medItens)).toBe(1500 + 1205);
  });
  it("sem planilha, usa o valor informado", () => {
    expect(valorMedicao({ ...med(1, 1), valor_informado: 1234.567 }, [], [])).toBe(1234.57);
  });
  it("boletim: acumulado anterior ignora medições canceladas e posteriores", () => {
    const l = linhasBoletim(medicoes[3], itens, medicoes, medItens);
    expect(l[0]).toMatchObject({ anterior: 70, atual: 0, acumulado: 70, saldo: 30 });
    expect(l[1]).toMatchObject({ anterior: 10, atual: 20, acumulado: 30, saldo: 50, valorAtual: 2410 });
  });
  it("disponível para medir considera as demais medições válidas", () => {
    expect(disponivelPorItem(1, itens[0], 13, medicoes, medItens)).toBe(30); // 100 − 40 − 30 (cancelada não conta)
  });
  it("resumo da OC: medido, aprovado, pago e saldo", () => {
    const comValor = medicoes.map((m) => ({ ...m, valor: valorMedicao(m, itens, medItens) }));
    const r = resumoOC({ valor_total: 14640 }, comValor);
    expect(r).toMatchObject({ contratado: 14640, medido: 2000 + 2705 + 2410, aprovado: 4705, pago: 2000 });
    expect(r.saldo).toBe(14640 - 7115);
  });
});
