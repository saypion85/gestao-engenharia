import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase, mensagemErro } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { ETAPAS, FLUXO, FORMAS, LIMITES, SITUACOES, diasAte, estaAberta, fmtBytes, fmtMoeda, type Situacao } from "../lib/dominio";
import {
  FILTROS_PADRAO, MARCADORES, SITUACOES_ATIVAS, aplicarFiltros, diasParado, estaAtiva, filtrosParaURL, grupoMD, grupoRMS,
  temMarcador, type DemandaLinha, type Filtros, type Marcador,
} from "../lib/filtros";
import { carregarDemandas } from "./Demandas";
import { Ajuda, Aviso, BadgeClasse, Carregando } from "../components/ui";
import { ListaItens, type Atividade } from "../components/demanda/AtividadesAba";
import { BarrasEmpilhadas, GraficoTendencia, Legenda, type ItemBarra, type PontoMes } from "../components/painel/Graficos";
import PontosAcao, { type PontoAuto } from "../components/painel/PontosAcao";

const COR = { andamento: "var(--serie-1)", aguardando: "var(--serie-2)", nao_iniciada: "var(--serie-3)", alerta: "var(--trl-vermelho)" };
const GRUPOS: [string, Situacao[]][] = [
  ["Carteira ativa", ["em_andamento", "aguardando", "nao_iniciada"]],
  ["Pausadas", ["suspensa"]],
  ["Encerradas", ["concluida", "cancelada"]],
];
const DICA_SITUACAO: Record<Situacao, string> = {
  em_andamento: "obra, serviço ou projeto em andamento", aguardando: "aprovação, suprimentos ou definição",
  nao_iniciada: "ainda não começou", suspensa: "interrompida temporariamente (mantém o ranking)",
  concluida: "entregue", cancelada: "não será executada",
};
const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const pct = (a: number, b: number) => (b ? Math.round((a * 100) / b) : 0);
const contar = <T,>(arr: T[], fn: (x: T) => boolean) => arr.reduce((n, x) => n + (fn(x) ? 1 : 0), 0);

interface Custo { demanda_id: number; orcado_externo: number | null; custo_terceirizados: number | null; custo_execucao_propria: number | null; custo_mo_propria: number | null; save: number | null }

