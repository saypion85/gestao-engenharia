// Regras da seção Reuniões: sugestão de pauta, retrato da ata e texto para e-mail/Teams.
import { ETAPAS, SITUACOES, estaAberta, fmtData, type Etapa, type Situacao } from "./dominio";
import { MARCADORES, temMarcador, type DemandaLinha, type Marcador } from "./filtros";

export interface Reuniao {
  id: number; titulo: string; data: string; hora: string | null; local: string | null;
  participantes_ids: number[]; convidados: string | null; objetivo: string | null; assuntos_gerais: string | null;
  status: "planejada" | "realizada"; ata: Ata | null; encerrada_em: string | null; encerrada_por_nome: string | null;
  criado_em: string;
}

export interface ItemPauta { id: number; reuniao_id: number; demanda_id: number; ordem: number; motivos: string[]; notas: string | null; discutido: boolean }

export interface Acao {
  id: number; demanda_id: number | null; reuniao_id: number | null; tipo: string; titulo: string;
  responsavel_id: number | null; prazo: string | null; situacao: "a_fazer" | "em_andamento" | "concluida" | "cancelada";
  concluida_em: string | null; criado_em: string;
}

export interface DecisaoRegistro {
  id: number; demanda_id: number; data: string; texto: string; autor_nome: string | null;
  decisao_status: "pendente" | "tomada" | null; decisao_responsavel: string | null; decisao_prazo: string | null;
  decisao_resultado: string | null; decidida_em: string | null; decidida_por_nome: string | null; reuniao_id: number | null;
}

/** Motivos que levam uma demanda à pauta, em ordem de gravidade. */
export const MOTIVOS_PAUTA: Marcador[] = ["impedimento", "atrasada", "etapa_vencida", "aprovacao", "sem_atualizacao", "vencendo", "acomp"];

export function motivosDaDemanda(d: DemandaLinha, impedimentos: Set<number>, comDecisaoPendente: Set<number>): string[] {
  if (!estaAberta(d.situacao)) return [];
  const m: string[] = [];
  if (comDecisaoPendente.has(d.id)) m.push("Decisão a tomar");
  for (const k of MOTIVOS_PAUTA) if (temMarcador(d, k, impedimentos)) m.push(MARCADORES[k].nome);
  return m;
}

/** Peso para ordenar as sugestões: impedimento/decisão/atraso primeiro, depois prioridade. */
export function pesoPauta(d: DemandaLinha, motivos: string[]): number {
  const grave = ["Com impedimento", "Decisão a tomar", MARCADORES.atrasada.nome, MARCADORES.etapa_vencida.nome];
  return motivos.filter((m) => grave.includes(m)).length * 100 + motivos.length * 10 + (d.ranking ? Math.max(0, 50 - d.ranking) : 0);
}

export interface Ata {
  gerada_em: string;
  reuniao: { titulo: string; data: string; hora: string | null; local: string | null; participantes: string[]; convidados: string | null; objetivo: string | null; encerrada_por: string | null };
  itens: { codigo: string; assunto: string; situacao: string; etapa: string; responsavel: string | null; prazo: string | null; motivos: string[]; notas: string | null; discutido: boolean }[];
  decisoes_tomadas: { demanda: string; texto: string; resultado: string | null; por: string | null }[];
  decisoes_pendentes: { demanda: string; texto: string; quem: string | null; prazo: string | null }[];
  acoes: { demanda: string | null; descricao: string; responsavel: string | null; prazo: string | null }[];
  acompanhamento: { demanda: string | null; descricao: string; responsavel: string | null; prazo: string | null; situacao: string }[];
  assuntos_gerais: string | null;
}

const SIT_ACAO: Record<string, string> = { a_fazer: "A fazer", em_andamento: "Em andamento", concluida: "Concluída", cancelada: "Cancelada" };

