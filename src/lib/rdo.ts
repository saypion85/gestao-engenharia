// Regras do RDO e do Resumo do período (cálculos feitos no navegador, sem custo de IA).
import { fmtData } from "./dominio";

export const CLIMA: Record<string, string> = { bom: "Bom", nublado: "Nublado", chuvoso: "Chuvoso", impraticavel: "Impraticável" };

export const MOTIVOS_PARALISACAO: Record<string, string> = {
  chuva: "Chuva / mau tempo",
  area_operacao: "Área não liberada pela Operação",
  falta_material: "Falta de material",
  equipamento: "Falta ou quebra de equipamento",
  seguranca: "Segurança (PT, integração, condição insegura)",
  mao_de_obra: "Falta de mão de obra",
  projeto: "Projeto / definição técnica",
  outros: "Outros",
};

/** Uma linha por pessoa. "quantidade" só existe em RDOs antigos (antes do campo Nome). */
export interface Efetivo { nome?: string; funcao: string; quantidade?: number; tipo: "proprio" | "terceiro" }
export interface Equip { descricao: string; quantidade: number }
export interface Ocorrencia { descricao: string; impedimento: boolean }
export interface Paralisacao { motivo: string; inicio: string; fim: string; descricao: string }

export interface RdoResumivel {
  id: number; data: string; status: string; origem: string;
  horario_inicio: string | null; horario_fim: string | null;
  clima_manha: string | null; clima_tarde: string | null; area_praticavel: boolean | null;
  efetivo: Efetivo[]; equipamentos: Equip[]; atividades_executadas: string | null;
  ocorrencias: Ocorrencia[]; paralisacoes: Paralisacao[] | null;
  dds_realizado: boolean | null; pt_emitida: boolean | null; ast_realizada: boolean | null;
  incidentes: string | null; materiais_recebidos: string | null; observacoes_contratada: string | null;
  apontamentos_contratante: string | null;
}

const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

/** Dia da semana de uma data ISO (AAAA-MM-DD), sem depender do fuso. */
export function diaSemana(iso?: string | null, curto = false): string {
  if (!iso) return "";
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  const nome = DIAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
  return curto ? nome.slice(0, 3) : nome;
}

/** "sexta-feira, 13/11/2026" */
export const dataComSemana = (iso?: string | null) => (iso ? `${diaSemana(iso)}, ${fmtData(iso)}` : "—");

