// Critérios únicos dos indicadores: o Painel conta com estas funções e a lista de
// Demandas filtra com as mesmas, garantindo que o número clicado = registros exibidos.
import { diasAte, estaAberta, LIMITES, type Classe, type Etapa, type Forma, type Situacao } from "./dominio";

export interface DemandaLinha {
  id: number;
  codigo: string;
  assunto: string;
  descricao: string | null;
  local_id: number | null;
  local_nome: string | null;
  responsavel_id: number | null;
  responsavel_nome: string | null;
  empresa_id: number | null;
  empresa_nome: string | null;
  solicitante: string | null;
  recebida_em: string | null;
  acomp_gerencial: boolean;
  forma_execucao: Forma;
  situacao: Situacao;
  aguardando_o_que: string | null;
  etapa: Etapa;
  detalhamento: string | null;
  status_projeto: string | null;
  prazo_proxima_etapa: string | null;
  prazo_conclusao: string | null;
  inicio: string | null;
  fim: string | null;
  concluida_em: string | null;
  md_situacao: string | null;
  md_codigo: string | null;
  os_numero: string | null;
  rms_numeros: string | null;
  categoria_principal: string | null;
  categoria_secundaria: string | null;
  probabilidade: number | null;
  sev_pessoas: number | null;
  sev_operacao: number | null;
  sev_financeiro: number | null;
  sev_legal: number | null;
  risco_queda_eletro: boolean;
  prazo_legal: boolean;
  efeito_cadeia: boolean;
  esforco: string | null;
  prioridade_legada: string | null;
  severidade: number;
  pontuacao: number | null;
  classe: Classe | null;
  ranking: number | null;
  atrasada: boolean;
  dias_sem_atualizacao: number | null;
  ultima_atualizacao: string | null;
  atualizado_em: string;
  criado_em: string;
}

export type Marcador = "atrasada" | "vencendo" | "sem_atualizacao" | "sem_avaliacao" | "impedimento" | "acomp";

export const MARCADORES: Record<Marcador, { nome: string; criterio: string }> = {
  atrasada: {
    nome: "Atrasadas",
    criterio: "Demanda aberta (não concluída nem cancelada) com prazo de conclusão anterior a hoje.",
  },
  vencendo: {
    nome: `Vencendo em ${LIMITES.diasVencendo} dias`,
    criterio: `Demanda aberta com prazo de conclusão ou prazo da próxima etapa entre hoje e os próximos ${LIMITES.diasVencendo} dias.`,
  },
  sem_atualizacao: {
    nome: `Sem atualização há +${LIMITES.diasSemAtualizacao} dias`,
    criterio: `Demanda aberta cujo último registro no histórico tem mais de ${LIMITES.diasSemAtualizacao} dias.`,
  },
  sem_avaliacao: {
    nome: "Sem avaliação de prioridade",
    criterio: "Demanda aberta sem probabilidade e severidade preenchidas; por isso fica fora do ranking.",
  },
  impedimento: {
    nome: "Com impedimento",
    criterio: "Demanda com pendência/atividade aberta marcada como impedimento, ou ocorrência de impedimento em RDO dos últimos 30 dias.",
  },
  acomp: { nome: "Acompanhamento gerencial", criterio: "Demanda aberta marcada para acompanhamento gerencial." },
};

export function vencendo(d: DemandaLinha): boolean {
  if (!estaAberta(d.situacao)) return false;
  return [d.prazo_conclusao, d.prazo_proxima_etapa].some((p) => {
    const n = diasAte(p);
    return n !== null && n >= 0 && n <= LIMITES.diasVencendo;
  });
}

export function temMarcador(d: DemandaLinha, m: Marcador, comImpedimento: Set<number>): boolean {
  const aberta = estaAberta(d.situacao);
  switch (m) {
    case "atrasada": return d.atrasada;
    case "vencendo": return vencendo(d);
    case "sem_atualizacao": return aberta && (d.dias_sem_atualizacao ?? 0) > LIMITES.diasSemAtualizacao;
    case "sem_avaliacao": return aberta && d.pontuacao === null;
    case "impedimento": return comImpedimento.has(d.id);
    case "acomp": return aberta && d.acomp_gerencial;
  }
}

export interface Filtros {
  q: string;
  situacao: string; // "abertas" | "todas" | lista separada por vírgula
  etapa: string;
  resp: string;
  forma: string;
  classe: string;
  local: string;
  empresa: string;
  marcador: string;
}

export const FILTROS_PADRAO: Filtros = {
  q: "", situacao: "abertas", etapa: "", resp: "", forma: "", classe: "", local: "", empresa: "", marcador: "",
};

export function lerFiltros(p: URLSearchParams): Filtros {
  const f = { ...FILTROS_PADRAO };
  (Object.keys(f) as (keyof Filtros)[]).forEach((k) => {
    const v = p.get(k);
    if (v !== null) f[k] = v;
  });
  return f;
}

export function filtrosParaURL(f: Filtros): URLSearchParams {
  const p = new URLSearchParams();
  (Object.keys(f) as (keyof Filtros)[]).forEach((k) => {
    if (f[k] !== FILTROS_PADRAO[k]) p.set(k, f[k]);
  });
  return p;
}

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function aplicarFiltros(lista: DemandaLinha[], f: Filtros, comImpedimento: Set<number>): DemandaLinha[] {
  const termo = normalizar(f.q.trim());
  const sits = f.situacao === "abertas" || f.situacao === "todas" ? null : f.situacao.split(",");
  return lista.filter((d) => {
    if (f.situacao === "abertas" && !estaAberta(d.situacao)) return false;
    if (sits && !sits.includes(d.situacao)) return false;
    if (f.etapa && d.etapa !== f.etapa) return false;
    if (f.resp === "sem" ? d.responsavel_id !== null : f.resp && String(d.responsavel_id) !== f.resp) return false;
    if (f.forma && d.forma_execucao !== f.forma) return false;
    if (f.classe === "sem" ? d.classe !== null : f.classe && d.classe !== f.classe) return false;
    if (f.local && String(d.local_id) !== f.local) return false;
    if (f.empresa && String(d.empresa_id) !== f.empresa) return false;
    if (f.marcador && !temMarcador(d, f.marcador as Marcador, comImpedimento)) return false;
    if (termo) {
      const alvo = normalizar([d.codigo, d.assunto, d.local_nome, d.responsavel_nome, d.md_codigo, d.os_numero, d.rms_numeros, d.empresa_nome, d.solicitante].filter(Boolean).join(" "));
      if (!termo.split(/\s+/).every((t) => alvo.includes(t))) return false;
    }
    return true;
  });
}

/** Ordem padrão: abertas pelo ranking, depois abertas sem avaliação, depois encerradas (mais recentes primeiro). */
export function ordenarPadrao(a: DemandaLinha, b: DemandaLinha): number {
  const grupo = (d: DemandaLinha) => (!estaAberta(d.situacao) ? 2 : d.ranking ? 0 : 1);
  const ga = grupo(a), gb = grupo(b);
  if (ga !== gb) return ga - gb;
  if (ga === 0) return (a.ranking ?? 0) - (b.ranking ?? 0);
  if (ga === 2) return (b.concluida_em ?? b.atualizado_em).localeCompare(a.concluida_em ?? a.atualizado_em);
  return b.id - a.id;
}
