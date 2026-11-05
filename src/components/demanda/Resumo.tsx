import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, mensagemErro } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { CATEGORIAS, ESFORCO, ETAPAS, FLUXO, FORMAS, MD_SITUACOES, diasAte, fmtData } from "../../lib/dominio";
import type { DemandaLinha } from "../../lib/filtros";
import DemandaForm, { CAMPOS_DEMANDA, type ValoresDemanda } from "../DemandaForm";
import { notificar } from "../ui";
import type { Registro } from "./HistoricoAba";

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

function UltimosAndamentos({ demandaId, abrir }: { demandaId: number; abrir: () => void }) {
  const { podeEditar } = useAuth();
  const [lista, setLista] = useState<Registro[] | null>(null);
  useEffect(() => {
    supabase.from("historico").select("*").eq("demanda_id", demandaId).neq("tipo", "sistema")
      .order("data", { ascending: false }).order("criado_em", { ascending: false }).limit(3)
      .then(({ data }) => setLista((data as Registro[]) ?? []));
  }, [demandaId]);
  if (!lista) return null;
  return (
    <section className="cartao atualizacao">
      <div className="linha linha-entre">
        <h2>Últimos andamentos</h2>
        <button className={podeEditar ? "btn btn-primario" : "btn"} onClick={abrir}>{podeEditar ? "Registrar andamento" : "Ver histórico"}</button>
      </div>
      {lista.length === 0 ? <p className="sutil">Nenhum andamento registrado ainda.</p> : (
        <ul className="ultimos">
          {lista.map((r) => (
            <li key={r.id}>
              <span className="lt-data">{fmtData(r.data)}</span>
              <div>
                {r.tipo === "decisao" && <span className="badge badge-critico">Decisão</span>}
                <p className="pre">{r.texto.length > 280 ? r.texto.slice(0, 278) + "…" : r.texto}</p>
                <span className="sutil pequeno">{r.autor_nome}{r.editado_em ? " · editado" : ""}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {lista.length > 0 && <button className="btn-link pequeno" onClick={abrir}>Ver histórico completo →</button>}
    </section>
  );
}

export default function Resumo({ d, recarregar, abrirHistorico }: { d: DemandaLinha; recarregar: () => void; abrirHistorico: () => void }) {
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

      {!eContratada && <UltimosAndamentos demandaId={d.id} abrir={abrirHistorico} />}

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
