// Rótulos, listas e regras de negócio usadas na interface.
// As regras de cálculo da prioridade espelham a visão v_demandas do banco.

export type Papel = "gestor" | "engenheiro" | "consulta" | "contratada";
export type Situacao = "nao_iniciada" | "em_andamento" | "aguardando" | "suspensa" | "cancelada" | "concluida";
export type Etapa =
  | "recebida" | "estudo_projeto" | "memorial_descritivo" | "rms_suprimentos"
  | "aprovacao" | "ordem_servico" | "execucao" | "encerramento" | "concluida";
export type Forma = "interna" | "contratada";
export type Classe = "critico" | "alto" | "medio" | "baixo";

export const PAPEIS: Record<Papel, string> = {
  gestor: "Gestor",
  engenheiro: "Engenheiro",
  consulta: "Consulta",
  contratada: "Contratada",
};

export const PAPEIS_AJUDA: Record<Papel, string> = {
  gestor: "Acesso total, inclusive custos e usuários.",
  engenheiro: "Cadastra e atualiza demandas, atividades, documentos e RDOs. Não vê custos.",
  consulta: "Somente leitura. Não vê custos.",
  contratada: "Vê apenas as demandas da própria empresa; preenche RDO e envia documentos.",
};

export const SITUACOES: Record<Situacao, string> = {
  nao_iniciada: "Não iniciada",
  em_andamento: "Em andamento",
  aguardando: "Aguardando",
  suspensa: "Suspensa",
  cancelada: "Cancelada",
  concluida: "Concluída",
};

export const SITUACOES_FECHADAS: Situacao[] = ["concluida", "cancelada"];
export const estaAberta = (s: Situacao) => !SITUACOES_FECHADAS.includes(s);

export const ETAPAS: Record<Etapa, string> = {
  recebida: "Recebida",
  estudo_projeto: "Estudo / Projeto",
  memorial_descritivo: "Memorial Descritivo",
  rms_suprimentos: "RMS / Suprimentos",
  aprovacao: "Aprovação",
  ordem_servico: "Ordem de Serviço",
  execucao: "Execução",
  encerramento: "Encerramento",
  concluida: "Concluída",
};

/** Fluxo validado: execução interna não passa pelas etapas de contratação. */
export const FLUXO: Record<Forma, Etapa[]> = {
  contratada: ["recebida", "estudo_projeto", "memorial_descritivo", "rms_suprimentos", "aprovacao", "ordem_servico", "execucao", "encerramento", "concluida"],
  interna: ["recebida", "estudo_projeto", "aprovacao", "execucao", "encerramento", "concluida"],
};

export const FORMAS: Record<Forma, string> = { interna: "Execução interna", contratada: "Serviço contratado" };

export const MD_SITUACOES: Record<string, string> = {
  nao_necessario: "Não necessário",
  a_elaborar: "A elaborar",
  em_elaboracao: "Em elaboração",
  em_validacao: "Em validação",
  emitido: "Emitido",
};

export const RMS_SITUACOES: Record<string, string> = {
  aberta: "Aberta",
  em_cotacao: "Em cotação",
  aprovada: "Aprovada",
  atendida: "Atendida",
  cancelada: "Cancelada",
};

export const CATEGORIAS: Record<string, { nome: string; exemplos: string }> = {
  SEG: { nome: "Segurança de pessoas (SMS)", exemplos: "Queda de altura, choque elétrico, trabalho em telhado, atropelamento em pátio" },
  EST: { nome: "Estrutural e civil", exemplos: "Parede com risco de queda, telhado deteriorado, pavimento, fundações" },
  ELE: { nome: "Elétrico e SPDA", exemplos: "Quadros, subestações, geradores, aterramento e proteção contra descargas" },
  OPE: { nome: "Continuidade operacional", exemplos: "Interdição de áreas, parada de berço ou pátio, falha em equipamento crítico" },
  LEG: { nome: "Legal e normativo", exemplos: "Descumprimento de NRs, ABNT, licenças e garantias contratuais" },
  AMB: { nome: "Ambiental", exemplos: "Vazamentos, efluentes, drenagem com lama e detritos, resíduos" },
  FIN: { nome: "Financeiro e contratual", exemplos: "Estouro de orçamento, MD divergente da proposta, atraso em RMS" },
  REC: { nome: "Recursos e equipe", exemplos: "Dependência de um único profissional, subdimensionamento, falta de cobertura" },
  PAT: { nome: "Patrimonial e ativos", exemplos: "Infiltrações, degradação de edificações, perda de equipamentos" },
};

