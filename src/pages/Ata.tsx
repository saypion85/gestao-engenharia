import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase, mensagemErro } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { fmtData } from "../lib/dominio";
import { ataEmTexto, montarAta, type Acao, type Ata, type DecisaoRegistro, type ItemPauta, type Reuniao } from "../lib/reunioes";
import { carregarDemandas } from "./Demandas";
import { CAMPOS_DECISAO, aberta } from "./Reunioes";
import { Aviso, Carregando, notificar } from "../components/ui";

export default function AtaPagina() {
  const { id } = useParams();
  const rid = Number(id);
  const { cadastros, perfil } = useAuth();
  const [ata, setAta] = useState<Ata | null>(null);
  const [previa, setPrevia] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { data: r, error } = await supabase.from("reunioes").select("*").eq("id", rid).maybeSingle();
        if (error || !r) throw error ?? new Error("Reunião não encontrada.");
        const reuniao = r as Reuniao;
        if (reuniao.status === "realizada" && reuniao.ata) { setAta(reuniao.ata); return; }
        // prévia: monta com os dados atuais
        const [it, d, dc, ac] = await Promise.all([
          supabase.from("reuniao_itens").select("*").eq("reuniao_id", rid),
          carregarDemandas(),
          supabase.from("historico").select(CAMPOS_DECISAO).eq("tipo", "decisao"),
          supabase.from("atividades").select("*").eq("tipo", "acao"),
        ]);
        const acoes = (ac.data ?? []) as Acao[];
        setPrevia(true);
        setAta(montarAta({
          reuniao, itens: (it.data ?? []) as ItemPauta[], demandas: d.lista, pessoas: cadastros.pessoas,
          decisoes: (dc.data ?? []) as unknown as DecisaoRegistro[], acoes, acoesAnteriores: acoes.filter((a) => a.reuniao_id !== rid && aberta(a)),
          encerradaPor: null, agora: new Date().toISOString(),
        }));
      } catch (e) {
        setErro(mensagemErro(e));
      }
    })();
  }, [rid, cadastros.pessoas, perfil?.nome]);

  if (erro) return <div className="pagina"><Aviso tipo="critico">{erro}</Aviso></div>;
  if (!ata) return <Carregando />;
  const r = ata.reuniao;

  function copiar() {
    navigator.clipboard.writeText(ataEmTexto(ata!)).then(() => notificar("Ata copiada. Cole no e-mail ou no Teams."), () => notificar("Não foi possível copiar.", "erro"));
  }

  return (
    <div className="pagina pagina-estreita ata">
      <div className="so-tela linha linha-entre">
        <Link to={`/reunioes/${rid}`} className="voltar">← Voltar à reunião</Link>
        <span className="linha">
          <button className="btn" onClick={copiar}>Copiar texto (e-mail/Teams)</button>
          <button className="btn btn-primario" onClick={() => window.print()}>Imprimir / PDF</button>
        </span>
      </div>
      {previa && <Aviso tipo="atencao">Prévia: a reunião ainda não foi encerrada. A ata definitiva é gerada ao clicar em “Encerrar e gerar ata”.</Aviso>}

      <article className="cartao ata-doc">
        <header className="ata-cabecalho">
          <img src="/logo-cor.svg" alt="Triunfo Logística" className="ata-logo" />
          <div>
            <h1>Ata de reunião</h1>
            <p className="ata-titulo">{r.titulo}</p>
          </div>
        </header>
        <dl className="infos ata-infos">
          <div className="info"><dt>Data</dt><dd>{fmtData(r.data)}{r.hora ? ` às ${r.hora.slice(0, 5)}` : ""}</dd></div>
          <div className="info"><dt>Local</dt><dd>{r.local ?? "—"}</dd></div>
          <div className="info"><dt>Participantes</dt><dd>{r.participantes.join(", ") || "—"}</dd></div>
          {r.convidados && <div className="info"><dt>Convidados</dt><dd>{r.convidados}</dd></div>}
          {r.objetivo && <div className="info"><dt>Objetivo</dt><dd>{r.objetivo}</dd></div>}
        </dl>

        <h2>1. Plano de ação</h2>
        {ata.acoes.length === 0 ? <p className="sutil">Nenhuma ação definida.</p> : (
          <table className="tabela compacta ata-tabela">
            <thead><tr><th>#</th><th>Ação</th><th>Demanda</th><th>Responsável</th><th>Prazo</th></tr></thead>
            <tbody>{ata.acoes.map((a, i) => (
              <tr key={i}><td>{i + 1}</td><td><strong>{a.descricao}</strong></td><td className="pequeno">{a.demanda ?? "Assuntos gerais"}</td>
                <td className={a.responsavel ? "" : "texto-atencao"}>{a.responsavel ?? "a definir"}</td><td className={a.prazo ? "" : "texto-atencao"}>{a.prazo ? fmtData(a.prazo) : "a definir"}</td></tr>
            ))}</tbody>
          </table>
        )}

        <h2>2. Decisões tomadas</h2>
        {ata.decisoes_tomadas.length === 0 ? <p className="sutil">Nenhuma decisão registrada nesta reunião.</p> : (
          <ul className="ata-lista">{ata.decisoes_tomadas.map((x, i) => <li key={i}><strong>{x.texto}</strong>{x.resultado ? ` → ${x.resultado}` : ""}<div className="sutil pequeno">{x.demanda}{x.por ? ` · ${x.por}` : ""}</div></li>)}</ul>
        )}

        <h2>3. Decisões a tomar</h2>
        {ata.decisoes_pendentes.length === 0 ? <p className="sutil">Nenhuma decisão pendente nas demandas da pauta.</p> : (
          <table className="tabela compacta ata-tabela">
            <thead><tr><th>Decisão</th><th>Demanda</th><th>Quem decide</th><th>Até</th></tr></thead>
            <tbody>{ata.decisoes_pendentes.map((x, i) => <tr key={i}><td><strong>{x.texto}</strong></td><td className="pequeno">{x.demanda}</td><td>{x.quem ?? "—"}</td><td>{x.prazo ? fmtData(x.prazo) : "—"}</td></tr>)}</tbody>
          </table>
        )}

        <h2>4. Pontos discutidos por demanda</h2>
        {ata.itens.length === 0 ? <p className="sutil">Pauta vazia.</p> : ata.itens.map((x, i) => (
          <div key={i} className="ata-item">
            <h3>{x.codigo} · {x.assunto}</h3>
            <p className="sutil pequeno">{x.situacao} · {x.etapa}{x.responsavel ? ` · ${x.responsavel}` : ""}{x.prazo ? ` · prazo ${fmtData(x.prazo)}` : ""}{x.motivos.length ? ` · Atenção: ${x.motivos.join(", ")}` : ""}</p>
            <p className="pre">{x.notas ?? (x.discutido ? "Discutido, sem anotações." : "Não discutido nesta reunião.")}</p>
          </div>
        ))}

        {ata.assuntos_gerais && (<><h2>5. Assuntos gerais</h2><p className="pre">{ata.assuntos_gerais}</p></>)}

        {ata.acompanhamento.length > 0 && (
          <>
            <h2>{ata.assuntos_gerais ? "6" : "5"}. Acompanhamento de ações anteriores</h2>
            <table className="tabela compacta ata-tabela">
              <thead><tr><th>Ação</th><th>Demanda</th><th>Responsável</th><th>Prazo</th><th>Situação</th></tr></thead>
              <tbody>{ata.acompanhamento.map((x, i) => <tr key={i}><td>{x.descricao}</td><td className="pequeno">{x.demanda ?? "Assuntos gerais"}</td><td>{x.responsavel ?? "—"}</td><td>{x.prazo ? fmtData(x.prazo) : "—"}</td><td>{x.situacao}</td></tr>)}</tbody>
            </table>
          </>
        )}

        <footer className="ata-rodape sutil pequeno">
          {previa ? "Prévia gerada" : "Ata gerada"} em {new Date(ata.gerada_em).toLocaleString("pt-BR")}{r.encerrada_por ? ` por ${r.encerrada_por}` : ""} · Sistema de Gestão de Engenharia — Triunfo Logística
        </footer>
      </article>
    </div>
  );
}
