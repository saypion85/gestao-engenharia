// Regras da medição: valor de cada medição, acumulados por item e saldo da Ordem de Compra.

export type StatusMedicao = "em_elaboracao" | "aprovada" | "paga" | "cancelada";

export const STATUS_MEDICAO: Record<StatusMedicao, string> = {
  em_elaboracao: "Em elaboração",
  aprovada: "Aprovada",
  paga: "Paga",
  cancelada: "Cancelada",
};

export interface OrdemCompra {
  id: number; demanda_id: number; numero: string; empresa_id: number | null; fornecedor: string | null; fornecedor_nome?: string | null;
  data_emissao: string | null; valor_total: number; objeto: string | null; situacao: "vigente" | "encerrada" | "cancelada";
  qtd_itens?: number; medido?: number; aprovado?: number; pago?: number;
}
export interface ItemOC { id: number; oc_id: number; ordem: number; descricao: string; unidade: string | null; quantidade: number; valor_unitario: number; valor_total?: number }
export interface Medicao {
  id: number; oc_id: number; numero: number; periodo_inicio: string | null; periodo_fim: string | null; data_medicao: string;
  descricao: string | null; valor_informado: number | null; status: StatusMedicao; nota_fiscal: string | null; data_pagamento: string | null;
  observacao: string | null; aprovada_por_nome: string | null; aprovada_em: string | null; pagamento_por_nome: string | null; valor?: number;
}
export interface MedicaoItem { medicao_id: number; oc_item_id: number; quantidade: number }

const r2 = (n: number) => Math.round(n * 100) / 100;
const conta = (m: Medicao) => m.status !== "cancelada";

/** Valor da medição: soma (quantidade medida × preço unitário); sem itens na OC, o valor informado. */
export function valorMedicao(m: Medicao, itens: ItemOC[], medItens: MedicaoItem[]): number {
  if (!itens.length) return r2(Number(m.valor_informado ?? 0));
  return r2(medItens.filter((x) => x.medicao_id === m.id).reduce((s, x) => {
    const it = itens.find((i) => i.id === x.oc_item_id);
    return s + (it ? r2(Number(x.quantidade) * Number(it.valor_unitario)) : 0);
  }, 0));
}

export interface LinhaBoletim {
  item: ItemOC; contratado: number; anterior: number; atual: number; acumulado: number; saldo: number;
  valorAnterior: number; valorAtual: number; valorAcumulado: number; percentual: number;
}

/**
 * Planilha da medição: para cada item, o acumulado das medições anteriores (número menor, não canceladas),
 * o medido nesta, o acumulado e o saldo. "qtdAtual" permite simular valores ainda não salvos.
 */
export function linhasBoletim(m: Pick<Medicao, "id" | "numero">, itens: ItemOC[], medicoes: Medicao[], medItens: MedicaoItem[], qtdAtual?: Record<number, number>): LinhaBoletim[] {
  const anteriores = new Set(medicoes.filter((x) => conta(x) && x.numero < m.numero).map((x) => x.id));
  return [...itens].sort((a, b) => a.ordem - b.ordem || a.id - b.id).map((item) => {
    const q = (f: (x: MedicaoItem) => boolean) => medItens.filter((x) => x.oc_item_id === item.id && f(x)).reduce((s, x) => s + Number(x.quantidade), 0);
    const anterior = q((x) => anteriores.has(x.medicao_id));
    const atual = qtdAtual?.[item.id] ?? q((x) => x.medicao_id === m.id);
    const contratado = Number(item.quantidade), pu = Number(item.valor_unitario);
    const acumulado = anterior + atual;
    return {
      item, contratado, anterior, atual, acumulado, saldo: contratado - acumulado,
      valorAnterior: r2(anterior * pu), valorAtual: r2(atual * pu), valorAcumulado: r2(acumulado * pu),
      percentual: contratado ? (acumulado / contratado) * 100 : 0,
    };
  });
}

/** Quanto ainda pode ser medido de cada item, desconsiderando a própria medição (para validar antes de salvar). */
export function disponivelPorItem(itemId: number, item: ItemOC, medicaoId: number, medicoes: Medicao[], medItens: MedicaoItem[]): number {
  const validas = new Set(medicoes.filter((x) => conta(x) && x.id !== medicaoId).map((x) => x.id));
  const usado = medItens.filter((x) => x.oc_item_id === itemId && validas.has(x.medicao_id)).reduce((s, x) => s + Number(x.quantidade), 0);
  return Number(item.quantidade) - usado;
}

export interface ResumoOC { contratado: number; medido: number; aprovado: number; pago: number; saldo: number; pctMedido: number; pctPago: number }

export function resumoOC(oc: Pick<OrdemCompra, "valor_total">, medicoes: (Medicao & { valor: number })[]): ResumoOC {
  const soma = (f: (m: Medicao) => boolean) => r2(medicoes.filter(f).reduce((s, m) => s + Number(m.valor), 0));
  const contratado = Number(oc.valor_total);
  const medido = soma(conta), aprovado = soma((m) => m.status === "aprovada" || m.status === "paga"), pago = soma((m) => m.status === "paga");
  return { contratado, medido, aprovado, pago, saldo: r2(contratado - medido), pctMedido: contratado ? (medido / contratado) * 100 : 0, pctPago: contratado ? (pago / contratado) * 100 : 0 };
}
