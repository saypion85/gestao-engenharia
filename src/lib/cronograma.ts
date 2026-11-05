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
  duracao_dias?: number | null;
}

/** Vínculo término → início: o item começa após o término da predecessora (+ folga). */
export interface Dependencia { item_id: number; predecessora_id: number; folga_dias: number }

export type SituacaoItem =
  | "concluida_no_prazo" | "concluida_atrasada" | "em_andamento" | "atrasada"
  | "inicio_atrasado" | "aguardando_predecessora" | "programada" | "sem_previsao" | "nao_realizada";

export const SITUACAO_ITEM: Record<SituacaoItem, { nome: string; tom: "ok" | "atencao" | "critico" | "neutro" }> = {
  concluida_no_prazo: { nome: "Concluída no prazo", tom: "ok" },
  concluida_atrasada: { nome: "Concluída com atraso", tom: "atencao" },
  em_andamento: { nome: "Em andamento", tom: "neutro" },
  atrasada: { nome: "Atrasada", tom: "critico" },
  inicio_atrasado: { nome: "Início atrasado", tom: "critico" },
  aguardando_predecessora: { nome: "Aguardando predecessora", tom: "atencao" },
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
export function situacaoItem(i: ItemCronograma, hoje: string, etapaAtualPosterior = false, predecessoraPendente = false): SituacaoItem {
  if (i.fim_real) return i.fim_previsto && dia(i.fim_real) > dia(i.fim_previsto) ? "concluida_atrasada" : "concluida_no_prazo";
  if (i.inicio_real) return i.fim_previsto && dia(hoje) > dia(i.fim_previsto) ? "atrasada" : "em_andamento";
  if (etapaAtualPosterior) return "nao_realizada";
  if (!i.inicio_previsto && !i.fim_previsto) return "sem_previsao";
  const ref = i.inicio_previsto ?? i.fim_previsto!;
  if (dia(hoje) > dia(ref)) return predecessoraPendente ? "aguardando_predecessora" : "inicio_atrasado";
  return "programada";
}

/** Desvio em dias no término (positivo = atraso). Em andamento usa hoje como referência se já passou do previsto. */
export function desvioDias(i: ItemCronograma, hoje: string, uteis = false): number | null {
  if (!i.fim_previsto) return null;
  const dif = (a: string, b: string) => (uteis ? Math.sign(dia(b) - dia(a)) * diasUteisEntre(a < b ? a : b, a < b ? b : a, false) : diasEntre(a, b));
  if (i.fim_real) return dif(i.fim_previsto, i.fim_real);
  if (dia(hoje) > dia(i.fim_previsto)) return dif(i.fim_previsto, hoje);
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

// ---------------------------------------------------------------- calendário

const iso = (n: number) => new Date(n * 86400000).toISOString().slice(0, 10);
/** Sábado ou domingo. */
export const fimDeSemana = (d: string) => { const w = new Date(d + "T00:00:00Z").getUTCDay(); return w === 0 || w === 6; };
/** Mesmo dia, ou o próximo dia útil se cair em fim de semana. */
export const proximoUtil = (d: string) => { let n = dia(d); while (fimDeSemana(iso(n))) n++; return iso(n); };

/**
 * Dias úteis entre duas datas. inclusivo=true conta os dois extremos (duração);
 * inclusivo=false conta só o intervalo depois de "a" até "b" (diferença).
 */
export function diasUteisEntre(a: string, b: string, inclusivo = true): number {
  let n = 0;
  for (let x = dia(a) + (inclusivo ? 0 : 1); x <= dia(b); x++) if (!fimDeSemana(iso(x))) n++;
  return n;
}

/** Soma n dias (n pode ser negativo). Em dias úteis, pula sábados e domingos. */
export function somarDias(d: string, n: number, uteis: boolean): string {
  if (!uteis) return iso(dia(d) + n);
  let x = dia(d), passo = Math.sign(n), restam = Math.abs(n);
  while (restam > 0) { x += passo; if (!fimDeSemana(iso(x))) restam--; }
  return iso(x);
}

/** Data de término para um início e uma duração (o dia de início conta como 1º dia). */
export function fimPorDuracao(inicio: string, duracao: number, uteis: boolean): string {
  const ini = uteis ? proximoUtil(inicio) : inicio;
  return somarDias(ini, duracao - 1, uteis);
}

/** Duração (inclusiva) entre início e fim. */
export function duracaoEntre(inicio: string, fim: string, uteis: boolean): number {
  if (dia(fim) < dia(inicio)) return 0;
  return uteis ? diasUteisEntre(inicio, fim) : diasEntre(inicio, fim) + 1;
}

/** Início mais cedo permitido pelas predecessoras: dia seguinte ao término + folga. */
export function inicioPelasPredecessoras(fins: { fim: string; folga: number }[], uteis: boolean): string | null {
  if (!fins.length) return null;
  const candidatos = fins.map(({ fim, folga }) => {
    const seguinte = somarDias(fim, 1, uteis);
    return folga ? somarDias(seguinte, folga, uteis) : seguinte;
  });
  const maior = candidatos.sort().pop()!;
  return uteis ? proximoUtil(maior) : maior;
}

export interface ResultadoCalculo<T> { itens: T[]; erros: string[] }

/**
 * Recalcula as datas previstas seguindo as predecessoras (ordem topológica).
 * - Item com predecessoras: início = maior (término da predecessora + 1 dia + folga); fim = início + duração.
 * - Item sem predecessoras: mantém o início; se houver duração, o fim segue a duração.
 * - Predecessora sem término previsto: o item fica como está e é avisado.
 * - Dependência circular: é recusada e avisada.
 */
export function calcularDatas<T extends ItemCronograma & { chave: string }>(
  itens: T[], deps: { item: string; pred: string; folga: number }[], uteis: boolean,
): ResultadoCalculo<T> {
  const erros: string[] = [];
  const porChave = new Map(itens.map((i) => [i.chave, { ...i }]));
  const predsDe = (k: string) => deps.filter((d) => d.item === k && porChave.has(d.pred));
  const estado = new Map<string, "visitando" | "feito">();
  const ordem: string[] = [];
  const visitar = (k: string, trilha: string[]): boolean => {
    if (estado.get(k) === "feito") return true;
    if (estado.get(k) === "visitando") {
      erros.push(`Dependência circular: ${[...trilha, k].map((c) => porChave.get(c)?.nome).join(" → ")}`);
      return false;
    }
    estado.set(k, "visitando");
    for (const d of predsDe(k)) if (!visitar(d.pred, [...trilha, k])) return false;
    estado.set(k, "feito");
    ordem.push(k);
    return true;
  };
  for (const i of itens) if (!visitar(i.chave, [])) return { itens, erros };

  for (const k of ordem) {
    const it = porChave.get(k)!;
    const ps = predsDe(k);
    const dur = it.duracao_dias ?? (it.inicio_previsto && it.fim_previsto ? duracaoEntre(it.inicio_previsto, it.fim_previsto, uteis) || null : null);
    if (ps.length) {
      const semFim = ps.filter((d) => !porChave.get(d.pred)!.fim_previsto);
      if (semFim.length) {
        erros.push(`“${it.nome}”: a predecessora ${semFim.map((d) => `“${porChave.get(d.pred)!.nome}”`).join(", ")} ainda não tem término previsto.`);
        continue;
      }
      it.inicio_previsto = inicioPelasPredecessoras(ps.map((d) => ({ fim: porChave.get(d.pred)!.fim_previsto!, folga: d.folga })), uteis);
    } else if (it.inicio_previsto && uteis && fimDeSemana(it.inicio_previsto) && dur) {
      it.inicio_previsto = proximoUtil(it.inicio_previsto);
    }
    if (it.inicio_previsto && dur) {
      it.duracao_dias = dur;
      it.fim_previsto = fimPorDuracao(it.inicio_previsto, dur, uteis);
    }
  }
  return { itens: itens.map((i) => porChave.get(i.chave)!), erros };
}
