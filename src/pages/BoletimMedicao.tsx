import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase, mensagemErro } from "../lib/supabase";
import { fmtData, fmtMoeda } from "../lib/dominio";
import { STATUS_MEDICAO, linhasBoletim, type ItemOC, type Medicao, type MedicaoItem, type OrdemCompra } from "../lib/medicao";
import { Aviso, Carregando } from "../components/ui";

const fmtQ = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

export default function BoletimMedicao() {
  const { id, medId } = useParams();
  const [dados, setDados] = useState<{ m: Medicao & { valor: number }; oc: OrdemCompra; itens: ItemOC[]; meds: (Medicao & { valor: number })[]; mi: MedicaoItem[]; demanda: { codigo: string; assunto: string; local_nome: string | null } } | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { data: m, error } = await supabase.from("v_medicoes").select("*").eq("id", Number(medId)).maybeSingle();
        if (error || !m) throw error ?? new Error("Medição não encontrada ou sem permissão.");
        const [oc, it, meds, dm] = await Promise.all([
          supabase.from("v_ordens_compra").select("*").eq("id", m.oc_id).single(),
          supabase.from("oc_itens").select("*").eq("oc_id", m.oc_id),
          supabase.from("v_medicoes").select("*").eq("oc_id", m.oc_id),
          supabase.from("v_demandas").select("codigo, assunto, local_nome").eq("id", Number(id)).single(),
        ]);
        const lista = (meds.data ?? []) as (Medicao & { valor: number })[];
        const mi = await supabase.from("medicao_itens").select("*").in("medicao_id", lista.map((x) => x.id));
        setDados({ m: { ...m, valor: Number(m.valor) }, oc: oc.data as OrdemCompra, itens: (it.data ?? []) as ItemOC[], meds: lista.map((x) => ({ ...x, valor: Number(x.valor) })), mi: (mi.data ?? []) as MedicaoItem[], demanda: dm.data! });
      } catch (e) {
        setErro(mensagemErro(e));
      }
    })();
  }, [id, medId]);

  if (erro) return <div className="pagina"><Aviso tipo="critico">{erro}</Aviso></div>;
  if (!dados) return <Carregando />;
  const { m, oc, itens, meds, mi, demanda } = dados;
  const linhas = linhasBoletim(m, itens, meds, mi);
  const aprovada = m.status === "aprovada" || m.status === "paga";
  const dt = (x?: string | null) => (x ? new Date(x).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
  const anteriores = meds.filter((x) => x.status !== "cancelada" && x.numero < m.numero).reduce((s, x) => s + x.valor, 0);
  const acumulado = anteriores + (m.status === "cancelada" ? 0 : m.valor);

  return (
    <div className="pagina pagina-estreita ata boletim">
      <div className="so-tela linha linha-entre">
        <Link to={`/demandas/${id}?aba=medicao`} className="voltar">← Voltar à medição</Link>
        <button className="btn btn-primario" onClick={() => window.print()}>Imprimir / PDF</button>
      </div>
      {!aprovada && <Aviso tipo="atencao">Minuta: esta medição ainda não foi aprovada pelo Gestor. O boletim sai marcado como MINUTA e não deve ser enviado como definitivo.</Aviso>}
      <article className={`cartao ata-doc${aprovada ? "" : " minuta"}`}>
        {!aprovada && <div className="marca-minuta" aria-hidden>MINUTA — AGUARDANDO APROVAÇÃO</div>}
        <header className="ata-cabecalho">
          <img src="/logo-cor.svg" alt="Triunfo Logística" className="ata-logo" />
          <div>
            <h1>Boletim de Medição nº {m.numero}</h1>
            <p className="ata-titulo">OC {oc.numero} · {STATUS_MEDICAO[m.status]}{oc.fornecedor_nome ? ` · ${oc.fornecedor_nome}` : ""}</p>
          </div>
        </header>
        <dl className="infos ata-infos">
          <div className="info"><dt>Fornecedor</dt><dd>{oc.fornecedor_nome ?? "—"}</dd></div>
          <div className="info"><dt>Demanda</dt><dd>{demanda.codigo} · {demanda.assunto}{demanda.local_nome ? ` · ${demanda.local_nome}` : ""}</dd></div>
          <div className="info"><dt>Período</dt><dd>{fmtData(m.periodo_inicio)} a {fmtData(m.periodo_fim)}</dd></div>
          <div className="info"><dt>Data da medição</dt><dd>{fmtData(m.data_medicao)}</dd></div>
          <div className="info"><dt>Valor da OC</dt><dd>{fmtMoeda(Number(oc.valor_total))}</dd></div>
          {oc.objeto && <div className="info"><dt>Objeto</dt><dd>{oc.objeto}</dd></div>}
        </dl>
        {m.descricao && <><h2>Entregas do período</h2><p className="pre">{m.descricao}</p></>}

        <h2>Planilha de medição</h2>
        {itens.length ? (
          <div className="rolagem-x">
            <table className="tabela compacta ata-tabela tabela-boletim">
              <thead>
                <tr><th rowSpan={2}>Item</th><th rowSpan={2}>Un.</th><th rowSpan={2}>Preço unit.</th><th colSpan={2}>Contratado</th><th colSpan={2}>Anterior</th><th colSpan={2}>Nesta medição</th><th colSpan={2}>Acumulado</th><th rowSpan={2}>Saldo qtd.</th></tr>
                <tr><th>Qtd.</th><th>R$</th><th>Qtd.</th><th>R$</th><th>Qtd.</th><th>R$</th><th>Qtd.</th><th>R$</th></tr>
              </thead>
              <tbody>{linhas.map((l) => (
                <tr key={l.item.id}>
                  <td>{l.item.descricao}</td><td>{l.item.unidade ?? "—"}</td><td className="num">{fmtMoeda(Number(l.item.valor_unitario))}</td>
                  <td className="num">{fmtQ(l.contratado)}</td><td className="num">{fmtMoeda(Number(l.item.valor_total ?? l.contratado * Number(l.item.valor_unitario)))}</td>
                  <td className="num">{fmtQ(l.anterior)}</td><td className="num">{fmtMoeda(l.valorAnterior)}</td>
                  <td className="num"><strong>{fmtQ(l.atual)}</strong></td><td className="num"><strong>{fmtMoeda(l.valorAtual)}</strong></td>
                  <td className="num">{fmtQ(l.acumulado)}</td><td className="num">{fmtMoeda(l.valorAcumulado)}</td>
                  <td className="num">{fmtQ(l.saldo)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="sutil">Ordem de Compra sem planilha de itens: medição lançada por valor.</p>}

        <table className="tabela compacta ata-tabela totais-boletim">
          <tbody>
            <tr><th>Valor da OC</th><td className="num">{fmtMoeda(Number(oc.valor_total))}</td></tr>
            <tr><th>Medido em medições anteriores</th><td className="num">{fmtMoeda(anteriores)}</td></tr>
            <tr className="destaque-linha"><th>Valor desta medição</th><td className="num">{fmtMoeda(m.valor)}</td></tr>
            <tr><th>Acumulado medido</th><td className="num">{fmtMoeda(acumulado)} ({Number(oc.valor_total) ? ((acumulado / Number(oc.valor_total)) * 100).toFixed(1) : "0"}%)</td></tr>
            <tr><th>Saldo da OC</th><td className="num">{fmtMoeda(Number(oc.valor_total) - acumulado)}</td></tr>
          </tbody>
        </table>
        {m.observacao && <p className="pequeno"><strong>Observação:</strong> {m.observacao}</p>}
<h2>Responsáveis</h2>
        <table className="tabela compacta ata-tabela tabela-responsaveis">
          <thead><tr><th>Etapa</th><th>Nome</th><th>Login</th><th>Data e hora</th></tr></thead>
          <tbody>
            <tr><td>Medição elaborada por</td><td><strong>{m.elaborada_por_nome ?? "—"}</strong></td><td>{m.elaborada_por_email ?? "—"}</td><td>{dt(m.enviada_em)}</td></tr>
            <tr><td>Aprovada pelo Gestor</td><td><strong>{m.aprovada_por_nome ?? "pendente"}</strong></td><td>{m.aprovada_por_email ?? "—"}</td><td>{dt(m.aprovada_em)}</td></tr>
            {m.status === "paga" && <tr><td>Pagamento registrado</td><td>{m.pagamento_por_nome ?? "—"}</td><td>—</td><td>{fmtData(m.data_pagamento)}{m.nota_fiscal ? ` · NF ${m.nota_fiscal.replace(/^NF\s*/i, "")}` : ""}</td></tr>}
          </tbody>
        </table>

        <div className="assinaturas-boletim tres">
          <div><strong>{m.elaborada_por_nome ?? " "}</strong><span>Elaborado por — Triunfo Logística</span></div>
          <div><strong>{m.aprovada_por_nome ?? " "}</strong><span>Aprovado por (Gestor) — Triunfo Logística</span></div>
          <div><strong>&nbsp;</strong><span>De acordo — {oc.fornecedor_nome ?? "Contratada"}</span></div>
        </div>
        <p className="sutil pequeno rodape-boletim">Documento gerado pelo Sistema de Gestão de Engenharia — Triunfo Logística em {new Date().toLocaleString("pt-BR")}.</p>
      </article>
    </div>
  );
}
