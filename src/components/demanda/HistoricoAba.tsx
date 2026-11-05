import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { supabase, mensagemErro } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { ETAPAS, FLUXO, SITUACOES, diasAte, fmtData, fmtDataHora, hojeISO, type Etapa, type Situacao } from "../../lib/dominio";
import type { DemandaLinha } from "../../lib/filtros";
import { Ajuda, Aviso, Carregando, Vazio, notificar } from "../ui";

export interface Registro {
  id: number; data: string; texto: string; tipo: "atualizacao" | "decisao" | "sistema";
  autor_id: string | null; autor_nome: string | null; criado_em: string;
  editado_em: string | null; editado_por_nome: string | null;
  decisao_status: "pendente" | "tomada" | null; decisao_responsavel: string | null; decisao_prazo: string | null;
  decisao_resultado: string | null; decidida_em: string | null; decidida_por_nome: string | null; reuniao_id: number | null;
}

/** Selo e detalhes da decisão (a tomar / tomada). */
export function DecisaoInfo({ r }: { r: Registro }) {
  if (r.tipo !== "decisao") return null;
  const n = r.decisao_prazo ? diasAte(r.decisao_prazo) : null;
  if (r.decisao_status === "pendente") {
    return (
      <div className="decisao-info pendente">
        <span className="badge badge-atencao">◐ Decisão a tomar</span>
        <span className="pequeno">
          {r.decisao_responsavel && <>Quem decide: <strong>{r.decisao_responsavel}</strong></>}
          {r.decisao_prazo && <> · prazo {fmtData(r.decisao_prazo)}{n !== null && n < 0 && <strong className="texto-critico"> ({-n}d vencida)</strong>}</>}
        </span>
      </div>
    );
  }
  return (
    <div className="decisao-info tomada">
      <span className="badge badge-critico">Decisão tomada</span>
      {r.decisao_resultado && <span className="pequeno"><strong>Decidido:</strong> {r.decisao_resultado} <span className="sutil">({r.decidida_por_nome ?? ""}{r.decidida_em ? ` · ${fmtData(r.decidida_em)}` : ""})</span></span>}
    </div>
  );
}