export const PROBABILIDADE = [
  { nota: 1, nivel: "Rara", criterio: "Não se espera que ocorra" },
  { nota: 2, nivel: "Improvável", criterio: "Pode ocorrer em situação excepcional" },
  { nota: 3, nivel: "Possível", criterio: "Pode ocorrer ao longo do ano" },
  { nota: 4, nivel: "Provável", criterio: "Já ocorreu ou a condição já existe" },
  { nota: 5, nivel: "Quase certa", criterio: "Está ocorrendo ou ocorrerá em breve" },
];

export const SEVERIDADE: Record<"pessoas" | "operacao" | "financeiro" | "legal", string[]> = {
  pessoas: ["Sem lesão", "Primeiros socorros", "Afastamento", "Lesão grave", "Fatalidade ou múltiplas lesões graves"],
  operacao: ["Sem impacto", "Atraso pontual", "Restrição parcial", "Paralisação de área", "Paralisação de operação crítica"],
  financeiro: ["Insignificante", "Baixo", "Moderado", "Alto", "Muito alto"],
  legal: ["Sem não conformidade", "Não conformidade leve", "Notificação", "Multa ou interdição", "Embargo ou responsabilização criminal"],
};

export const CLASSES: Record<Classe, { nome: string; acao: string; prazo: string; glifo: string }> = {
  critico: { nome: "Crítico", acao: "Ação imediata, com bloqueio ou isolamento da área, se necessário", prazo: "Até 24 a 72 h", glifo: "▲" },
  alto: { nome: "Alto", acao: "Plano de ação com responsável e verba priorizada", prazo: "Até 30 dias", glifo: "◆" },
  medio: { nome: "Médio", acao: "Programar na manutenção planejada", prazo: "Até 90 dias", glifo: "◐" },
  baixo: { nome: "Baixo", acao: "Monitorar e tratar na rotina", prazo: "Conforme o plano anual", glifo: "●" },
};

export const ESFORCO: Record<string, string> = { baixo: "Baixo", medio: "Médio", alto: "Alto" };

export interface AvaliacaoPrioridade {
  probabilidade: number | null;
  sev_pessoas: number | null;
  sev_operacao: number | null;
  sev_financeiro: number | null;
  sev_legal: number | null;
  risco_queda_eletro: boolean;
}

/** Severidade = maior impacto entre as quatro colunas. */
export function severidade(a: AvaliacaoPrioridade): number {
  return Math.max(a.sev_pessoas ?? 0, a.sev_operacao ?? 0, a.sev_financeiro ?? 0, a.sev_legal ?? 0);
}

/** Pontuação = P × S (nula enquanto a avaliação estiver incompleta). */
export function pontuacao(a: AvaliacaoPrioridade): number | null {
  const s = severidade(a);
  return a.probabilidade && s > 0 ? a.probabilidade * s : null;
}

/** Classe pela pontuação, com a regra de corte (S = 5, ou queda/eletrocussão com P ≥ 3 → Crítico). */
export function classe(a: AvaliacaoPrioridade): Classe | null {
  const p = pontuacao(a);
  if (p === null) return null;
  const s = severidade(a);
  if (s === 5 || (a.risco_queda_eletro && (a.probabilidade ?? 0) >= 3)) return "critico";
  if (p >= 15) return "critico";
  if (p >= 10) return "alto";
  if (p >= 5) return "medio";
  return "baixo";
}

export function regraDeCorteAplicada(a: AvaliacaoPrioridade): boolean {
  const p = pontuacao(a);
  return p !== null && p < 15 && classe(a) === "critico";
}

// ---------- datas e números ----------
export function hojeISO(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function fmtData(iso?: string | null): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

export function fmtDataHora(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/** Dias entre hoje e a data (positivo = no futuro). */
export function diasAte(iso?: string | null): number | null {
  if (!iso) return null;
  const alvo = new Date(iso.slice(0, 10) + "T00:00:00");
  const hoje = new Date(hojeISO() + "T00:00:00");
  return Math.round((alvo.getTime() - hoje.getTime()) / 86400000);
}

export function fmtMoeda(v?: number | null): string {
  if (v === null || v === undefined) return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function fmtBytes(b: number): string {
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

/** Limiares usados no painel (explicados na tela). */
export const LIMITES = {
  diasVencendo: 7,
  diasSemAtualizacao: 30,
  armazenamentoBytes: 1024 * 1024 * 1024, // 1 GB do plano gratuito
};
