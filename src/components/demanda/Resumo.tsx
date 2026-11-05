import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, mensagemErro } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { CATEGORIAS, ESFORCO, ETAPAS, FLUXO, FORMAS, MD_SITUACOES, SITUACOES, diasAte, fmtData, hojeISO, type Etapa, type Situacao } from "../../lib/dominio";
import type { DemandaLinha } from "../../lib/filtros";
import DemandaForm, { CAMPOS_DEMANDA, type ValoresDemanda } from "../DemandaForm";
import { Ajuda, notificar } from "../ui";

function Info({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return <div className="info"><dt>{rotulo}</dt><dd>{children ?? "—"}</dd></div>;
}

function Fluxo({ d }: { d: DemandaLinha }) {
  const etapas = FLUXO[d.forma_execucao];
  const atual = etapas.indexOf(d.etapa);
  return (
    <ol className="fluxo" aria-label="Etapas da demanda">
      {etapas.map((e, i) => (
        <li key={e} className={i < atual ? "feita" : i === atual ? "atual" : ""} aria-current={i === atual ? "step" : undefined}>
          <span className="fluxo-ponto" aria-hidden>{i < atual ? "✓" : i + 1}</span>
          <span className="fluxo-nome">{ETAPAS[e]}</span>
        </li>
      ))}
    </ol>
  );
}

function AtualizacaoRapida({ d, aoSalvar }: { d: DemandaLinha; aoSalvar: () => void }) {
  const [texto, setTexto] = useState("");
  const [situacao, setSituacao] = useState<Situacao>(d.situacao);
  const [aguardando, setAguardando] = useState(d.aguardando_o_que ?? "");
  const [etapa, setEtapa] = useState<Etapa>(d.etapa);
  const [prazo, setPrazo] = useState(d.prazo_proxima_etapa ?? "");
  const [decisao, setDecisao] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function registrar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    const mudou = situacao !== d.situacao || etapa !== d.etapa || (prazo || null) !== d.prazo_proxima_etapa || (aguardando || null) !== d.aguardando_o_que;
    if (!texto.trim() && !mudou) return setErro("Escreva o que aconteceu ou altere a situação/etapa.");
    setSalvando(true);
    try {
      if (texto.trim()) {
        const { error } = await supabase.from("historico").insert({ demanda_id: d.id, texto: texto.trim(), data: hojeISO(), tipo: decisao ? "decisao" : "atualizacao" });
        if (error) throw error;
      }
      if (mudou) {
        const etapaFinal = situacao === "concluida" ? "concluida" : etapa;
        const { error } = await supabase.from("demandas").update({
          situacao, etapa: etapaFinal, prazo_proxima_etapa: prazo || null,
          aguardando_o_que: situacao === "aguardando" ? aguardando || null : null,
        }).eq("id", d.id);
        if (error) throw error;
      }
      setTexto("");
      setDecisao(false);
      notificar("Atualização registrada.");
      aoSalvar();
    } catch (er) {
      setErro(mensagemErro(er));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form className="cartao atualizacao" onSubmit={registrar}>
      <h2>Registrar andamento <Ajuda>Escreva o que aconteceu hoje. Se a situação ou a etapa mudou, ajuste aqui mesmo: tudo fica no histórico com seu nome e a data.</Ajuda></h2>
      <textarea rows={3} placeholder="O que aconteceu? Ex.: Cotação recebida de 3 fornecedores; enviado para aprovação."
        value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Texto da atualização" />
      <div className="grade-4">
        <label className="campo">
          <span className="campo-rotulo">Situação</span>
          <select value={situacao} onChange={(e) => setSituacao(e.target.value as Situacao)}>
            {Object.entries(SITUACOES).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
        </label>
        {situacao === "aguardando" && (
          <label className="campo">
            <span className="campo-rotulo">Aguardando o quê/quem?</span>
            <input value={aguardando} onChange={(e) => setAguardando(e.target.value)} />
          </label>
        )}
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
      </div>
      <div className="linha linha-entre">
        <label className="check-linha pequeno"><input type="checkbox" checked={decisao} onChange={(e) => setDecisao(e.target.checked)} /> Marcar como decisão importante</label>
        <button className="btn btn-primario" disabled={salvando}>{salvando ? "Registrando…" : "Registrar"}</button>
      </div>
      {erro && <div className="erro-form" role="alert">{erro}</div>}
    </form>
  );
}

export default function Resumo({ d, recarregar }: { d: DemandaLinha; recarregar: () => void }) {
  const { podeEditar, eGestor, eContratada } = useAuth();
  const [editando, setEditando] = useState(false);
  const nav = useNavigate();

  if (editando) {
    const inicial = Object.fromEntries(CAMPOS_DEMANDA.map((k) => [k, d[k as keyof DemandaLinha]])) as unknown as ValoresDemanda;
    return (
      <DemandaForm
        inicial={inicial}
        aoCancelar={() => setEditando(false)}
        aoSalvar={async (v) => {
          const { error } = await supabase.from("demandas").update(v).eq("id", d.id);
          if (error) throw error;
          notificar("Demanda atualizada.");
          setEditando(false);
          recarregar();
        }}
      />
    );
  }

  async function excluir() {
    if (!confirm(`Excluir definitivamente a demanda ${d.codigo}? Atividades, histórico, RDOs e documentos dela também serão apagados. Para guardar o registro, prefira mudar a situação para "Cancelada".`)) return;
    const { data: docs } = await supabase.from("documentos").select("caminho").eq("demanda_id", d.id);
    if (docs?.length) await supabase.storage.from("documentos").remove(docs.map((x) => x.caminho));
    const { error } = await supabase.from("demandas").delete().eq("id", d.id);
    if (error) return notificar(mensagemErro(error), "erro");
    notificar("Demanda excluída.");
    nav("/demandas", { replace: true });
  }

  const prazoTxt = (p: string | null) => {
    if (!p) return "—";
    const n = diasAte(p)!;
    const aberta = d.situacao !== "concluida" && d.situacao !== "cancelada";
    return <>{fmtData(p)}{aberta && <span className={n < 0 ? "texto-critico" : n <= 7 ? "texto-atencao" : "sutil"}> ({n < 0 ? `${-n} dias de atraso` : n === 0 ? "hoje" : `em ${n} dias`})</span>}</>;
  };

  return (
    <div className="resumo">
      <section className="cartao">
        <div className="linha linha-entre">
          <h2>Etapas</h2>
          <span className="sutil pequeno">{FORMAS[d.forma_execucao]}</span>
        </div>
        <Fluxo d={d} />
        {d.situacao === "aguardando" && d.aguardando_o_que && <p><strong>Aguardando:</strong> {d.aguardando_o_que}</p>}
        {d.detalhamento && <p>{d.detalhamento}</p>}
      </section>

      {podeEditar && <AtualizacaoRapida key={d.atualizado_em} d={d} aoSalvar={recarregar} />}

      <section className="cartao">
        <div className="linha linha-entre">
          <h2>Dados da demanda</h2>
          {podeEditar && <button className="btn" onClick={() => setEditando(true)}>Editar</button>}
        </div>
        {d.descricao && <p className="pre">{d.descricao}</p>}
        <dl className="infos">
          <Info rotulo="Local">{d.local_nome}</Info>
          {!eContratada && <Info rotulo="Responsável">{d.responsavel_nome ?? <span className="texto-atencao">Sem responsável</span>}</Info>}
          <Info rotulo="Solicitante">{d.solicitante}</Info>
          <Info rotulo="Recebida em">{fmtData(d.recebida_em)}</Info>
          <Info rotulo="Prazo da próxima etapa">{prazoTxt(d.prazo_proxima_etapa)}</Info>
          <Info rotulo="Prazo de conclusão">{prazoTxt(d.prazo_conclusao)}</Info>
          <Info rotulo="Início / fim da execução">{fmtData(d.inicio)} → {fmtData(d.fim)}</Info>
          {d.concluida_em && <Info rotulo="Concluída em">{fmtData(d.concluida_em)}</Info>}
          {d.forma_execucao === "contratada" && <Info rotulo="Empresa contratada">{d.empresa_nome}</Info>}
          {d.forma_execucao === "contratada" && <Info rotulo="Memorial Descritivo">{[d.md_codigo, d.md_situacao && MD_SITUACOES[d.md_situacao]].filter(Boolean).join(" · ") || "—"}</Info>}
          {d.forma_execucao === "contratada" && <Info rotulo="Ordem de Serviço">{d.os_numero}</Info>}
          {d.status_projeto && <Info rotulo="Situação do projeto">{d.status_projeto}</Info>}
        </dl>
      </section>

      <section className="cartao">
        <h2>Prioridade</h2>
        {d.pontuacao === null ? (
          <p className="texto-atencao">
            Prioridade ainda não avaliada: a demanda fica fora do ranking.
            {podeEditar && <> <button className="btn btn-link" onClick={() => setEditando(true)}>Avaliar agora</button></>}
          </p>
        ) : (
          <dl className="infos">
            <Info rotulo="Ranking">{d.ranking ? `#${d.ranking}` : "Fora do ranking (concluída/cancelada)"}</Info>
            <Info rotulo="Pontuação">{d.probabilidade} × {d.severidade} = {d.pontuacao}</Info>
            <Info rotulo="Categoria">{[d.categoria_principal, d.categoria_secundaria].filter(Boolean).map((c) => `${c} · ${CATEGORIAS[c!].nome}`).join(" / ") || "—"}</Info>
            <Info rotulo="Marcações">{[d.risco_queda_eletro && "Risco de queda/eletrocussão", d.prazo_legal && "Prazo legal/contratual", d.efeito_cadeia && "Efeito em cadeia"].filter(Boolean).join(", ") || "Nenhuma"}</Info>
            <Info rotulo="Esforço">{d.esforco ? ESFORCO[d.esforco] : "—"}</Info>
          </dl>
        )}
        {d.prioridade_legada && <p className="sutil pequeno">Prioridade na planilha antiga: {d.prioridade_legada}</p>}
      </section>

      {eGestor && (
        <div className="zona-perigo">
          <button className="btn btn-perigo-link" onClick={excluir}>Excluir demanda</button>
        </div>
      )}
    </div>
  );
}
