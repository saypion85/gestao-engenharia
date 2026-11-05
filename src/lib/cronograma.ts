// Regras do cronograma: situação de cada item (previsto × realizado) e desvio em dias.
import { ETAPAS, FLUXO, type Etapa, type Forma } from "./dominio";

export interface ItemCronograma {
  id?: number;
  demanda_id: number;
  etapa: Etapa | null;
  nome: string;
  ordem: number;
  inicio_previsto: string | null;
  fim_previsto: string | null;
  inicio_real: string | null;
  fim_real: string | null;
  observacao: string | null;
}

export type SituacaoItem =
  | "concluida_no_prazo" | "concluida_atrasada" | "em_andamento" | "atrasada"
  | "inicio_atrasado" | "programada" | "sem_previsao" | "nao_realizada";

export const SITUACAO_ITEM: Record<SituacaoItem, { nome: string; tom: "ok" | "atencao" | "critico" | "neutro" }> = {
  concluida_no_prazo: { nome: "Concluída no prazo", tom: "ok" },
  concluida_atrasada: { nome: "Concluída com atraso", tom: "atencao" },
  em_andamento: { nome: "Em andamento", tom: "neutro" },
  atrasada: { nome: "Atrasada", tom: "critico" },
  inicio_atrasado: { nome: "Início atrasado", tom: "critico" },
  programada: { nome: "Programada", tom: "neutro" },
  sem_previsao: { nome: "Sem previsão", tom: "neutro" },
  nao_realizada: { nome: "Não realizada", tom: "neutro" },
};

const dia = (iso: string) => Math.round(new Date(iso.slice(0, 10) + "T00:00:00Z").getTime() / 86400000);
export const diasEntre = (a: string, b: string) => dia(b) - dia(a);

/**
 * Situação do item na data de referência (hoje).
 * - fim real informado → concluída (no prazo se fim real ≤ fim previsto).
 * - só início real → em andamento, ou atrasada se hoje passou do fim previsto.
 * - sem realizado → programada, início atrasado (hoje passou do início previsto) ou sem previsão.
 * - etapa pulada (demanda já passou dela sem registrar) → não realizada.
 */
export function situacaoItem(i: ItemCronograma, hoje: string, etapaAtualPosterior = false): SituacaoItem {
  if (i.fim_real) return i.fim_previsto && dia(i.fim_real) > dia(i.fim_previsto) ? "concluida_atrasada" : "concluida_no_prazo";
  if (i.inicio_real) return i.fim_previsto && dia(hoje) > dia(i.fim_previsto) ? "atrasada" : "em_andamento";
  if (etapaAtualPosterior) return "nao_realizada";
  if (!i.inicio_previsto && !i.fim_previsto) return "sem_previsao";
  const ref = i.inicio_previsto ?? i.fim_previsto!;
  return dia(hoje) > dia(ref) ? "inicio_atrasado" : "programada";
}

/** Desvio em dias no término (positivo = atraso). Em andamento usa hoje como referência se já passou do previsto. */
export function desvioDias(i: ItemCronograma, hoje: string): number | null {
  if (!i.fim_previsto) return null;
  if (i.fim_real) return diasEntre(i.fim_previsto, i.fim_real);
  if (dia(hoje) > dia(i.fim_previsto)) return diasEntre(i.fim_previsto, hoje);
  return null;
}

/** Itens iniciais do cronograma a partir do fluxo da forma de execução. */
export function itensIniciais(demanda: { id: number; forma_execucao: Forma; etapa: Etapa; recebida_em: string | null; inicio: string | null; fim: string | null }, hoje: string): ItemCronograma[] {
  const etapas: Etapa[] = FLUXO[demanda.forma_execucao].filter((e) => e !== "concluida");
  const atual = etapas.indexOf(demanda.etapa);
  return etapas.map((e, ordem) => {
    const item: ItemCronograma = { demanda_id: demanda.id, etapa: e, nome: ETAPAS[e], ordem: ordem * 10, inicio_previsto: null, fim_previsto: null, inicio_real: null, fim_real: null, observacao: null };
    if (e === "recebida" && demanda.recebida_em) { item.inicio_real = demanda.recebida_em; item.fim_real = demanda.recebida_em; }
    if (e === "execucao") { item.inicio_real = demanda.inicio; item.fim_real = demanda.fim; }
    if (e === demanda.etapa && !item.inicio_real && e !== "recebida") item.inicio_real = hoje;
    if (atual >= 0 && ordem < atual && e === "recebida" && !item.fim_real && item.inicio_real) item.fim_real = item.inicio_real;
    return item;
  });
}

/** Período que cobre todas as datas (com folga), em ISO. */
export function periodo(datas: (string | null)[], hoje: string, folgaDias = 10): [string, string] {
  const v = [...datas.filter((d): d is string => !!d), hoje].map(dia);
  const ini = Math.min(...v) - folgaDias, fim = Math.max(...v) + folgaDias;
  const iso = (n: number) => new Date(n * 86400000).toISOString().slice(0, 10);
  return [iso(ini), iso(Math.max(fim, ini + 30))];
}
