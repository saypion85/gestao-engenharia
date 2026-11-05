import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase, mensagemErro } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { ETAPAS, diasAte, fmtData, hojeISO } from "../lib/dominio";
import type { DemandaLinha } from "../lib/filtros";
import { montarAta, motivosDaDemanda, pesoPauta, type Acao, type DecisaoRegistro, type ItemPauta, type Reuniao } from "../lib/reunioes";
import { carregarDemandas } from "./Demandas";
import { CAMPOS_DECISAO, aberta, vencida } from "./Reunioes";
import { Ajuda, Aviso, BadgeClasse, BadgeSituacao, Carregando, notificar } from "../components/ui";
import { DecisaoInfo, ResolverDecisao, type Registro } from "../components/demanda/HistoricoAba";

type Decisao = DecisaoRegistro & Registro;
type Andamento = { id: number; demanda_id: number; data: string; texto: string; autor_nome: string | null; tipo: string };

/** Campo de texto que salva sozinho ao sair (ou 1 s depois de parar de digitar). */
function TextoAuto({ valor, salvar, desativado, ...props }: { valor: string | null; salvar: (v: string) => Promise<void>; desativado?: boolean; placeholder?: string; rows?: number; "aria-label": string }) {
  const [v, setV] = useState(valor ?? "");
  const [estado, setEstado] = useState<"" | "salvando" | "salvo">("");
  const t = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ultimo = useRef(valor ?? "");
  const gravar = async (x: string) => {
    if (x === ultimo.current) return;
    setEstado("salvando");
    try { await salvar(x); ultimo.current = x; setEstado("salvo"); } catch (e) { notificar(mensagemErro(e), "erro"); setEstado(""); }
  };
  return (
    <div className="texto-auto">
      <textarea {...props} value={v} disabled={desativado}
        onChange={(e) => { setV(e.target.value); clearTimeout(t.current); const x = e.target.value; t.current = setTimeout(() => gravar(x), 1000); }}
        onBlur={() => { clearTimeout(t.current); gravar(v); }} />
      {estado && <span className="sutil pequeno estado-salvo">{estado === "salvando" ? "salvando…" : "✓ salvo"}</span>}
    </div>
  );
}

/** Inclusão rápida no cartão: decisão tomada, decisão a tomar ou ação. */
function Adicionar({ demandaId, reuniao, aoMudar }: { demandaId: number | null; reuniao: Reuniao; aoMudar: () => void }) {
  const { cadastros } = useAuth();
  const [modo, setModo] = useState<"" | "tomada" | "pendente" | "acao">("");
  const [texto, setTexto] = useState("");
  const [quem, setQuem] = useState("");
  const [prazo, setPrazo] = useState("");
  const [resp, setResp] = useState("");
  const limpar = () => { setModo(""); setTexto(""); setQuem(""); setPrazo(""); setResp(""); };

  async function salvar() {
    if (!texto.trim()) return;
    let error;
    if (modo === "acao") {
      ({ error } = await supabase.from("atividades").insert({ demanda_id: demandaId, reuniao_id: reuniao.id, tipo: "acao", titulo: texto.trim(), responsavel_id: resp ? Number(resp) : null, prazo: prazo || null }));
    } else {
      ({ error } = await supabase.from("historico").insert({
        demanda_id: demandaId, data: reuniao.data > hojeISO() ? hojeISO() : reuniao.data, texto: texto.trim(), tipo: "decisao", reuniao_id: reuniao.id,
        decisao_status: modo, decisao_responsavel: modo === "pendente" ? quem || null : null, decisao_prazo: modo === "pendente" ? prazo || null : null,
      }));
    }
    if (error) return notificar(mensagemErro(error), "erro");
    notificar(modo === "acao" ? "Ação incluída no plano de ação." : modo === "tomada" ? "Decisão registrada." : "Decisão a tomar registrada.");
    limpar();
    aoMudar();
  }

  if (!modo) {
    return (
      <div className="adicionar-botoes">
        <button className="btn-chip" onClick={() => setModo("acao")}>+ Ação</button>
        {demandaId && <button className="btn-chip" onClick={() => setModo("tomada")}>+ Decisão tomada</button>}
        {demandaId && <button className="btn-chip" onClick={() => setModo("pendente")}>+ Decisão a tomar</button>}
      </div>
    );
  }
  return (
    <div className="adicionar-form">
      <input value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus aria-label={modo === "acao" ? "Descrição da ação" : "Texto da decisão"}
        placeholder={modo === "acao" ? "O que precisa ser feito?" : modo === "tomada" ? "O que foi decidido?" : "O que precisa ser decidido?"} />
      {modo === "acao" && (
        <>
          <select value={resp} onChange={(e) => setResp(e.target.value)} aria-label="Responsável pela ação">
            <option value="">Responsável…</option>
            {cadastros.pessoas.filter((p) => p.ativo !== false).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
          <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} aria-label="Prazo da ação" />
        </>
      )}
      {modo === "pendente" && (
        <>
          <input value={quem} onChange={(e) => setQuem(e.target.value)} placeholder="Quem decide?" aria-label="Quem decide" />
          <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} aria-label="Decidir até" />
        </>
      )}
      <button className="btn" onClick={limpar}>Cancelar</button>
      <button className="btn btn-primario" disabled={!texto.trim()} onClick={salvar}>Incluir</button>
    </div>
  );
}