/** Registrar que a decisão pendente foi tomada. */
export function ResolverDecisao({ r, reuniaoId, aoMudar }: { r: Registro; reuniaoId?: number; aoMudar: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [txt, setTxt] = useState("");
  if (r.decisao_status !== "pendente") return null;
  async function salvar() {
    const { error } = await supabase.rpc("resolver_decisao", { p_id: r.id, p_resultado: txt, p_reuniao: reuniaoId ?? null });
    if (error) return notificar(mensagemErro(error), "erro");
    notificar("Decisão registrada.");
    setAberto(false);
    aoMudar();
  }
  if (!aberto) return <button className="btn-texto pequeno link-acao" onClick={() => setAberto(true)}>registrar decisão</button>;
  return (
    <div className="linha resolver">
      <input value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="O que foi decidido?" aria-label="O que foi decidido" autoFocus />
      <button className="btn" onClick={() => setAberto(false)}>Cancelar</button>
      <button className="btn btn-primario" disabled={!txt.trim()} onClick={salvar}>Salvar decisão</button>
    </div>
  );
}

/** Formulário "Registrar andamento": texto + mudança opcional de situação, etapa e prazo, numa única ação. */
function RegistrarAndamento({ d, aoSalvar }: { d: DemandaLinha; aoSalvar: () => void }) {
  const [texto, setTexto] = useState("");
  const [data, setData] = useState(hojeISO());
  const [situacao, setSituacao] = useState<Situacao>(d.situacao);
  const [aguardando, setAguardando] = useState(d.aguardando_o_que ?? "");
  const [etapa, setEtapa] = useState<Etapa>(d.etapa);
  const [prazo, setPrazo] = useState(d.prazo_proxima_etapa ?? "");
  const [decisao, setDecisao] = useState(false);
  const [decPendente, setDecPendente] = useState(false);
  const [quemDecide, setQuemDecide] = useState("");
  const [prazoDecisao, setPrazoDecisao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function registrar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    const mudou = situacao !== d.situacao || etapa !== d.etapa || (prazo || null) !== d.prazo_proxima_etapa || (aguardando || null) !== d.aguardando_o_que;
    if (!texto.trim() && !mudou) return setErro("Escreva o que aconteceu ou altere a situação/etapa.");
    if (data > hojeISO()) return setErro("A data do andamento não pode ser no futuro.");
    setSalvando(true);
    try {
      if (texto.trim()) {
        const { error } = await supabase.from("historico").insert({
          demanda_id: d.id, texto: texto.trim(), data, tipo: decisao ? "decisao" : "atualizacao",
          ...(decisao ? { decisao_status: decPendente ? "pendente" : "tomada", decisao_responsavel: decPendente ? quemDecide || null : null, decisao_prazo: decPendente ? prazoDecisao || null : null } : {}),
        });
        if (error) throw error;
      }
      if (mudou) {
        const { error } = await supabase.from("demandas").update({
          situacao, etapa: situacao === "concluida" ? "concluida" : etapa, prazo_proxima_etapa: prazo || null,
          aguardando_o_que: situacao === "aguardando" ? aguardando || null : null,
        }).eq("id", d.id);
        if (error) throw error;
      }
      setTexto("");
      setDecisao(false);
      setDecPendente(false); setQuemDecide(""); setPrazoDecisao("");
      setData(hojeISO());
      notificar("Andamento registrado.");
      aoSalvar();
    } catch (er) {
      setErro(mensagemErro(er));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form className="registrar" onSubmit={registrar}>
      <h3>Registrar andamento <Ajuda>Escreva o que aconteceu. Se a situação, a etapa ou o prazo mudaram, ajuste aqui mesmo: tudo entra no histórico abaixo com seu nome e a data.</Ajuda></h3>
      <textarea rows={3} placeholder="O que aconteceu? Ex.: Cotação recebida de 3 fornecedores; enviado para aprovação."
        value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Texto do andamento" />
      <div className="grade-4">
        <label className="campo">
          <span className="campo-rotulo">Data do fato</span>
          <input type="date" value={data} max={hojeISO()} onChange={(e) => setData(e.target.value || hojeISO())} />
        </label>
        <label className="campo">
          <span className="campo-rotulo">Situação</span>
          <select value={situacao} onChange={(e) => setSituacao(e.target.value as Situacao)}>
            {Object.entries(SITUACOES).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
        </label>
        <label className="campo">
          <span className="campo-rotulo">Etapa</span>
          <select value={situacao === "concluida" ? "concluida" : etapa} disabled={situacao === "concluida"} onChange={(e) => setEtapa(e.target.value as Etapa)}>
            {FLUXO[d.forma_execucao].map((k) => <option key={k} value={k}>{ETAPAS[k]}</option>)}
          </select>
        </label>
        <label className="campo">
          <span className="campo-rotulo">Prazo da próxima etapa</span>
          <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
        </label>
        {situacao === "aguardando" && (
          <label className="campo campo-largo-2">
            <span className="campo-rotulo">Aguardando o quê/quem?</span>
            <input value={aguardando} onChange={(e) => setAguardando(e.target.value)} />
          </label>
        )}
      </div>
      <div className="linha linha-entre">
        <span className="linha">
          <label className="check-linha pequeno"><input type="checkbox" checked={decisao} onChange={(e) => setDecisao(e.target.checked)} /> Marcar como decisão importante</label>
          {decisao && (
            <span className="segmentado pequeno">
              <button type="button" className={!decPendente ? "ativo" : ""} aria-pressed={!decPendente} onClick={() => setDecPendente(false)}>Já tomada</button>
              <button type="button" className={decPendente ? "ativo" : ""} aria-pressed={decPendente} onClick={() => setDecPendente(true)}>A tomar (pendente)</button>
            </span>
          )}
        </span>
        <button className="btn btn-primario" disabled={salvando}>{salvando ? "Registrando…" : "Registrar"}</button>
      </div>
      {decisao && decPendente && (
        <div className="grade-2">
          <label className="campo"><span className="campo-rotulo">Quem decide?</span><input value={quemDecide} onChange={(e) => setQuemDecide(e.target.value)} placeholder="Ex.: Gerência, Direx, Suprimentos" /></label>
          <label className="campo"><span className="campo-rotulo">Decidir até</span><input type="date" value={prazoDecisao} onChange={(e) => setPrazoDecisao(e.target.value)} /></label>
        </div>
      )}
      {erro && <div className="erro-form" role="alert">{erro}</div>}
    </form>
  );
}

function ItemHistorico({ r, aoMudar }: { r: Registro; aoMudar: () => void }) {
  const { perfil, eGestor, podeEditar } = useAuth();
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(r.texto);
  const [data, setData] = useState(r.data);
  const [decisao, setDecisao] = useState(r.tipo === "decisao");
  const doAutor = podeEditar && r.autor_id === perfil?.id;
  const podeEditarEste = r.tipo !== "sistema" && (eGestor || doAutor);
  const podeExcluir = eGestor || (doAutor && r.tipo !== "sistema");

  async function salvar() {
    if (!texto.trim()) return notificar("O texto não pode ficar vazio.", "erro");
    const { error } = await supabase.from("historico").update({ texto: texto.trim(), data, tipo: decisao ? "decisao" : "atualizacao" }).eq("id", r.id);
    if (error) return notificar(mensagemErro(error), "erro");
    notificar("Registro atualizado.");
    setEditando(false);
    aoMudar();
  }
  async function excluir() {
    if (!confirm("Excluir este registro do histórico? Esta ação não pode ser desfeita.")) return;
    const { error } = await supabase.from("historico").delete().eq("id", r.id);
    if (error) return notificar(mensagemErro(error), "erro");
    aoMudar();
  }

  return (
    <li className={`lt-${r.tipo}`}>
      <div className="lt-data">{fmtData(r.data)}</div>
      <div className="lt-corpo">
        {r.tipo === "sistema" && <span className="badge">Automático</span>}
        {editando ? (
          <div className="form">
            <textarea rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Editar registro" autoFocus />
            <div className="linha linha-entre">
              <span className="linha">
                <label className="campo campo-inline"><span className="campo-rotulo">Data do fato</span>
                  <input type="date" value={data} max={hojeISO()} onChange={(e) => setData(e.target.value || r.data)} /></label>
                <label className="check-linha pequeno"><input type="checkbox" checked={decisao} onChange={(e) => setDecisao(e.target.checked)} /> Decisão importante</label>
              </span>
              <span className="linha">
                <button className="btn" onClick={() => { setEditando(false); setTexto(r.texto); setData(r.data); setDecisao(r.tipo === "decisao"); }}>Cancelar</button>
                <button className="btn btn-primario" onClick={salvar}>Salvar</button>
              </span>
            </div>
          </div>
        ) : <p className="pre">{r.texto}</p>}
        <DecisaoInfo r={r} />
        {podeEditar && <ResolverDecisao r={r} aoMudar={aoMudar} />}
        <div className="sutil pequeno">
          {r.autor_nome ?? "—"} · registrado em {fmtDataHora(r.criado_em)}
          {r.editado_em && <> · editado{r.editado_por_nome && r.editado_por_nome !== r.autor_nome ? ` por ${r.editado_por_nome}` : ""} em {fmtDataHora(r.editado_em)}</>}
          {r.reuniao_id && <> · <Link to={`/reunioes/${r.reuniao_id}/ata`}>reunião (ata)</Link></>}
          {!editando && podeEditarEste && <> · <button className="btn-texto pequeno link-acao" onClick={() => setEditando(true)}>editar</button></>}
          {!editando && podeExcluir && <> · <button className="btn-texto pequeno link-acao" onClick={excluir}>excluir</button></>}
        </div>
      </div>
    </li>
  );
}

export default function HistoricoAba({ d, recarregar }: { d: DemandaLinha; recarregar: () => void }) {
  const { podeEditar } = useAuth();
  const [lista, setLista] = useState<Registro[] | null>(null);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "sem_sistema" | "decisao" | "pendente">("sem_sistema");

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from("historico").select("*").eq("demanda_id", d.id)
      .order("data", { ascending: false }).order("criado_em", { ascending: false });
    if (error) setErro(mensagemErro(error));
    else setLista(data as Registro[]);
  }, [d.id]);
  useEffect(() => { carregar(); }, [carregar]);

  if (erro) return <Aviso tipo="critico">{erro}</Aviso>;
  if (!lista) return <Carregando />;
  const visiveis = lista.filter((r) => filtro === "todos" || (filtro === "pendente" ? r.decisao_status === "pendente" : filtro === "decisao" ? r.tipo === "decisao" : r.tipo !== "sistema"));

  return (
    <section className="cartao">
      <h2>Histórico <Ajuda>Registro do andamento da demanda. Fica gravado quem escreveu e quando. Só o autor ou o Gestor podem editar ou excluir; os registros automáticos (mudanças de situação, etapa e prazo) não são editáveis.</Ajuda></h2>
      {podeEditar && <RegistrarAndamento key={d.atualizado_em} d={d} aoSalvar={() => { carregar(); recarregar(); }} />}
      <div className="linha linha-entre historico-filtro">
        <span className="sutil pequeno">{visiveis.length} registro(s)</span>
        <select value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)} aria-label="Filtrar histórico">
          <option value="sem_sistema">Andamentos e decisões</option>
          <option value="decisao">Só decisões</option>
          <option value="pendente">Só decisões a tomar</option>
          <option value="todos">Tudo (inclui mudanças automáticas)</option>
        </select>
      </div>
      {visiveis.length === 0 && <Vazio titulo="Nenhum registro" />}
      <ol className="linha-tempo">
        {visiveis.map((r) => <ItemHistorico key={r.id} r={r} aoMudar={carregar} />)}
      </ol>
    </section>
  );
}