export function montarAta(args: {
  reuniao: Reuniao; itens: ItemPauta[]; demandas: DemandaLinha[]; pessoas: { id: number; nome: string }[];
  decisoes: DecisaoRegistro[]; acoes: Acao[]; acoesAnteriores: Acao[]; encerradaPor: string | null; agora: string;
}): Ata {
  const { reuniao, itens, demandas, pessoas, decisoes, acoes, acoesAnteriores } = args;
  const dem = (id: number | null) => (id ? demandas.find((d) => d.id === id) : undefined);
  const rotulo = (id: number | null) => { const d = dem(id); return d ? `${d.codigo} · ${d.assunto}` : null; };
  const pessoa = (id: number | null) => pessoas.find((p) => p.id === id)?.nome ?? null;
  const idsPauta = new Set(itens.map((i) => i.demanda_id));
  return {
    gerada_em: args.agora,
    reuniao: {
      titulo: reuniao.titulo, data: reuniao.data, hora: reuniao.hora, local: reuniao.local,
      participantes: reuniao.participantes_ids.map((id) => pessoa(id)).filter(Boolean) as string[],
      convidados: reuniao.convidados, objetivo: reuniao.objetivo, encerrada_por: args.encerradaPor,
    },
    itens: [...itens].sort((a, b) => a.ordem - b.ordem).map((i) => {
      const d = dem(i.demanda_id);
      return {
        codigo: d?.codigo ?? "", assunto: d?.assunto ?? "", situacao: d ? SITUACOES[d.situacao as Situacao] : "",
        etapa: d ? ETAPAS[d.etapa as Etapa] : "", responsavel: d?.responsavel_nome ?? null, prazo: d?.prazo_conclusao ?? null,
        motivos: i.motivos, notas: i.notas?.trim() || null, discutido: i.discutido,
      };
    }),
    decisoes_tomadas: decisoes.filter((x) => x.decisao_status === "tomada" && x.reuniao_id === reuniao.id)
      .map((x) => ({ demanda: rotulo(x.demanda_id) ?? "", texto: x.texto, resultado: x.decisao_resultado, por: x.decidida_por_nome ?? x.autor_nome })),
    decisoes_pendentes: decisoes.filter((x) => x.decisao_status === "pendente" && (idsPauta.has(x.demanda_id) || x.reuniao_id === reuniao.id))
      .map((x) => ({ demanda: rotulo(x.demanda_id) ?? "", texto: x.texto, quem: x.decisao_responsavel, prazo: x.decisao_prazo })),
    acoes: acoes.filter((a) => a.reuniao_id === reuniao.id && a.situacao !== "cancelada")
      .map((a) => ({ demanda: rotulo(a.demanda_id), descricao: a.titulo, responsavel: pessoa(a.responsavel_id), prazo: a.prazo })),
    acompanhamento: acoesAnteriores.map((a) => ({ demanda: rotulo(a.demanda_id), descricao: a.titulo, responsavel: pessoa(a.responsavel_id), prazo: a.prazo, situacao: SIT_ACAO[a.situacao] })),
    assuntos_gerais: reuniao.assuntos_gerais?.trim() || null,
  };
}

/** Texto simples da ata, para colar em e-mail ou Teams. */
export function ataEmTexto(a: Ata): string {
  const L: string[] = [];
  const r = a.reuniao;
  L.push(`ATA DE REUNIÃO — ${r.titulo}`);
  L.push(`Data: ${fmtData(r.data)}${r.hora ? ` às ${r.hora.slice(0, 5)}` : ""}${r.local ? ` · Local: ${r.local}` : ""}`);
  L.push(`Participantes: ${[...r.participantes, ...(r.convidados ? [r.convidados] : [])].join(", ") || "—"}`);
  if (r.objetivo) L.push(`Objetivo: ${r.objetivo}`);
  L.push("");
  L.push("PLANO DE AÇÃO");
  if (!a.acoes.length) L.push("  (nenhuma ação definida)");
  a.acoes.forEach((x, i) => L.push(`  ${i + 1}. ${x.descricao} — Responsável: ${x.responsavel ?? "a definir"} — Prazo: ${x.prazo ? fmtData(x.prazo) : "a definir"}${x.demanda ? ` [${x.demanda}]` : ""}`));
  L.push("");
  L.push("DECISÕES TOMADAS");
  if (!a.decisoes_tomadas.length) L.push("  (nenhuma)");
  a.decisoes_tomadas.forEach((x) => L.push(`  • ${x.demanda}: ${x.texto}${x.resultado ? ` → ${x.resultado}` : ""}`));
  L.push("");
  L.push("DECISÕES A TOMAR");
  if (!a.decisoes_pendentes.length) L.push("  (nenhuma)");
  a.decisoes_pendentes.forEach((x) => L.push(`  • ${x.demanda}: ${x.texto}${x.quem ? ` — Quem decide: ${x.quem}` : ""}${x.prazo ? ` — Até ${fmtData(x.prazo)}` : ""}`));
  L.push("");
  L.push("PONTOS DISCUTIDOS POR DEMANDA");
  a.itens.forEach((x) => {
    L.push(`  ${x.codigo} · ${x.assunto} (${x.situacao}, ${x.etapa}${x.responsavel ? `, ${x.responsavel}` : ""})`);
    if (x.motivos.length) L.push(`    Atenção: ${x.motivos.join(", ")}`);
    L.push(`    ${x.notas ?? (x.discutido ? "Discutido, sem anotações." : "Não discutido.")}`);
  });
  if (a.assuntos_gerais) { L.push(""); L.push("ASSUNTOS GERAIS"); L.push(`  ${a.assuntos_gerais}`); }
  if (a.acompanhamento.length) {
    L.push(""); L.push("ACOMPANHAMENTO DE AÇÕES ANTERIORES");
    a.acompanhamento.forEach((x) => L.push(`  • ${x.descricao} — ${x.responsavel ?? "—"} — ${x.prazo ? fmtData(x.prazo) : "sem prazo"} — ${x.situacao}`));
  }
  L.push("");
  L.push(`Ata gerada em ${new Date(a.gerada_em).toLocaleString("pt-BR")}${r.encerrada_por ? ` por ${r.encerrada_por}` : ""}.`);
  return L.join("\n");
}