export default function ReuniaoPagina() {
  const { id } = useParams();
  const rid = Number(id);
  const nav = useNavigate();
  const { cadastros, podeEditar, eGestor, perfil } = useAuth();
  const [r, setR] = useState<Reuniao | null>(null);
  const [itens, setItens] = useState<ItemPauta[]>([]);
  const [demandas, setDemandas] = useState<DemandaLinha[]>([]);
  const [imped, setImped] = useState<Set<number>>(new Set());
  const [decisoes, setDecisoes] = useState<Decisao[]>([]);
  const [acoes, setAcoes] = useState<Acao[]>([]);
  const [abertasDem, setAbertasDem] = useState<Acao[]>([]);
  const [andamentos, setAndamentos] = useState<Andamento[]>([]);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [verTodasSug, setVerTodasSug] = useState(false);
  const [encerrando, setEncerrando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const [a, b, d, dc, ac] = await Promise.all([
        supabase.from("reunioes").select("*").eq("id", rid).maybeSingle(),
        supabase.from("reuniao_itens").select("*").eq("reuniao_id", rid).order("ordem").order("id"),
        carregarDemandas(),
        supabase.from("historico").select(CAMPOS_DECISAO).eq("tipo", "decisao"),
        supabase.from("atividades").select("*").eq("tipo", "acao"),
      ]);
      if (a.error || !a.data) throw a.error ?? new Error("Reunião não encontrada.");
      const its = (b.data ?? []) as ItemPauta[];
      setR(a.data as Reuniao);
      setItens(its);
      setDemandas(d.lista);
      setImped(d.impedimentos);
      setDecisoes((dc.data ?? []) as unknown as Decisao[]);
      setAcoes((ac.data ?? []) as Acao[]);
      const ids = its.map((i) => i.demanda_id);
      if (ids.length) {
        const [at, hs] = await Promise.all([
          supabase.from("atividades").select("*").in("demanda_id", ids).in("situacao", ["a_fazer", "em_andamento"]).order("prazo", { nullsFirst: false }),
          supabase.from("historico").select("id, demanda_id, data, texto, autor_nome, tipo").in("demanda_id", ids).eq("tipo", "atualizacao").order("data", { ascending: false }).order("criado_em", { ascending: false }).limit(400),
        ]);
        setAbertasDem((at.data ?? []) as Acao[]);
        setAndamentos((hs.data ?? []) as Andamento[]);
      } else { setAbertasDem([]); setAndamentos([]); }
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }, [rid]);
  useEffect(() => { carregar(); }, [carregar]);

  const pendDem = useMemo(() => new Set(decisoes.filter((x) => x.decisao_status === "pendente").map((x) => x.demanda_id)), [decisoes]);
  const naPauta = useMemo(() => new Set(itens.map((i) => i.demanda_id)), [itens]);
  const sugestoes = useMemo(() => demandas
    .filter((d) => !naPauta.has(d.id))
    .map((d) => ({ d, motivos: motivosDaDemanda(d, imped, pendDem) }))
    .filter((x) => x.motivos.length)
    .sort((a, b) => pesoPauta(b.d, b.motivos) - pesoPauta(a.d, a.motivos)), [demandas, naPauta, imped, pendDem]);

  if (erro) return <div className="pagina"><Aviso tipo="critico">{erro}</Aviso><Link to="/reunioes">← Reuniões</Link></div>;
  if (!r) return <Carregando />;

  const editavel = podeEditar && r.status === "planejada";
  const dem = (x: number | null) => demandas.find((d) => d.id === x);
  const pessoa = (x: number | null) => cadastros.pessoas.find((p) => p.id === x)?.nome;
  const acoesAnteriores = acoes.filter((a) => a.reuniao_id !== rid && aberta(a));
  const decVencidas = decisoes.filter((x) => x.decisao_status === "pendente" && vencida(x.decisao_prazo) && !naPauta.has(x.demanda_id));
  const discutidos = itens.filter((i) => i.discutido).length;
  const decHoje = decisoes.filter((x) => x.reuniao_id === rid);
  const acoesHoje = acoes.filter((a) => a.reuniao_id === rid);

  async function atualizar(campos: Partial<Reuniao>) {
    const { error } = await supabase.from("reunioes").update(campos).eq("id", rid);
    if (error) throw error;
    setR((x) => ({ ...x!, ...campos }));
  }
  async function incluir(demandaIds: number[]) {
    const base = itens.length ? Math.max(...itens.map((i) => i.ordem)) + 1 : 0;
    const novos = demandaIds.filter((x) => !naPauta.has(x)).map((x, k) => ({ reuniao_id: rid, demanda_id: x, ordem: base + k, motivos: motivosDaDemanda(dem(x)!, imped, pendDem) }));
    if (!novos.length) return;
    const { error } = await supabase.from("reuniao_itens").insert(novos);
    if (error) return notificar(mensagemErro(error), "erro");
    setBusca("");
    carregar();
  }
  async function item(i: ItemPauta, campos: Partial<ItemPauta>) {
    const { error } = await supabase.from("reuniao_itens").update(campos).eq("id", i.id);
    if (error) throw error;
    setItens((xs) => xs.map((x) => (x.id === i.id ? { ...x, ...campos } : x)));
  }
  async function remover(i: ItemPauta) {
    if (i.notas && !confirm("Retirar da pauta? As anotações deste item serão perdidas.")) return;
    const { error } = await supabase.from("reuniao_itens").delete().eq("id", i.id);
    if (error) return notificar(mensagemErro(error), "erro");
    carregar();
  }
  async function mover(i: ItemPauta, dir: -1 | 1) {
    const ord = [...itens].sort((a, b) => a.ordem - b.ordem);
    const k = ord.findIndex((x) => x.id === i.id), j = k + dir;
    if (j < 0 || j >= ord.length) return;
    [ord[k], ord[j]] = [ord[j], ord[k]];
    await Promise.all(ord.map((x, n) => supabase.from("reuniao_itens").update({ ordem: n }).eq("id", x.id)));
    carregar();
  }
  async function mudarAcao(a: Acao, situacao: string) {
    const { error } = await supabase.from("atividades").update({ situacao }).eq("id", a.id);
    if (error) return notificar(mensagemErro(error), "erro");
    carregar();
  }
  async function encerrar() {
    const semNotas = itens.filter((i) => !i.notas?.trim() && !i.discutido).length;
    if (!confirm(`Encerrar a reunião e gerar a ata?${semNotas ? `\n\n${semNotas} item(ns) da pauta sem anotação e não marcados como discutidos.` : ""}\n\nAs anotações de cada demanda entram no histórico dela e a reunião fica travada.`)) return;
    setEncerrando(true);
    try {
      const ata = montarAta({ reuniao: r!, itens, demandas, pessoas: cadastros.pessoas, decisoes, acoes, acoesAnteriores, encerradaPor: perfil?.nome ?? null, agora: new Date().toISOString() });
      const { error } = await supabase.rpc("encerrar_reuniao", { p_id: rid, p_ata: ata });
      if (error) throw error;
      notificar("Reunião encerrada. Ata gerada.");
      nav(`/reunioes/${rid}/ata`);
    } catch (e) {
      notificar(mensagemErro(e), "erro");
    } finally {
      setEncerrando(false);
    }
  }
  async function reabrir() {
    if (!confirm("Reabrir a reunião para alterações? A ata será gerada de novo ao encerrar.")) return;
    const { error } = await supabase.rpc("reabrir_reuniao", { p_id: rid });
    if (error) return notificar(mensagemErro(error), "erro");
    carregar();
  }
  async function excluir() {
    if (!confirm("Excluir esta reunião planejada? As ações e decisões já registradas continuam nas demandas.")) return;
    const { error } = await supabase.from("reunioes").delete().eq("id", rid);
    if (error) return notificar(mensagemErro(error), "erro");
    nav("/reunioes", { replace: true });
  }

  const termo = busca.trim().toLowerCase();
  const resultadosBusca = termo.length >= 2 ? demandas.filter((d) => !naPauta.has(d.id) && `${d.codigo} ${d.assunto} ${d.local_nome ?? ""}`.toLowerCase().includes(termo)).slice(0, 8) : [];
  const sugVisiveis = verTodasSug ? sugestoes : sugestoes.slice(0, 8);
  const graves = sugestoes.filter((s) => s.motivos.some((m) => ["Com impedimento", "Decisão a tomar", "Prazo de conclusão vencido", "Prazo da próxima etapa vencido"].includes(m)));

  return (
    <div className="pagina reuniao">
      <Link to="/reunioes" className="voltar">← Reuniões</Link>
      <div className="pagina-topo">
        <div>
          <h1>{r.titulo}</h1>
          <p className="sutil">{fmtData(r.data)}{r.hora ? ` às ${r.hora.slice(0, 5)}` : ""}{r.local ? ` · ${r.local}` : ""} · <span className={`badge ${r.status === "realizada" ? "sit-concluida" : "sit-aguardando"}`}>{r.status === "realizada" ? "Realizada" : "Planejada"}</span></p>
        </div>
        <div className="linha">
          <Link to={`/reunioes/${rid}/ata`} className="btn">{r.status === "realizada" ? "Ver ata" : "Prévia da ata"}</Link>
          {editavel && <button className="btn btn-primario" disabled={encerrando} onClick={encerrar}>{encerrando ? "Encerrando…" : "Encerrar e gerar ata"}</button>}
          {r.status === "realizada" && eGestor && <button className="btn" onClick={reabrir}>Reabrir</button>}
        </div>
      </div>

      {r.status === "realizada" && <Aviso tipo="ok">Reunião encerrada por {r.encerrada_por_nome ?? "—"}. As anotações foram levadas ao histórico de cada demanda. O plano de ação segue no acompanhamento.</Aviso>}

      <div className="progresso-reuniao">
        <span><strong>{discutidos}</strong> de {itens.length} itens discutidos</span>
        <span className="barra-trilho"><span className="barra" style={{ width: `${itens.length ? (discutidos / itens.length) * 100 : 0}%` }} /></span>
        <span><strong>{decHoje.filter((x) => x.decisao_status === "tomada").length}</strong> decisões tomadas</span>
        <span><strong>{acoesHoje.length}</strong> ações definidas</span>
      </div>

      <section className="cartao">
        <h2>Dados da reunião</h2>
        <div className="grade-4">
          <label className="campo"><span className="campo-rotulo">Título</span><input defaultValue={r.titulo} disabled={!editavel} onBlur={(e) => e.target.value.trim() && e.target.value !== r.titulo && atualizar({ titulo: e.target.value.trim() }).catch((er) => notificar(mensagemErro(er), "erro"))} /></label>
          <label className="campo"><span className="campo-rotulo">Data</span><input type="date" value={r.data} disabled={!editavel} onChange={(e) => e.target.value && atualizar({ data: e.target.value }).catch((er) => notificar(mensagemErro(er), "erro"))} /></label>
          <label className="campo"><span className="campo-rotulo">Horário</span><input type="time" value={r.hora?.slice(0, 5) ?? ""} disabled={!editavel} onChange={(e) => atualizar({ hora: e.target.value || null }).catch((er) => notificar(mensagemErro(er), "erro"))} /></label>
          <label className="campo"><span className="campo-rotulo">Local / link</span><input defaultValue={r.local ?? ""} disabled={!editavel} onBlur={(e) => e.target.value !== (r.local ?? "") && atualizar({ local: e.target.value || null }).catch((er) => notificar(mensagemErro(er), "erro"))} placeholder="Sala, Teams…" /></label>
        </div>
        <div className="campo">
          <span className="campo-rotulo">Participantes <Ajuda>Clique para marcar quem participa. A próxima reunião já vem com os participantes desta.</Ajuda></span>
          <div className="chips">
            {cadastros.pessoas.filter((p) => p.ativo !== false || r.participantes_ids.includes(p.id)).map((p) => {
              const on = r.participantes_ids.includes(p.id);
              return <button key={p.id} type="button" className="btn-chip" data-ativo={on} aria-pressed={on} disabled={!editavel}
                onClick={() => atualizar({ participantes_ids: on ? r.participantes_ids.filter((x) => x !== p.id) : [...r.participantes_ids, p.id] }).catch((er) => notificar(mensagemErro(er), "erro"))}>{p.nome}</button>;
            })}
          </div>
        </div>
        <div className="grade-2">
          <label className="campo"><span className="campo-rotulo">Convidados</span><input defaultValue={r.convidados ?? ""} disabled={!editavel} placeholder="Ex.: Fiscal da AVM, Suprimentos" onBlur={(e) => e.target.value !== (r.convidados ?? "") && atualizar({ convidados: e.target.value || null }).catch((er) => notificar(mensagemErro(er), "erro"))} /></label>
          <label className="campo"><span className="campo-rotulo">Objetivo</span><input defaultValue={r.objetivo ?? ""} disabled={!editavel} placeholder="Ex.: Acompanhamento semanal da carteira" onBlur={(e) => e.target.value !== (r.objetivo ?? "") && atualizar({ objetivo: e.target.value || null }).catch((er) => notificar(mensagemErro(er), "erro"))} /></label>
        </div>
      </section>

      <div className="faixa">1 · Acompanhamento das reuniões anteriores</div>
      <section className="cartao">
        <h2>Ações em aberto <Ajuda>Ações dos planos de ação anteriores que ainda não foram concluídas. Revise o andamento com cada responsável no início da reunião.</Ajuda></h2>
        {acoesAnteriores.length === 0 ? <p className="sutil">Nenhuma ação pendente de reuniões anteriores. 👍</p> : (
          <ul className="itens">
            {acoesAnteriores.sort((a, b) => (a.prazo ?? "9999").localeCompare(b.prazo ?? "9999")).map((a) => (
              <li key={a.id} className={`item${vencida(a.prazo) ? " impedido" : ""}`}>
                <div className="item-corpo">
                  <div>{a.titulo}</div>
                  <div className="pequeno item-meta">
                    <span>{pessoa(a.responsavel_id) ?? "sem responsável"}</span>
                    <span className={vencida(a.prazo) ? "texto-critico" : ""}>· {a.prazo ? `prazo ${fmtData(a.prazo)}${vencida(a.prazo) ? ` (${-diasAte(a.prazo)!}d vencida)` : ""}` : "sem prazo"}</span>
                    {a.demanda_id && <span>· <Link to={`/demandas/${a.demanda_id}?aba=atividades`}>{dem(a.demanda_id)?.codigo}</Link></span>}
                  </div>
                </div>
                {podeEditar && (
                  <select value={a.situacao} onChange={(e) => mudarAcao(a, e.target.value)} aria-label={`Situação da ação ${a.titulo}`}>
                    <option value="a_fazer">A fazer</option><option value="em_andamento">Em andamento</option><option value="concluida">Concluída</option><option value="cancelada">Cancelada</option>
                  </select>
                )}
              </li>
            ))}
          </ul>
        )}
        {decVencidas.length > 0 && (
          <>
            <h3 className="sub-titulo">Decisões com prazo vencido (fora da pauta)</h3>
            <ul className="lista-simples pequeno">
              {decVencidas.map((x) => (
                <li key={x.id}>
                  <span className="texto-critico">▲</span> <strong>{x.texto}</strong> — {x.decisao_responsavel ?? "quem decide não informado"} · até {fmtData(x.decisao_prazo)}
                  <div><Link to={`/demandas/${x.demanda_id}?aba=historico`}>{dem(x.demanda_id)?.codigo} · {dem(x.demanda_id)?.assunto}</Link>
                    {editavel && <> · <button className="btn-texto pequeno link-acao" onClick={() => incluir([x.demanda_id])}>incluir na pauta</button></>}</div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <div className="faixa">2 · Pauta por demanda</div>
      {editavel && (
        <section className="cartao sugestoes">
          <div className="linha linha-entre">
            <h2>Sugestões de pauta <Ajuda>Demandas abertas com pontos de atenção: impedimento, decisão a tomar, prazo vencido, etapa vencida, aguardando aprovação, parada há mais de 30 dias, vencendo em 7 dias ou acompanhamento gerencial.</Ajuda></h2>
            {graves.length > 0 && <button className="btn" onClick={() => incluir(graves.map((s) => s.d.id))}>Incluir as {graves.length} mais críticas</button>}
          </div>
          {sugestoes.length === 0 ? <p className="sutil">Nenhuma demanda com ponto de atenção fora da pauta.</p> : (
            <ul className="lista-sugestoes">
              {sugVisiveis.map(({ d, motivos }) => (
                <li key={d.id}>
                  <div>
                    <strong>{d.codigo}</strong> {d.assunto} <span className="sutil pequeno">· {d.responsavel_nome ?? "sem responsável"}</span>
                    <div className="chips-motivo">{motivos.map((m) => <span key={m} className="motivo">{m}</span>)}</div>
                  </div>
                  <button className="btn" onClick={() => incluir([d.id])}>+ Incluir</button>
                </li>
              ))}
            </ul>
          )}
          {sugestoes.length > 8 && <button className="btn-link pequeno" onClick={() => setVerTodasSug(!verTodasSug)}>{verTodasSug ? "Mostrar menos" : `Mostrar todas (${sugestoes.length})`}</button>}
          <div className="campo busca-pauta">
            <span className="campo-rotulo">Incluir outra demanda</span>
            <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Digite código, assunto ou local…" />
            {resultadosBusca.length > 0 && (
              <ul className="resultados-busca">{resultadosBusca.map((d) => <li key={d.id}><button className="btn-texto" onClick={() => incluir([d.id])}>{d.codigo} · {d.assunto}</button></li>)}</ul>
            )}
          </div>
        </section>
      )}

      {itens.length === 0 && <Aviso tipo="info">A pauta está vazia. {editavel ? "Inclua demandas pelas sugestões acima ou pela busca." : ""}</Aviso>}
      {[...itens].sort((a, b) => a.ordem - b.ordem).map((i, n) => {
        const d = dem(i.demanda_id);
        if (!d) return null;
        const pend = decisoes.filter((x) => x.demanda_id === d.id && x.decisao_status === "pendente");
        const tomadasHoje = decisoes.filter((x) => x.demanda_id === d.id && x.reuniao_id === rid && x.decisao_status === "tomada");
        const acoesDem = abertasDem.filter((a) => a.demanda_id === d.id);
        const ult = andamentos.filter((h) => h.demanda_id === d.id).slice(0, 2);
        const motivosAgora = motivosDaDemanda(d, imped, pendDem);
        return (
          <section key={i.id} className={`cartao item-pauta${i.discutido ? " discutido" : ""}`}>
            <div className="item-pauta-topo">
              <span className="item-num">{n + 1}</span>
              <div className="item-pauta-titulo">
                <Link to={`/demandas/${d.id}`} target="_blank" rel="noopener"><span className="codigo">{d.codigo}</span> {d.assunto}</Link>
                <div className="linha-badges">
                  <BadgeSituacao s={d.situacao} /><BadgeClasse c={d.classe} ranking={d.ranking} />
                  {(motivosAgora.length ? motivosAgora : i.motivos).map((m) => <span key={m} className="motivo">{m}</span>)}
                </div>
              </div>
              <label className="check-linha discutido-check"><input type="checkbox" checked={i.discutido} disabled={!editavel} onChange={(e) => item(i, { discutido: e.target.checked }).catch((er) => notificar(mensagemErro(er), "erro"))} /> Discutido</label>
              {editavel && (
                <span className="linha item-pauta-acoes">
                  <button className="btn-icone" onClick={() => mover(i, -1)} aria-label="Subir na pauta" disabled={n === 0}>↑</button>
                  <button className="btn-icone" onClick={() => mover(i, 1)} aria-label="Descer na pauta" disabled={n === itens.length - 1}>↓</button>
                  <button className="btn-icone" onClick={() => remover(i)} aria-label="Retirar da pauta">✕</button>
                </span>
              )}
            </div>
            <dl className="infos infos-compactas">
              <div className="info"><dt>Etapa</dt><dd>{d.situacao === "concluida" ? "Concluída" : ETAPAS[d.etapa]}</dd></div>
              <div className="info"><dt>Responsável</dt><dd>{d.responsavel_nome ?? "—"}</dd></div>
              <div className="info"><dt>Prazo de conclusão</dt><dd className={d.atrasada ? "texto-critico" : ""}>{fmtData(d.prazo_conclusao)}</dd></div>
              <div className="info"><dt>Próxima etapa até</dt><dd>{fmtData(d.prazo_proxima_etapa)}</dd></div>
              {d.situacao === "aguardando" && <div className="info"><dt>Aguardando</dt><dd>{d.aguardando_o_que ?? "—"}</dd></div>}
            </dl>
            <div className="item-pauta-grade">
              <div>
                {pend.length > 0 && (
                  <div className="bloco-pauta">
                    <h4>Decisões a tomar</h4>
                    <ul className="lista-simples">{pend.map((x) => (
                      <li key={x.id}><strong>{x.texto}</strong><DecisaoInfo r={x} />{editavel && <ResolverDecisao r={x} reuniaoId={rid} aoMudar={carregar} />}</li>
                    ))}</ul>
                  </div>
                )}
                {tomadasHoje.length > 0 && (
                  <div className="bloco-pauta">
                    <h4>Decidido nesta reunião</h4>
                    <ul className="lista-simples">{tomadasHoje.map((x) => <li key={x.id}>✔ {x.texto}{x.decisao_resultado ? ` → ${x.decisao_resultado}` : ""}</li>)}</ul>
                  </div>
                )}
                <div className="bloco-pauta">
                  <h4>Últimos andamentos</h4>
                  {ult.length ? <ul className="lista-simples pequeno">{ult.map((h) => <li key={h.id}><span className="sutil">{fmtData(h.data)} · {h.autor_nome}</span><div className="pre">{h.texto.length > 220 ? h.texto.slice(0, 218) + "…" : h.texto}</div></li>)}</ul>
                    : <p className="sutil pequeno">Sem andamentos registrados.</p>}
                </div>
                {acoesDem.length > 0 && (
                  <div className="bloco-pauta">
                    <h4>Atividades e ações em aberto</h4>
                    <ul className="lista-simples pequeno">{acoesDem.map((a) => <li key={a.id}>{a.tipo === "acao" ? "▸ Ação: " : ""}{a.titulo} <span className={vencida(a.prazo) ? "texto-critico" : "sutil"}>· {pessoa(a.responsavel_id) ?? "—"} · {fmtData(a.prazo)}</span></li>)}</ul>
                  </div>
                )}
              </div>
              <div>
                <h4>O que foi discutido</h4>
                <TextoAuto valor={i.notas} desativado={!editavel} rows={4} aria-label={`Anotações sobre ${d.codigo}`}
                  placeholder="Resumo da discussão: situação, problemas, encaminhamentos…"
                  salvar={(v) => item(i, { notas: v || null, ...(v.trim() && !i.discutido ? { discutido: true } : {}) })} />
                {editavel && <Adicionar demandaId={d.id} reuniao={r} aoMudar={carregar} />}
                {acoesHoje.filter((a) => a.demanda_id === d.id).length > 0 && (
                  <ul className="lista-simples pequeno acoes-hoje">
                    {acoesHoje.filter((a) => a.demanda_id === d.id).map((a) => <li key={a.id}>▸ <strong>{a.titulo}</strong> — {pessoa(a.responsavel_id) ?? <span className="texto-atencao">responsável a definir</span>} · {a.prazo ? fmtData(a.prazo) : <span className="texto-atencao">sem prazo</span>}</li>)}
                  </ul>
                )}
              </div>
            </div>
          </section>
        );
      })}

      <div className="faixa">3 · Assuntos gerais</div>
      <section className="cartao">
        <h2>Assuntos gerais <Ajuda>Temas fora das demandas: equipe, processos, avisos. Ações daqui ficam no plano de ação sem demanda vinculada.</Ajuda></h2>
        <TextoAuto valor={r.assuntos_gerais} desativado={!editavel} rows={3} aria-label="Assuntos gerais" placeholder="Ex.: escala de férias, novo procedimento de PT…"
          salvar={(v) => atualizar({ assuntos_gerais: v || null })} />
        {editavel && <Adicionar demandaId={null} reuniao={r} aoMudar={carregar} />}
        {acoesHoje.filter((a) => !a.demanda_id).length > 0 && (
          <ul className="lista-simples pequeno acoes-hoje">
            {acoesHoje.filter((a) => !a.demanda_id).map((a) => <li key={a.id}>▸ <strong>{a.titulo}</strong> — {pessoa(a.responsavel_id) ?? "responsável a definir"} · {fmtData(a.prazo)}</li>)}
          </ul>
        )}
      </section>

      <div className="barra-acoes barra-fixa">
        {r.status === "planejada" && (eGestor || podeEditar) && <button className="btn-perigo-link" onClick={excluir}>Excluir reunião</button>}
        <span className="sutil pequeno">{discutidos}/{itens.length} discutidos · {acoesHoje.length} ações · {decHoje.length} decisões</span>
        <Link to={`/reunioes/${rid}/ata`} className="btn">{r.status === "realizada" ? "Ver ata" : "Prévia da ata"}</Link>
        {editavel && <button className="btn btn-primario" disabled={encerrando} onClick={encerrar}>Encerrar e gerar ata</button>}
      </div>
    </div>
  );
}