export default function Painel() {
  const { cadastros, eGestor } = useAuth();
  const [dados, setDados] = useState<{ lista: DemandaLinha[]; impedimentos: Set<number> } | null>(null);
  const [ativs, setAtivs] = useState<Atividade[]>([]);
  const [impedList, setImpedList] = useState<{ origem: string; demanda_id: number; descricao: string; detalhe: string; data: string }[]>([]);
  const [custos, setCustos] = useState<Custo[] | null>(null);
  const [uso, setUso] = useState<{ bytes: number; arquivos: number } | null>(null);
  const [erro, setErro] = useState("");
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const [f, setF] = useState<Filtros>({ ...FILTROS_PADRAO, situacao: "todas" });
  const [busca, setBusca] = useState("");
  const mudar = (p: Partial<Filtros>) => setF((x) => ({ ...x, ...p }));

  async function carregar() {
    setErro("");
    try {
      const limite = new Date(Date.now() + LIMITES.diasVencendo * 86400000).toISOString().slice(0, 10);
      const [d, a, imp, u, c] = await Promise.all([
        carregarDemandas(),
        supabase.from("atividades").select("*, demandas(codigo, assunto)").in("situacao", ["a_fazer", "em_andamento"]).not("prazo", "is", null).lte("prazo", limite).order("prazo").limit(30),
        supabase.from("v_impedimentos").select("*").order("data", { ascending: false }).limit(40),
        supabase.rpc("uso_armazenamento"),
        eGestor ? supabase.from("v_custos").select("demanda_id, orcado_externo, custo_terceirizados, custo_execucao_propria, custo_mo_propria, save") : Promise.resolve({ data: null }),
      ]);
      setDados(d);
      setAtivs((a.data as Atividade[]) ?? []);
      setImpedList(imp.data ?? []);
      if (u.data?.[0]) setUso({ bytes: Number(u.data[0].bytes), arquivos: Number(u.data[0].arquivos) });
      setCustos((c.data as Custo[] | null) ?? null);
      setAtualizadoEm(new Date());
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }
  useEffect(() => { carregar(); }, [eGestor]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(() => mudar({ q: busca }), 200); return () => clearTimeout(t); }, [busca]);

  const D = useMemo(() => (dados ? aplicarFiltros(dados.lista, f, dados.impedimentos) : []), [dados, f]);
  /** Recorte sem um dos filtros (para o gráfico daquele filtro mostrar todas as opções). */
  const semFiltro = (k: keyof Filtros) => (dados ? aplicarFiltros(dados.lista, { ...f, [k]: FILTROS_PADRAO[k] === "abertas" ? "todas" : FILTROS_PADRAO[k] }, dados.impedimentos) : []);

  if (erro) return <div className="pagina"><Aviso tipo="critico">{erro}</Aviso><button className="btn" onClick={carregar}>Tentar de novo</button></div>;
  if (!dados) return <Carregando />;

  const imp = dados.impedimentos;
  const at = D.filter(estaAtiva);
  const contr = at.filter((d) => d.forma_execucao === "contratada");
  const marc = (m: Marcador, base = D) => contar(base, (d) => temMarcador(d, m, imp));
  const porSit = (s: Situacao, base = D) => contar(base, (d) => d.situacao === s);
  const linkLista = (extra: Partial<Filtros> = {}) => `/demandas?${filtrosParaURL({ ...f, ...extra }).toString()}`;
  const sitSel = f.situacao === "todas" || f.situacao === "abertas" ? [] : f.situacao === "ativas" ? SITUACOES_ATIVAS : f.situacao.split(",");
  const alternarSit = (s: Situacao) => {
    const atual = new Set(sitSel);
    if (atual.has(s)) atual.delete(s); else atual.add(s);
    mudar({ situacao: atual.size ? [...atual].join(",") : "todas" });
  };
  const nomeResp = (id: string) => cadastros.pessoas.find((p) => String(p.id) === id)?.nome;
  const nomeLocal = (id: string) => cadastros.locais.find((l) => String(l.id) === id)?.nome;

  const recorte: string[] = [];
  if (f.resp) recorte.push(`Responsável: ${f.resp === "sem" ? "sem responsável" : nomeResp(f.resp)}`);
  if (f.local) recorte.push(`Local: ${nomeLocal(f.local)}`);
  if (sitSel.length) recorte.push(`Situação: ${sitSel.map((s) => SITUACOES[s as Situacao]).join(", ")}`);
  if (f.forma) recorte.push(FORMAS[f.forma as keyof typeof FORMAS]);
  if (f.etapa) recorte.push(`Etapa: ${ETAPAS[f.etapa as keyof typeof ETAPAS]}`);
  if (f.marcador) recorte.push(MARCADORES[f.marcador as Marcador].nome);
  if (f.doc) recorte.push(`MD ${f.doc.split("|")[0]} × ${f.doc.split("|")[1]}`);
  if (f.q) recorte.push(`Busca: “${f.q}”`);
  const temFiltro = recorte.length > 0;
  const limpar = () => { setBusca(""); setF({ ...FILTROS_PADRAO, situacao: "todas" }); };

  // ---------- KPIs ----------
  const conc = porSit("concluida"), pausa = porSit("suspensa") + porSit("cancelada");
  const semMD = marc("sem_md"), semRMS = marc("sem_rms"), parados = marc("sem_atualizacao"), venc = marc("atrasada");
  const KPIs: { l: string; v: number; foot: string; tipo?: "main" | "alert"; clique?: Partial<Filtros>; ajuda: string }[] = [
    { l: "Total de demandas", v: D.length, foot: `${contar(D, (d) => d.acomp_gerencial)} com acomp. gerencial`, tipo: "main", ajuda: "Todas as demandas do recorte, de qualquer situação." },
    { l: "Carteira ativa", v: at.length, foot: `${porSit("em_andamento")} em andamento · ${porSit("aguardando")} aguardando · ${porSit("nao_iniciada")} não iniciadas`, tipo: "main", clique: { situacao: "ativas" }, ajuda: "Em andamento, aguardando ou não iniciada. Suspensas ficam fora (pausadas)." },
    { l: "Concluídas", v: conc, foot: `${pct(conc, D.length - pausa)}% das não canceladas/suspensas`, clique: { situacao: "concluida" }, ajuda: "Situação Concluída. O percentual é concluídas ÷ (total − suspensas − canceladas)." },
    { l: "Suspensas / canceladas", v: pausa, foot: `${pct(pausa, D.length)}% do total`, clique: { situacao: "suspensa,cancelada" }, ajuda: "Situação Suspensa ou Cancelada." },
    { l: "Contratadas sem MD", v: semMD, foot: `${pct(semMD, contr.length)}% das contratadas ativas`, tipo: semMD ? "alert" : undefined, clique: { marcador: "sem_md" }, ajuda: MARCADORES.sem_md.criterio },
    { l: "Contratadas sem RMS", v: semRMS, foot: `${pct(semRMS, contr.length)}% das contratadas ativas`, tipo: semRMS ? "alert" : undefined, clique: { marcador: "sem_rms" }, ajuda: MARCADORES.sem_rms.criterio },
    { l: `Paradas +${LIMITES.diasSemAtualizacao} dias`, v: parados, foot: `${contar(at, (d) => diasParado(d) === null)} delas sem nenhum registro datado`, tipo: parados ? "alert" : undefined, clique: { marcador: "sem_atualizacao" }, ajuda: MARCADORES.sem_atualizacao.criterio },
    { l: "Prazo vencido", v: venc, foot: `${contar(at, (d) => !!d.prazo_conclusao)} ativas têm prazo definido`, tipo: venc ? "alert" : undefined, clique: { marcador: "atrasada" }, ajuda: MARCADORES.atrasada.criterio },
  ];
  const OUTROS: Marcador[] = ["impedimento", "etapa_vencida", "vencendo", "aprovacao", "sem_avaliacao", "acomp"];

  // ---------- Pontos de ação ----------
  const top = (arr: DemandaLinha[], fn: (d: DemandaLinha) => string | null) => {
    const m: Record<string, number> = {};
    arr.forEach((d) => { const k = fn(d); if (k) m[k] = (m[k] ?? 0) + 1; });
    const k = Object.keys(m).sort((a, b) => m[b] - m[a])[0];
    return k ? { k, n: m[k] } : null;
  };
  const pontos: PontoAuto[] = [];
  const parList = at.filter((d) => temMarcador(d, "sem_atualizacao", imp));
  if (parList.length) {
    const t = top(parList, (d) => d.responsavel_nome), sem = contar(parList, (d) => diasParado(d) === null);
    pontos.push({ id: "parado", critico: true, peso: 3 + parList.length / Math.max(at.length, 1), titulo: "Carteira sem movimentação", link: linkLista({ marcador: "sem_atualizacao" }),
      diagnostico: `${parList.length} de ${at.length} demandas ativas (${pct(parList.length, at.length)}%) estão há mais de ${LIMITES.diasSemAtualizacao} dias sem registro no histórico${sem ? `, sendo ${sem} sem nenhum registro datado` : ""}.`,
      acao: `Revisão semanal com ${t ? `${t.k} (${t.n} paradas)` : "os responsáveis"}: registrar o andamento ou encerrar o que não vai andar.` });
  }
  const vencList = at.filter((d) => temMarcador(d, "atrasada", imp));
  if (vencList.length) {
    const pior = vencList.reduce((a, b) => (diasAte(b.prazo_conclusao)! < diasAte(a.prazo_conclusao)! ? b : a));
    pontos.push({ id: "vencido", critico: true, peso: 3 + vencList.length / 5, titulo: "Prazos de conclusão vencidos", link: linkLista({ marcador: "atrasada" }),
      diagnostico: `${vencList.length} demanda${vencList.length > 1 ? "s ativas passaram" : " ativa passou"} do prazo de conclusão; a mais atrasada é “${pior.assunto}” (${-diasAte(pior.prazo_conclusao)!} dias).`,
      acao: "Replanejar a data com o responsável e registrar a nova previsão na demanda." });
  }
  const nImp = marc("impedimento");
  if (nImp) pontos.push({ id: "impedimento", critico: true, peso: 2.9 + nImp / 5, titulo: "Impedimentos registrados", link: linkLista({ marcador: "impedimento", situacao: "todas" }),
    diagnostico: `${nImp} demanda${nImp > 1 ? "s têm" : " tem"} impedimento aberto (atividade marcada como impedimento ou ocorrência em RDO dos últimos 30 dias).`,
    acao: "Tratar os impedimentos na reunião de acompanhamento e escalar o que depende de outras áreas." });
  if (semMD || semRMS) {
    const ambos = marc("sem_md_rms"), acompDoc = contar(contr, (d) => d.acomp_gerencial && (temMarcador(d, "sem_md", imp) || temMarcador(d, "sem_rms", imp)));
    pontos.push({ id: "doc", critico: false, peso: 2.8 + (semMD + semRMS) / Math.max(contr.length, 1), titulo: "Gargalo documental", link: linkLista({ marcador: semMD >= semRMS ? "sem_md" : "sem_rms" }),
      diagnostico: `${semMD} contratadas ativas sem MD emitido e ${semRMS} sem RMS (${ambos} sem nenhum dos dois). Sem MD não há cotação; sem RMS não há compra.`,
      acao: `Montar a fila de emissão de MD com prazo por demanda${acompDoc ? `, começando pelas ${acompDoc} com acompanhamento gerencial` : ""}.` });
  }
  const nAprov = marc("aprovacao");
  if (nAprov) pontos.push({ id: "aprov", critico: false, peso: 2.5 + nAprov / 4, titulo: "Decisões aguardando aprovação", link: linkLista({ marcador: "aprovacao" }),
    diagnostico: `${nAprov} demanda${nAprov > 1 ? "s estão" : " está"} na etapa Aprovação.`, acao: "Reservar uma janela fixa de aprovação e liberar esses itens na semana." });
  const nEtapa = marc("etapa_vencida");
  if (nEtapa) pontos.push({ id: "etapa", critico: false, peso: 2.4 + nEtapa / 5, titulo: "Próximas etapas vencidas", link: linkLista({ marcador: "etapa_vencida" }),
    diagnostico: `${nEtapa} demanda${nEtapa > 1 ? "s têm" : " tem"} o prazo da próxima etapa vencido.`, acao: "Cobrar quem está com a etapa ou ajustar o prazo com justificativa no histórico." });
  const tr = top(at, (d) => d.responsavel_nome);
  if (tr && at.length >= 6 && tr.n / at.length >= 0.5) {
    const idResp = cadastros.pessoas.find((p) => p.nome === tr.k)?.id;
    pontos.push({ id: "concentracao", critico: false, peso: 2 + tr.n / at.length, titulo: "Concentração de carteira", link: idResp ? linkLista({ resp: String(idResp), situacao: "ativas" }) : undefined,
      diagnostico: `${tr.k} responde por ${tr.n} das ${at.length} demandas ativas (${pct(tr.n, at.length)}%).`,
      acao: "Redistribuir ou dar apoio de projetista/fiscal para reduzir o risco de fila em uma pessoa." });
  }
  const agu = porSit("aguardando"), exe = porSit("em_andamento");
  if (agu > exe && agu >= 5) {
    const motivo = top(at.filter((d) => d.situacao === "aguardando"), (d) => d.aguardando_o_que);
    pontos.push({ id: "fila", critico: false, peso: 1.5, titulo: "Fila maior que a execução", link: linkLista({ situacao: "aguardando" }),
      diagnostico: `${agu} demandas aguardando contra ${exe} em andamento${motivo ? `; o motivo mais citado é “${motivo.k}” (${motivo.n})` : ""}.`,
      acao: "Separar o que aguarda suprimentos, aprovação ou definição e atacar a causa mais frequente." });
  }
  const nAval = marc("sem_avaliacao");
  if (nAval) pontos.push({ id: "avaliacao", critico: false, peso: 1.2, titulo: "Demandas fora do ranking", link: linkLista({ marcador: "sem_avaliacao", situacao: "abertas" }),
    diagnostico: `${nAval} demanda${nAval > 1 ? "s abertas estão" : " aberta está"} sem avaliação de prioridade (P × S) e por isso fora do ranking.`,
    acao: "Avaliar probabilidade e severidade dessas demandas na próxima reunião da equipe." });
  pontos.sort((a, b) => Number(b.critico) - Number(a.critico) || b.peso - a.peso);

  // ---------- Tendência ----------
  const hoje = new Date();
  const meses = Array.from({ length: 12 }, (_, i) => { const d = new Date(hoje.getFullYear(), hoje.getMonth() - 11 + i, 1); return d.getFullYear() * 12 + d.getMonth(); });
  const mesDe = (iso: string | null) => (iso ? Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1 : null);
  const entrada = (d: DemandaLinha) => mesDe(d.recebida_em ?? d.primeira_atualizacao);
  const conclusao = (d: DemandaLinha) => (d.situacao === "concluida" ? mesDe(d.concluida_em) : null);
  const semDataEntrada = contar(D, (d) => entrada(d) === null);
  let saldo = contar(D, (d) => (entrada(d) ?? Infinity) < meses[0]) - contar(D, (d) => (conclusao(d) ?? Infinity) < meses[0]);
  const tendencia: PontoMes[] = meses.map((k) => {
    const e = contar(D, (d) => entrada(d) === k), c = contar(D, (d) => conclusao(d) === k);
    saldo += e - c;
    return { rotulo: `${MES[k % 12]}/${String(Math.floor(k / 12)).slice(2)}`, entradas: e, conclusoes: c, saldo };
  });

  // ---------- Tempo sem movimentação ----------
  const FAIXAS: [string, (n: number | null) => boolean][] = [
    ["Até 15 dias", (n) => n !== null && n <= 15], ["16 a 30 dias", (n) => n !== null && n > 15 && n <= 30],
    ["31 a 60 dias", (n) => n !== null && n > 30 && n <= 60], ["61 a 90 dias", (n) => n !== null && n > 60 && n <= 90],
    ["Mais de 90 dias", (n) => n !== null && n > 90], ["Sem registro no histórico", (n) => n === null],
  ];
  const diasLista = at.map(diasParado).filter((n): n is number => n !== null).sort((a, b) => a - b);
  const mediana = diasLista.length ? diasLista[Math.floor(diasLista.length / 2)] : null;

  // ---------- Detalhamento ----------
  const segsSit = (arr: DemandaLinha[]) => [
    { v: contar(arr, (d) => d.situacao === "em_andamento"), cor: COR.andamento, nome: "Em andamento" },
    { v: contar(arr, (d) => d.situacao === "aguardando"), cor: COR.aguardando, nome: "Aguardando" },
    { v: contar(arr, (d) => d.situacao === "nao_iniciada"), cor: COR.nao_iniciada, nome: "Não iniciada" },
  ];
  const baseResp = semFiltro("resp");
  const porResp: ItemBarra[] = [...cadastros.pessoas.map((p) => ({ id: String(p.id), nome: p.nome })), { id: "sem", nome: "Sem responsável" }]
    .map((p) => {
      const lst = baseResp.filter((d) => (p.id === "sem" ? !d.responsavel_id : String(d.responsavel_id) === p.id));
      const ativas = lst.filter(estaAtiva);
      return { chave: p.id, nome: p.nome, segs: segsSit(ativas), ativo: f.resp === p.id, sufixo: <span className="sutil"> ({contar(lst, (d) => d.situacao === "concluida")})</span>, _n: ativas.length + lst.length };
    })
    .filter((x) => x._n > 0)
    .sort((a, b) => b.segs.reduce((s, x) => s + x.v, 0) - a.segs.reduce((s, x) => s + x.v, 0));
  const baseLocal = semFiltro("local").filter(estaAtiva);
  const locaisAtivos = cadastros.locais.map((l) => ({ l, lst: baseLocal.filter((d) => d.local_id === l.id) })).filter((x) => x.lst.length).sort((a, b) => b.lst.length - a.lst.length);
  const porLocal: ItemBarra[] = locaisAtivos.slice(0, 12).map(({ l, lst }) => ({ chave: String(l.id), nome: l.nome, segs: segsSit(lst), ativo: f.local === String(l.id) }));
  const LINHAS_MD = ["Emitido", "Em elaboração", "Não informado", "Não necessário"] as const;
  const COLS_RMS = ["Com RMS", "Sem RMS"] as const;
  const celula = (md: string, rms: string) => contar(contr, (d) => grupoMD(d) === md && grupoRMS(d) === rms);
  const maxCel = Math.max(1, ...LINHAS_MD.flatMap((md) => COLS_RMS.map((r) => celula(md, r))));
  const etapasOrdem = FLUXO.contratada.filter((e) => e !== "concluida");
  const porEtapa: ItemBarra[] = etapasOrdem.map((e) => {
    const lst = at.filter((d) => d.etapa === e), v = contar(lst, (d) => temMarcador(d, "etapa_vencida", imp));
    return { chave: e, nome: ETAPAS[e], ativo: f.etapa === e, segs: [{ v: lst.length - v, cor: COR.aguardando, nome: "No prazo / sem prazo" }, { v, cor: COR.alerta, nome: "Prazo da etapa vencido" }],
      sufixo: v ? <span className="badge badge-alerta">▲ {v} vencida{v > 1 ? "s" : ""}</span> : undefined };
  }).filter((x) => x.segs[0].v + x.segs[1].v > 0);
  const motivos: Record<string, number> = {};
  at.filter((d) => d.situacao === "aguardando").forEach((d) => { const k = d.aguardando_o_que?.trim() || "(não informado)"; motivos[k] = (motivos[k] ?? 0) + 1; });
  const topMotivos = Object.entries(motivos).sort((a, b) => b[1] - a[1]).slice(0, 6);

  // ---------- Financeiro (Gestor) ----------
  const idsD = new Set(D.map((d) => d.id));
  const cD = (custos ?? []).filter((c) => idsD.has(c.demanda_id));
  const soma = (k: keyof Custo) => { const v = cD.filter((c) => c[k] !== null); return { s: v.reduce((t, c) => t + Number(c[k]), 0), n: v.length }; };

  const topo10 = D.filter((d) => d.ranking && estaAberta(d.situacao)).sort((a, b) => a.ranking! - b.ranking!).slice(0, 10);
  const impNoRecorte = impedList.filter((i) => idsD.has(i.demanda_id));
  const demanda = (id: number) => dados.lista.find((d) => d.id === id);

  return (
    <div className="painel">
      <div className="painel-topo">
        <div>
          <h1>Painel de Engenharia · Infraestrutura</h1>
          <p className="sutil pequeno">Dados ao vivo do sistema{atualizadoEm && ` · atualizado às ${atualizadoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}</p>
        </div>
        <button className="btn" onClick={carregar}>Atualizar</button>
      </div>

      <div className="painel-filtros">
        <div className="painel-filtros-linha">
          <label className="fld"><span>Responsável</span>
            <select value={f.resp} onChange={(e) => mudar({ resp: e.target.value })}>
              <option value="">Todos</option><option value="sem">Sem responsável</option>
              {cadastros.pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select></label>
          <label className="fld"><span>Local</span>
            <select value={f.local} onChange={(e) => mudar({ local: e.target.value })}>
              <option value="">Todos</option>
              {cadastros.locais.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select></label>
          <label className="fld"><span>Execução</span>
            <select value={f.forma} onChange={(e) => mudar({ forma: e.target.value })}>
              <option value="">Interna e contratada</option>
              {Object.entries(FORMAS).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
            </select></label>
          <label className="fld"><span>Atenção</span>
            <select value={f.marcador} onChange={(e) => mudar({ marcador: e.target.value })}>
              <option value="">Todas</option>
              {Object.entries(MARCADORES).map(([k, v]) => <option key={k} value={k}>{v.nome}</option>)}
            </select></label>
          <label className="fld fld-busca"><span>Busca</span>
            <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Assunto, MD, RMS, OS…" /></label>
        </div>
        <div className="painel-filtros-linha">
          <div className="fld"><span>Situação</span>
            <div className="chips">
              {(Object.keys(SITUACOES) as Situacao[]).map((s) => (
                <button key={s} type="button" className="btn-chip" aria-pressed={sitSel.includes(s)} data-ativo={sitSel.includes(s)} onClick={() => alternarSit(s)}>{SITUACOES[s]}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="recorte pequeno">
          <span>{temFiltro ? `Recorte ativo — ${recorte.join(" · ")}` : "Sem filtros: carteira completa"}</span>
          <Link to={linkLista()} className="pequeno">Ver {D.length} demanda{D.length === 1 ? "" : "s"} na lista →</Link>
          {temFiltro && <button className="btn-link pequeno" onClick={limpar}>Limpar filtros</button>}
        </div>
      </div>

      <div className="faixa">Visão geral</div>
      <section className="kpis">
        {KPIs.map((k) => (
          <div key={k.l} className={`kpi${k.tipo ? ` kpi-${k.tipo}` : ""}${k.clique ? " kpi-clicavel" : ""}`}
            role={k.clique ? "button" : undefined} tabIndex={k.clique ? 0 : undefined}
            onClick={() => k.clique && mudar(k.clique)}
            onKeyDown={(e) => { if (k.clique && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); mudar(k.clique); } }}
            title={k.clique ? "Clique para filtrar o painel" : undefined}>
            <span className="kpi-lbl">{k.tipo === "alert" && <span aria-hidden>▲ </span>}{k.l} <Ajuda>{k.ajuda}</Ajuda></span>
            <span className="kpi-val">{k.v}</span>
            <span className="kpi-foot">{k.foot}</span>
          </div>
        ))}
      </section>
      <div className="chips-alerta">
        {OUTROS.map((m) => {
          const n = marc(m);
          return (
            <button key={m} type="button" className={`chip-alerta${n && ["impedimento", "etapa_vencida"].includes(m) ? " critico" : ""}${f.marcador === m ? " ativo" : ""}`} onClick={() => mudar({ marcador: f.marcador === m ? "" : m })} title={MARCADORES[m].criterio}>
              <strong>{n}</strong> {MARCADORES[m].nome}
            </button>
          );
        })}
      </div>

      <section className="cartao">
        <h2>Composição da carteira por situação</h2>
        <p className="sutil pequeno">{D.length} demandas · clique numa linha para filtrar</p>
        <div className="composicao">
          {GRUPOS.map(([nome, sits]) => {
            const tot = sits.reduce((s, x) => s + porSit(x), 0);
            const max = Math.max(1, ...(Object.keys(SITUACOES) as Situacao[]).map((s) => porSit(s)));
            return (
              <div key={nome} className="fase">
                <div className="fase-topo"><span>{nome}</span><b>{tot}</b><span className="sutil">{pct(tot, D.length)}%</span></div>
                {sits.map((s) => {
                  const n = porSit(s);
                  return (
                    <button key={s} type="button" className={`fase-linha${sitSel.length === 1 && sitSel[0] === s ? " ativa" : ""}${n ? "" : " zero"}`} title={DICA_SITUACAO[s]}
                      onClick={() => mudar({ situacao: sitSel.length === 1 && sitSel[0] === s ? "todas" : s })}>
                      <span>{SITUACOES[s]}</span>
                      <span className="barra-trilho"><span className="barra" style={{ width: `${(n / max) * 100}%` }} /></span>
                      <b>{n}</b><span className="sutil">{pct(n, D.length)}%</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </section>

      <div className="faixa">Pontos de ação</div>
      <PontosAcao pontos={pontos} />

      <div className="faixa">Tendência</div>
      <div className="grade-2-1">
        <section className="cartao">
          <h2>Entradas × conclusões por mês <Ajuda>Entrada = mês de recebimento (ou do primeiro registro no histórico). Conclusão = mês da data de conclusão. Saldo acumulado = entradas − conclusões desde o início.</Ajuda></h2>
          <p className="sutil pequeno">Últimos 12 meses{semDataEntrada ? ` · ${semDataEntrada} demanda(s) do recorte sem data de entrada não entram no gráfico` : ""}</p>
          <GraficoTendencia dados={tendencia} />
          <Legenda itens={[{ nome: "Entradas", cor: "var(--serie-2)" }, { nome: "Conclusões", cor: "var(--serie-1)" }, { nome: "Saldo acumulado (linha)", cor: "transparent" }]} />
          <details className="dados pequeno"><summary>Ver dados em tabela</summary>
            <div className="rolagem-x"><table className="tabela compacta"><thead><tr><th>Mês</th><th>Entradas</th><th>Conclusões</th><th>Saldo acumulado</th></tr></thead>
              <tbody>{tendencia.map((t) => <tr key={t.rotulo}><td>{t.rotulo}</td><td>{t.entradas}</td><td>{t.conclusoes}</td><td>{t.saldo}</td></tr>)}</tbody></table></div>
          </details>
        </section>
        <section className="cartao">
          <h2>Tempo sem movimentação · carteira ativa <Ajuda>Dias desde o último registro datado no histórico. Acima de {LIMITES.diasSemAtualizacao} dias é alerta.</Ajuda></h2>
          <p className="sutil pequeno">{at.length} ativas{mediana !== null ? ` · mediana de ${mediana} dias desde o último registro` : ""}</p>
          <BarrasEmpilhadas
            itens={FAIXAS.map(([nome, fn], i) => ({ chave: String(i), nome, segs: [{ v: contar(at, (d) => fn(diasParado(d))), cor: i >= 2 ? COR.alerta : COR.aguardando, nome }] }))}
            aoClicar={(k) => Number(k) >= 2 && mudar({ marcador: f.marcador === "sem_atualizacao" ? "" : "sem_atualizacao" })} />
          <p className="sutil pequeno">Clique numa faixa em vermelho para ver as paradas.</p>
        </section>
      </div>

      <div className="faixa">Detalhamento</div>
      <div className="grade-painel3">
        <section className="cartao">
          <h2>Carteira ativa por responsável</h2>
          <p className="sutil pequeno">Clique para filtrar · concluídas entre parênteses</p>
          <BarrasEmpilhadas itens={porResp} aoClicar={(k) => mudar({ resp: f.resp === k ? "" : k })} />
          <Legenda itens={[{ nome: "Em andamento", cor: COR.andamento }, { nome: "Aguardando", cor: COR.aguardando }, { nome: "Não iniciada", cor: COR.nao_iniciada }]} />
        </section>
        <section className="cartao">
          <h2>Carteira ativa por local</h2>
          <p className="sutil pequeno">Clique para filtrar</p>
          <BarrasEmpilhadas itens={porLocal} aoClicar={(k) => mudar({ local: f.local === k ? "" : k })} />
          {locaisAtivos.length > 12 && <p className="sutil pequeno">+{locaisAtivos.length - 12} locais com menos demandas — use o filtro “Local”.</p>}
        </section>
        <section className="cartao">
          <h2>Prontidão documental · contratadas ativas <Ajuda>Situação do Memorial Descritivo (linhas) × existência de RMS válida (colunas), só para serviços contratados ativos.</Ajuda></h2>
          <p className="sutil pequeno">{contr.length} contratadas ativas · clique numa célula para filtrar</p>
          <div className="rolagem-x">
            <table className="matriz">
              <thead><tr><th>MD ↓ / RMS →</th>{COLS_RMS.map((c) => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>
                {LINHAS_MD.map((md) => (
                  <tr key={md}><th>{md}</th>
                    {COLS_RMS.map((r) => {
                      const n = celula(md, r), chave = `${md}|${r}`;
                      const lacuna = md === "Em elaboração" || md === "Não informado" || r === "Sem RMS";
                      const forte = n / maxCel > 0.55;
                      return (
                        <td key={r}>
                          <button type="button" disabled={!n} className={`celula${n && lacuna ? " lacuna" : ""}${f.doc === chave ? " ativa" : ""}`}
                            style={{ background: n ? `color-mix(in srgb, var(--serie-1) ${Math.round((0.12 + 0.6 * n / maxCel) * 100)}%, transparent)` : undefined, color: forte ? "var(--trl-branco)" : undefined }}
                            onClick={() => mudar({ doc: f.doc === chave ? "" : chave })} title={`MD ${md} × ${r}`}>{n}</button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="sutil pequeno">Contorno vermelho: demanda sem MD emitido e/ou sem RMS.</p>
        </section>
      </div>

      <div className="grade-2-1">
        <section className="cartao">
          <h2>Onde está cada demanda ativa <Ajuda>Etapa atual das demandas ativas. Em vermelho, as que estão com o prazo da próxima etapa vencido.</Ajuda></h2>
          <p className="sutil pequeno">Por etapa · clique para filtrar</p>
          <BarrasEmpilhadas itens={porEtapa} aoClicar={(k) => mudar({ etapa: f.etapa === k ? "" : k })} />
          {topMotivos.length > 0 && (
            <>
              <h3 className="sub-titulo">O que as demandas estão aguardando</h3>
              <ul className="lista-simples pequeno">
                {topMotivos.map(([k, n]) => <li key={k}><strong>{n}</strong> · {k}</li>)}
              </ul>
            </>
          )}
        </section>
        {eGestor && custos ? (
          <section className="cartao">
            <h2>Financeiro informado <span className="badge">só Gestor</span></h2>
            <p className="sutil pequeno">Soma das demandas do recorte com valor informado · Save = orçado externo − custo realizado total</p>
            <div className="financeiro">
              {([["Orçado externo", "orcado_externo"], ["Realizado com terceiros", "custo_terceirizados"], ["Execução própria", "custo_execucao_propria"], ["Mão de obra própria", "custo_mo_propria"], ["Save (economia)", "save"]] as [string, keyof Custo][]).map(([n, k]) => {
                const x = soma(k);
                return <div key={k}><span className="sutil pequeno">{n}</span><strong>{fmtMoeda(x.s)}</strong><span className="sutil pequeno">{x.n} demanda(s) com valor</span></div>;
              })}
            </div>
          </section>
        ) : (
          <section className="cartao">
            <h2>Prioridades — top 10</h2>
            <Ranking lista={topo10} />
          </section>
        )}
      </div>

      <div className="faixa">Acompanhamento</div>
      <div className="grade-painel3">
        {eGestor && custos && (
          <section className="cartao">
            <h2>Prioridades — top 10 <Ajuda>Ranking das demandas abertas avaliadas pela matriz Probabilidade × Severidade.</Ajuda></h2>
            <Ranking lista={topo10} />
            <Link to={linkLista({ situacao: "abertas" })} className="pequeno">Ver todas por prioridade →</Link>
          </section>
        )}
        <section className="cartao">
          <h2>Atividades vencidas e dos próximos {LIMITES.diasVencendo} dias <Ajuda>Atividades, pendências e entregas em aberto com prazo até {LIMITES.diasVencendo} dias à frente (inclui as vencidas). Não segue os filtros acima.</Ajuda></h2>
          {ativs.length === 0 ? <p className="sutil">Nada vencendo.</p> : <ListaItens itens={ativs} mostrarDemanda aoMudar={carregar} podeEditar={false} aoEditar={() => null} />}
          <Link to="/atividades" className="pequeno">Ver todas as atividades →</Link>
        </section>
        <section className="cartao">
          <h2>Impedimentos <Ajuda>{MARCADORES.impedimento.criterio}</Ajuda></h2>
          {impNoRecorte.length === 0 ? <p className="sutil">Nenhum impedimento no recorte.</p> : (
            <ul className="lista-simples">
              {impNoRecorte.slice(0, 12).map((i, k) => (
                <li key={k}>
                  <span className="texto-critico">▲</span> {i.descricao}{i.detalhe && `: ${i.detalhe}`}
                  <div className="pequeno"><Link to={`/demandas/${i.demanda_id}?aba=${i.origem === "rdo" ? "rdo" : "atividades"}`}>{demanda(i.demanda_id)?.codigo} · {demanda(i.demanda_id)?.assunto}</Link> <span className="sutil">({i.origem === "rdo" ? "RDO" : "atividade"})</span></div>
                </li>
              ))}
            </ul>
          )}
        </section>
        {uso && (
          <section className="cartao">
            <h2>Armazenamento de arquivos <Ajuda>O plano gratuito permite 1 GB de arquivos. Fotos são reduzidas no envio. Acima de 80%, avalie arquivar ou migrar.</Ajuda></h2>
            <div className="barra-trilho grande"><span className={`barra${uso.bytes / LIMITES.armazenamentoBytes > 0.8 ? " barra-critico" : ""}`} style={{ width: `${Math.min(100, (uso.bytes / LIMITES.armazenamentoBytes) * 100)}%` }} /></div>
            <p className="pequeno">{fmtBytes(uso.bytes)} de 1 GB · {uso.arquivos} arquivo(s)</p>
          </section>
        )}
      </div>
    </div>
  );
}

function Ranking({ lista }: { lista: DemandaLinha[] }) {
  if (!lista.length) return <p className="sutil">Nenhuma demanda avaliada no recorte. Avalie a prioridade nas demandas abertas.</p>;
  return (
    <ol className="ranking">
      {lista.map((d) => (
        <li key={d.id}>
          <BadgeClasse c={d.classe} ranking={d.ranking} />
          <Link to={`/demandas/${d.id}`}>{d.assunto}</Link>
          <span className="sutil pequeno">{SITUACOES[d.situacao]} · {d.responsavel_nome ?? "sem responsável"}</span>
        </li>
      ))}
    </ol>
  );
}