function minutos(h?: string | null): number | null {
  if (!h) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(h);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Duração em horas de uma paralisação; null quando o horário está incompleto ou invertido. */
export function horasParalisacao(p: Pick<Paralisacao, "inicio" | "fim">): number | null {
  const a = minutos(p.inicio), b = minutos(p.fim);
  if (a === null || b === null || b <= a) return null;
  return (b - a) / 60;
}

export const fmtHoras = (h: number) => {
  const total = Math.round(h * 60);
  const hh = Math.floor(total / 60), mm = total % 60;
  return mm ? `${hh}h${String(mm).padStart(2, "0")}` : `${hh}h`;
};

const pessoas = (e: Efetivo) => (e.quantidade && !e.nome ? Number(e.quantidade) || 1 : 1);
const chuvoso = (c: string | null) => c === "chuvoso" || c === "impraticavel";

export interface ResumoPeriodo {
  rdos: number;
  rascunhosIgnorados: number;
  primeiro: string | null;
  ultimo: string | null;
  clima: Record<string, number>; // turnos por condição
  diasComChuva: number;
  diasAreaImpraticavel: number;
  horasTrabalhadas: number;
  paralisacao: { motivo: string; nome: string; horas: number; vezes: number; dias: number }[];
  horasParalisadas: number;
  horasMauTempo: number;
  paralisacoesSemHorario: number;
  homensDia: number; proprio: number; terceiro: number; mediaDia: number; picoDia: { data: string; pessoas: number } | null;
  equipamentos: { descricao: string; dias: number }[];
  ocorrencias: { data: string; descricao: string; impedimento: boolean }[];
  paralisacoes: { data: string; motivo: string; inicio: string; fim: string; horas: number | null; descricao: string }[];
  seguranca: { dds: [number, number]; pt: [number, number]; ast: [number, number] };
  incidentes: { data: string; texto: string }[];
  apontamentos: { data: string; texto: string }[];
  ressalvas: number;
  atividades: { data: string; texto: string }[];
  materiais: { data: string; texto: string }[];
}

/** Consolida os RDOs finalizados (rascunhos ficam de fora). */
export function resumirPeriodo(lista: RdoResumivel[]): ResumoPeriodo {
  const rdos = lista.filter((r) => r.status !== "rascunho").sort((a, b) => a.data.localeCompare(b.data));
  const clima: Record<string, number> = {};
  const par = new Map<string, { horas: number; vezes: number; dias: Set<string> }>();
  const equip = new Map<string, Set<string>>();
  const porDia = new Map<string, number>();
  const sim = (v: (r: RdoResumivel) => boolean | null): [number, number] =>
    [rdos.filter((r) => v(r) === true).length, rdos.filter((r) => v(r) !== null).length];
  const texto = (campo: keyof RdoResumivel) =>
    rdos.filter((r) => String(r[campo] ?? "").trim()).map((r) => ({ data: r.data, texto: String(r[campo]).trim() }));

  let horasTrabalhadas = 0, proprio = 0, terceiro = 0, semHorario = 0;
  const paralisacoes: ResumoPeriodo["paralisacoes"] = [];
  const diasChuva = new Set<string>(), diasImprat = new Set<string>();

  for (const r of rdos) {
    for (const c of [r.clima_manha, r.clima_tarde]) if (c) clima[c] = (clima[c] ?? 0) + 1;
    if (chuvoso(r.clima_manha) || chuvoso(r.clima_tarde)) diasChuva.add(r.data);
    if (r.area_praticavel === false) diasImprat.add(r.data);
    const ht = horasParalisacao({ inicio: r.horario_inicio ?? "", fim: r.horario_fim ?? "" });
    if (ht) horasTrabalhadas += ht;
    for (const e of r.efetivo ?? []) {
      if (!e.funcao?.trim() && !e.nome?.trim()) continue;
      const n = pessoas(e);
      if (e.tipo === "terceiro") terceiro += n; else proprio += n;
      porDia.set(r.data, (porDia.get(r.data) ?? 0) + n);
    }
    for (const q of r.equipamentos ?? []) {
      const k = q.descricao?.trim();
      if (!k) continue;
      if (!equip.has(k)) equip.set(k, new Set());
      equip.get(k)!.add(r.data);
    }
    for (const p of r.paralisacoes ?? []) {
      const h = horasParalisacao(p);
      paralisacoes.push({ data: r.data, motivo: p.motivo, inicio: p.inicio, fim: p.fim, horas: h, descricao: p.descricao ?? "" });
      if (h === null) { semHorario++; }
      const k = p.motivo || "outros";
      if (!par.has(k)) par.set(k, { horas: 0, vezes: 0, dias: new Set() });
      const x = par.get(k)!;
      x.horas += h ?? 0; x.vezes++; x.dias.add(r.data);
    }
  }

  const paralisacao = [...par.entries()]
    .map(([motivo, x]) => ({ motivo, nome: MOTIVOS_PARALISACAO[motivo] ?? motivo, horas: x.horas, vezes: x.vezes, dias: x.dias.size }))
    .sort((a, b) => b.horas - a.horas || b.vezes - a.vezes);
  const homensDia = proprio + terceiro;
  let pico: ResumoPeriodo["picoDia"] = null;
  for (const [data, n] of porDia) if (!pico || n > pico.pessoas) pico = { data, pessoas: n };

  return {
    rdos: rdos.length,
    rascunhosIgnorados: lista.length - rdos.length,
    primeiro: rdos[0]?.data ?? null,
    ultimo: rdos[rdos.length - 1]?.data ?? null,
    clima,
    diasComChuva: diasChuva.size,
    diasAreaImpraticavel: diasImprat.size,
    horasTrabalhadas,
    paralisacao,
    horasParalisadas: paralisacao.reduce((s, p) => s + p.horas, 0),
    horasMauTempo: par.get("chuva")?.horas ?? 0,
    paralisacoesSemHorario: semHorario,
    homensDia, proprio, terceiro,
    mediaDia: porDia.size ? homensDia / porDia.size : 0,
    picoDia: pico,
    equipamentos: [...equip.entries()].map(([descricao, d]) => ({ descricao, dias: d.size })).sort((a, b) => b.dias - a.dias),
    ocorrencias: rdos.flatMap((r) => (r.ocorrencias ?? []).filter((o) => o.descricao?.trim()).map((o) => ({ data: r.data, descricao: o.descricao.trim(), impedimento: !!o.impedimento }))),
    paralisacoes,
    seguranca: { dds: sim((r) => r.dds_realizado), pt: sim((r) => r.pt_emitida), ast: sim((r) => r.ast_realizada) },
    incidentes: texto("incidentes"),
    apontamentos: texto("apontamentos_contratante"),
    ressalvas: rdos.filter((r) => r.status === "revisado_ressalvas").length,
    atividades: texto("atividades_executadas"),
    materiais: texto("materiais_recebidos"),
  };
}

const pl = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Destaques em frases curtas, montados só a partir dos dados registrados. */
export function destaques(s: ResumoPeriodo): string[] {
  if (!s.rdos) return [];
  const out: string[] = [];
  out.push(`${pl(s.rdos, "RDO registrado", "RDOs registrados")} entre ${fmtData(s.primeiro)} e ${fmtData(s.ultimo)}` +
    (s.horasTrabalhadas ? `, somando ${fmtHoras(s.horasTrabalhadas)} de jornada.` : "."));
  if (s.horasParalisadas || s.paralisacao.length) {
    const top = s.paralisacao[0];
    out.push(`Paralisações: ${fmtHoras(s.horasParalisadas)} no total` +
      (s.horasTrabalhadas ? ` (${Math.round((s.horasParalisadas / s.horasTrabalhadas) * 100)}% da jornada)` : "") +
      (top ? `; principal motivo: ${top.nome} (${fmtHoras(top.horas)} em ${pl(top.dias, "dia", "dias")}).` : "."));
  } else out.push("Nenhuma paralisação registrada.");
  if (s.diasComChuva || s.horasMauTempo)
    out.push(`Clima: chuva em ${pl(s.diasComChuva, "dia", "dias")}` + (s.horasMauTempo ? `, com ${fmtHoras(s.horasMauTempo)} parados por mau tempo.` : "."));
  if (s.diasAreaImpraticavel) out.push(`Área impraticável em ${pl(s.diasAreaImpraticavel, "dia", "dias")}.`);
  const imp = s.ocorrencias.filter((o) => o.impedimento).length;
  if (s.ocorrencias.length) out.push(`${pl(s.ocorrencias.length, "ocorrência registrada", "ocorrências registradas")}` + (imp ? `, ${imp} com impedimento.` : "."));
  if (s.homensDia) out.push(`Efetivo: ${s.homensDia} homens-dia (${s.proprio} próprios, ${s.terceiro} terceiros), média de ${s.mediaDia.toFixed(1).replace(".", ",")} pessoas por dia.`);
  const falta = (["dds", "pt", "ast"] as const).filter((k) => s.seguranca[k][1] > s.seguranca[k][0]).map((k) => k.toUpperCase());
  if (falta.length) out.push(`Segurança: houve dias sem ${falta.join(", ")}.`);
  if (s.incidentes.length) out.push(`${pl(s.incidentes.length, "registro", "registros")} de incidente ou quase acidente.`);
  if (s.ressalvas) out.push(`${pl(s.ressalvas, "RDO revisado", "RDOs revisados")} com ressalvas.`);
  return out;
}

/** Texto pronto para colar no Claude (claude.ai) e pedir um resumo redigido. */
export function textoParaIA(demanda: string, de: string, ate: string, s: ResumoPeriodo): string {
  const L: string[] = [];
  L.push(`Faça um resumo executivo, em português, dos Relatórios Diários de Obra (RDO) abaixo. Use só as informações fornecidas, sem inventar nada.`);
  L.push(`Destaque: os acontecimentos mais importantes; o tempo de paralisação por motivo (com atenção ao mau tempo); impedimentos ainda relevantes; segurança; e pontos de atenção para a gestão. Termine com uma lista curta de recomendações.`);
  L.push("", `Obra: ${demanda}`, `Período: ${fmtData(de)} a ${fmtData(ate)}`, "");
  L.push("== Indicadores ==", ...destaques(s), "");
  if (s.paralisacao.length) {
    L.push("== Paralisações por motivo ==");
    s.paralisacao.forEach((p) => L.push(`- ${p.nome}: ${fmtHoras(p.horas)} (${pl(p.vezes, "vez", "vezes")}, ${pl(p.dias, "dia", "dias")})`));
    L.push("");
  }
  L.push("== Registros diários ==");
  const dias = [...new Set([...s.atividades, ...s.ocorrencias, ...s.paralisacoes, ...s.incidentes, ...s.apontamentos].map((x) => x.data))].sort();
  for (const d of dias) {
    L.push(`${dataComSemana(d)}:`);
    s.atividades.filter((x) => x.data === d).forEach((x) => L.push(`  Atividades: ${x.texto}`));
    s.paralisacoes.filter((x) => x.data === d).forEach((x) =>
      L.push(`  Paralisação: ${MOTIVOS_PARALISACAO[x.motivo] ?? x.motivo}${x.horas !== null ? ` das ${x.inicio} às ${x.fim} (${fmtHoras(x.horas)})` : " (sem horário)"}${x.descricao ? ` – ${x.descricao}` : ""}`));
    s.ocorrencias.filter((x) => x.data === d).forEach((x) => L.push(`  Ocorrência${x.impedimento ? " (impedimento)" : ""}: ${x.descricao}`));
    s.incidentes.filter((x) => x.data === d).forEach((x) => L.push(`  Incidente: ${x.texto}`));
    s.apontamentos.filter((x) => x.data === d).forEach((x) => L.push(`  Apontamento da Triunfo: ${x.texto}`));
  }
  return L.join("\n");
}

/** Linhas visíveis de um texto longo (para o campo crescer e não esconder conteúdo). */
export function linhasTexto(texto: string | null | undefined, largura = 70, minimo = 1): number {
  const n = (texto ?? "").split("\n").reduce((s, l) => s + Math.max(1, Math.ceil(l.length / largura)), 0);
  return Math.max(minimo, n);
}
