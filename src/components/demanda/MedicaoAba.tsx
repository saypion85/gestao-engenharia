import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase, mensagemErro } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { fmtData, fmtMoeda, hojeISO } from "../../lib/dominio";
import type { DemandaLinha } from "../../lib/filtros";
import { STATUS_MEDICAO, disponivelPorItem, linhasBoletim, resumoOC, valorMedicao, type ItemOC, type Medicao, type MedicaoItem, type OrdemCompra } from "../../lib/medicao";
import { abrirDocumento, enviarDocumento, excluirDocumento } from "../../lib/arquivos";
import { Ajuda, Aviso, Campo, Carregando, Modal, Vazio, notificar } from "../ui";

type MedV = Medicao & { valor: number };
interface Dados { ocs: OrdemCompra[]; itens: ItemOC[]; medicoes: MedV[]; medItens: MedicaoItem[]; docs: { id: number; nome: string; caminho: string; medicao_id: number }[] }

const num = (t: string) => { const v = Number(t.replace(/\./g, "").replace(",", ".")); return Number.isFinite(v) ? v : NaN; };
const fmtQ = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

function Barra({ medido, pago, total }: { medido: number; pago: number; total: number }) {
  const pm = total ? Math.min(100, (medido / total) * 100) : 0, pp = total ? Math.min(100, (pago / total) * 100) : 0;
  return (
    <div className="barra-medicao" title={`Medido ${pm.toFixed(1)}% · Pago ${pp.toFixed(1)}%`}>
      <span className="bm-medido" style={{ width: `${pm}%` }} />
      <span className="bm-pago" style={{ width: `${pp}%` }} />
    </div>
  );
}

/** Quem elaborou (enviou) e quem aprovou, com login e data. */
export function Rastro({ m }: { m: Medicao }) {
  const dt = (x?: string | null) => (x ? new Date(x).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "");
  return (
    <dl className="rastro">
      <div><dt>Elaborada por</dt><dd>{m.elaborada_por_nome ? <>{m.elaborada_por_nome} <span className="sutil">({m.elaborada_por_email})</span> · {dt(m.enviada_em)}</> : <span className="sutil">ainda não enviada</span>}</dd></div>
      <div><dt>Aprovada pelo Gestor</dt><dd>{m.aprovada_por_nome ? <>{m.aprovada_por_nome} {m.aprovada_por_email && <span className="sutil">({m.aprovada_por_email})</span>} · {dt(m.aprovada_em)}</> : <span className="sutil">pendente</span>}</dd></div>
      {m.status === "paga" && <div><dt>Pagamento</dt><dd>{fmtData(m.data_pagamento)}{m.nota_fiscal ? ` · NF ${m.nota_fiscal.replace(/^NF\s*/i, "")}` : ""}{m.pagamento_por_nome ? ` · registrado por ${m.pagamento_por_nome}` : ""}</dd></div>}
    </dl>
  );
}

function FormOC({ demanda, inicial, aoFechar, aoSalvar }: { demanda: DemandaLinha; inicial?: OrdemCompra; aoFechar: () => void; aoSalvar: () => void }) {
  const { cadastros } = useAuth();
  const [v, setV] = useState({
    numero: inicial?.numero ?? "", empresa_id: inicial?.empresa_id ?? demanda.empresa_id ?? null, fornecedor: inicial?.fornecedor ?? "",
    data_emissao: inicial?.data_emissao ?? hojeISO(), valor: inicial ? String(inicial.valor_total).replace(".", ",") : "", objeto: inicial?.objeto ?? demanda.assunto,
    situacao: inicial?.situacao ?? "vigente",
  });
  const [erro, setErro] = useState("");
  const comItens = (inicial?.qtd_itens ?? 0) > 0;

  async function salvar() {
    if (!v.numero.trim()) return setErro("Informe o número da Ordem de Compra.");
    if (!v.empresa_id && !v.fornecedor.trim()) return setErro("Informe o fornecedor.");
    const valor = comItens ? undefined : num(v.valor || "0");
    if (valor !== undefined && (isNaN(valor) || valor < 0)) return setErro("Valor inválido.");
    const dados = { numero: v.numero.trim(), empresa_id: v.empresa_id, fornecedor: v.empresa_id ? null : v.fornecedor.trim(), data_emissao: v.data_emissao || null, objeto: v.objeto || null, situacao: v.situacao, ...(valor !== undefined ? { valor_total: valor } : {}) };
    const { error } = inicial ? await supabase.from("ordens_compra").update(dados).eq("id", inicial.id) : await supabase.from("ordens_compra").insert({ ...dados, demanda_id: demanda.id });
    if (error) return setErro(error.message.includes("duplicate") ? "Já existe uma OC com este número nesta demanda." : mensagemErro(error));
    notificar(inicial ? "Ordem de Compra atualizada." : "Ordem de Compra cadastrada.");
    aoSalvar();
    aoFechar();
  }

  return (
    <Modal titulo={inicial ? `Editar OC ${inicial.numero}` : "Nova Ordem de Compra"} aoFechar={aoFechar}>
      <div className="form">
        <div className="grade-2">
          <Campo rotulo="Número da OC" obrigatorio><input value={v.numero} onChange={(e) => setV({ ...v, numero: e.target.value })} autoFocus /></Campo>
          <Campo rotulo="Emitida em"><input type="date" value={v.data_emissao ?? ""} onChange={(e) => setV({ ...v, data_emissao: e.target.value })} /></Campo>
          <Campo rotulo="Fornecedor" obrigatorio>
            <select value={v.empresa_id ?? ""} onChange={(e) => setV({ ...v, empresa_id: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Outro (digitar abaixo)</option>
              {cadastros.empresas.filter((x) => x.ativo !== false || x.id === v.empresa_id).map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
            </select>
            {!v.empresa_id && <input value={v.fornecedor} onChange={(e) => setV({ ...v, fornecedor: e.target.value })} placeholder="Nome do fornecedor" aria-label="Nome do fornecedor" />}
          </Campo>
          <Campo rotulo="Valor da OC (R$)" ajuda={comItens ? "Calculado pela planilha de itens." : "Se cadastrar a planilha de itens, o valor passa a ser a soma dos itens."}>
            <input inputMode="decimal" value={comItens ? String(inicial!.valor_total).replace(".", ",") : v.valor} disabled={comItens} onChange={(e) => setV({ ...v, valor: e.target.value })} placeholder="0,00" />
          </Campo>
          <Campo rotulo="Objeto" largo><input value={v.objeto ?? ""} onChange={(e) => setV({ ...v, objeto: e.target.value })} /></Campo>
          {inicial && (
            <Campo rotulo="Situação">
              <select value={v.situacao} onChange={(e) => setV({ ...v, situacao: e.target.value as OrdemCompra["situacao"] })}>
                <option value="vigente">Vigente</option><option value="encerrada">Encerrada</option><option value="cancelada">Cancelada</option>
              </select>
            </Campo>
          )}
        </div>
        {erro && <div className="erro-form">{erro}</div>}
        <div className="barra-acoes"><button className="btn" onClick={aoFechar}>Cancelar</button><button className="btn btn-primario" onClick={salvar}>Salvar</button></div>
      </div>
    </Modal>
  );
}

function PlanilhaItens({ oc, dados, aoFechar, aoSalvar }: { oc: OrdemCompra; dados: Dados; aoFechar: () => void; aoSalvar: () => void }) {
  const medidos = new Set(dados.medItens.filter((x) => dados.medicoes.some((m) => m.id === x.medicao_id && m.status !== "cancelada")).map((x) => x.oc_item_id));
  const [linhas, setLinhas] = useState(dados.itens.filter((i) => i.oc_id === oc.id).sort((a, b) => a.ordem - b.ordem)
    .map((i) => ({ id: i.id as number | undefined, descricao: i.descricao, unidade: i.unidade ?? "", quantidade: String(i.quantidade).replace(".", ","), valor_unitario: String(i.valor_unitario).replace(".", ","), _excluir: false })));
  const [erro, setErro] = useState("");
  const total = linhas.filter((l) => !l._excluir).reduce((s, l) => s + (num(l.quantidade) || 0) * (num(l.valor_unitario) || 0), 0);
  const temMedicaoSemItens = dados.medicoes.some((m) => m.oc_id === oc.id && m.status !== "cancelada" && m.valor_informado !== null);

  async function salvar() {
    for (const l of linhas.filter((x) => !x._excluir)) {
      if (!l.descricao.trim()) return setErro("Todo item precisa de descrição.");
      if (!(num(l.quantidade) > 0)) return setErro(`“${l.descricao}”: quantidade precisa ser maior que zero.`);
      if (!(num(l.valor_unitario) >= 0)) return setErro(`“${l.descricao}”: preço unitário inválido.`);
    }
    try {
      for (const [k, l] of linhas.entries()) {
        const campos = { descricao: l.descricao.trim(), unidade: l.unidade || null, quantidade: num(l.quantidade), valor_unitario: num(l.valor_unitario), ordem: k };
        if (l._excluir && l.id) { const r = await supabase.from("oc_itens").delete().eq("id", l.id); if (r.error) throw r.error; }
        else if (!l._excluir && l.id) { const r = await supabase.from("oc_itens").update(campos).eq("id", l.id); if (r.error) throw r.error; }
        else if (!l._excluir) { const r = await supabase.from("oc_itens").insert({ ...campos, oc_id: oc.id }); if (r.error) throw r.error; }
      }
      notificar("Planilha da OC salva.");
      aoSalvar();
      aoFechar();
    } catch (e) {
      setErro(mensagemErro(e).includes("violates foreign key") ? "Não é possível excluir um item que já foi medido." : mensagemErro(e));
    }
  }
  const mudar = (k: number, p: Partial<(typeof linhas)[number]>) => setLinhas((x) => x.map((l, j) => (j === k ? { ...l, ...p } : l)));

  return (
    <Modal titulo={`Planilha da OC ${oc.numero}`} aoFechar={aoFechar} largo>
      <p className="sutil pequeno">Itens contratados com unidade, quantidade e preço unitário. As medições passam a ser feitas por quantidade em cada item, e o valor da OC vira a soma da planilha.</p>
      {temMedicaoSemItens && <Aviso tipo="atencao">Esta OC já tem medição lançada por valor. Ao cadastrar itens, as próximas medições serão por quantidade.</Aviso>}
      <div className="tabela-rolagem">
        <table className="tabela compacta tabela-form">
          <thead><tr><th>Descrição</th><th>Un.</th><th>Quantidade</th><th>Preço unitário (R$)</th><th>Total</th><th /></tr></thead>
          <tbody>{linhas.map((l, k) => l._excluir ? null : (
            <tr key={k}>
              <td><input value={l.descricao} onChange={(e) => mudar(k, { descricao: e.target.value })} aria-label="Descrição do item" /></td>
              <td><input value={l.unidade} onChange={(e) => mudar(k, { unidade: e.target.value })} className="input-qtd" aria-label="Unidade" placeholder="m², un…" /></td>
              <td><input inputMode="decimal" value={l.quantidade} onChange={(e) => mudar(k, { quantidade: e.target.value })} className="input-qtd" aria-label="Quantidade contratada" /></td>
              <td><input inputMode="decimal" value={l.valor_unitario} onChange={(e) => mudar(k, { valor_unitario: e.target.value })} className="input-qtd" aria-label="Preço unitário" /></td>
              <td className="num">{fmtMoeda((num(l.quantidade) || 0) * (num(l.valor_unitario) || 0))}</td>
              <td>{l.id && medidos.has(l.id) ? <span className="sutil pequeno" title="Item já medido">medido</span> :
                <button className="btn-icone" onClick={() => (l.id ? mudar(k, { _excluir: true }) : setLinhas((x) => x.filter((_, j) => j !== k)))} aria-label="Remover item">✕</button>}</td>
            </tr>
          ))}</tbody>
          <tfoot><tr><th colSpan={4}>Total da OC</th><th className="num">{fmtMoeda(total)}</th><th /></tr></tfoot>
        </table>
      </div>
      <button className="btn btn-link" onClick={() => setLinhas((x) => [...x, { id: undefined, descricao: "", unidade: "", quantidade: "", valor_unitario: "", _excluir: false }])}>+ Item</button>
      {erro && <div className="erro-form">{erro}</div>}
      <div className="barra-acoes"><button className="btn" onClick={aoFechar}>Cancelar</button><button className="btn btn-primario" onClick={salvar}>Salvar planilha</button></div>
    </Modal>
  );
}

function EditorMedicao({ demanda, oc, m, dados, aoFechar, aoSalvar }: { demanda: DemandaLinha; oc: OrdemCompra; m: MedV; dados: Dados; aoFechar: () => void; aoSalvar: () => void }) {
  const { eGestor, perfil } = useAuth();
  const [motivo, setMotivo] = useState("");
  const [devolvendo, setDevolvendo] = useState(false);
  const itens = dados.itens.filter((i) => i.oc_id === oc.id);
  const medsOC = dados.medicoes.filter((x) => x.oc_id === oc.id);
  const editavel = m.status === "em_elaboracao";
  const [v, setV] = useState({ periodo_inicio: m.periodo_inicio ?? "", periodo_fim: m.periodo_fim ?? "", data_medicao: m.data_medicao, descricao: m.descricao ?? "", valor: m.valor_informado !== null ? String(m.valor_informado).replace(".", ",") : "", observacao: m.observacao ?? "" });
  const [qtd, setQtd] = useState<Record<number, string>>(Object.fromEntries(itens.map((i) => [i.id, String(dados.medItens.find((x) => x.medicao_id === m.id && x.oc_item_id === i.id)?.quantidade ?? "").replace(".", ",")])));
  const [pag, setPag] = useState({ nf: m.nota_fiscal ?? "", data: m.data_pagamento ?? hojeISO() });
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const qtdNum = Object.fromEntries(Object.entries(qtd).map(([k, x]) => [Number(k), x.trim() ? num(x) : 0]));
  const linhas = linhasBoletim(m, itens, medsOC, dados.medItens, qtdNum);
  const valorAtual = itens.length ? linhas.reduce((s, l) => s + l.valorAtual, 0) : num(v.valor || "0") || 0;
  const outros = medsOC.filter((x) => x.id !== m.id && x.status !== "cancelada").reduce((s, x) => s + x.valor, 0);
  const saldoDepois = Number(oc.valor_total) - outros - valorAtual;
  const docs = dados.docs.filter((d) => d.medicao_id === m.id);

  async function salvar(novoStatus?: string, extra: Record<string, unknown> = {}) {
    setErro("");
    try {
      if (editavel) {
        if (v.periodo_inicio && v.periodo_fim && v.periodo_fim < v.periodo_inicio) throw new Error("O fim do período é anterior ao início.");
        if (itens.length) {
          for (const it of itens) {
            const q = qtdNum[it.id] ?? 0;
            if (isNaN(q) || q < 0) throw new Error(`“${it.descricao}”: quantidade inválida.`);
            const disp = disponivelPorItem(it.id, it, m.id, medsOC, dados.medItens);
            if (q > disp + 0.0005) throw new Error(`“${it.descricao}”: só restam ${fmtQ(disp)} ${it.unidade ?? ""} para medir.`);
          }
        } else if (isNaN(num(v.valor || "0"))) throw new Error("Valor inválido.");
        const r = await supabase.from("medicoes").update({
          periodo_inicio: v.periodo_inicio || null, periodo_fim: v.periodo_fim || null, data_medicao: v.data_medicao || hojeISO(),
          descricao: v.descricao || null, observacao: v.observacao || null, valor_informado: itens.length ? null : num(v.valor || "0"),
        }).eq("id", m.id);
        if (r.error) throw r.error;
        if (itens.length) {
          for (const it of itens) {
            const q = qtdNum[it.id] ?? 0;
            const r2 = q > 0
              ? await supabase.from("medicao_itens").upsert({ medicao_id: m.id, oc_item_id: it.id, quantidade: q })
              : await supabase.from("medicao_itens").delete().eq("medicao_id", m.id).eq("oc_item_id", it.id);
            if (r2.error) throw r2.error;
          }
        }
      }
      if (novoStatus) {
        const r = await supabase.from("medicoes").update({ status: novoStatus, ...extra }).eq("id", m.id);
        if (r.error) throw r.error;
      }
      notificar(novoStatus === "aguardando_aprovacao" ? "Medição enviada para aprovação do Gestor." : novoStatus === "aprovada" ? "Medição aprovada." : novoStatus === "paga" ? "Pagamento registrado." : novoStatus === "em_elaboracao" ? "Medição reaberta para ajustes." : novoStatus === "cancelada" ? "Medição cancelada." : "Medição salva.");
      aoSalvar();
      if (novoStatus) aoFechar();
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  async function excluir() {
    if (!confirm(`Excluir a medição nº ${m.numero}?`)) return;
    for (const d of docs) await excluirDocumento(d.id, d.caminho).catch(() => null);
    const r = await supabase.from("medicao_itens").delete().eq("medicao_id", m.id);
    if (r.error) return setErro(mensagemErro(r.error));
    const r2 = await supabase.from("medicoes").delete().eq("id", m.id);
    if (r2.error) return setErro(mensagemErro(r2.error));
    aoSalvar();
    aoFechar();
  }

  async function anexar(lista: FileList | null) {
    if (!lista?.length) return;
    setEnviando(true);
    try {
      for (const arquivo of Array.from(lista)) await enviarDocumento({ demandaId: demanda.id, medicaoId: m.id, arquivo, categoria: "nota_fiscal", descricao: `Medição nº ${m.numero} · OC ${oc.numero}` });
      notificar("Anexo enviado.");
      aoSalvar();
    } catch (e) { notificar(mensagemErro(e), "erro"); } finally { setEnviando(false); }
  }

  return (
    <Modal titulo={`Medição nº ${m.numero} · OC ${oc.numero}`} aoFechar={aoFechar} largo>
      <div className="form">
        <div className="linha linha-entre">
          <span className={`badge med-${m.status}`}>{STATUS_MEDICAO[m.status]}</span>
          <Link to={`/demandas/${demanda.id}/medicao/${m.id}`} className="btn" target="_blank">{m.status === "aprovada" || m.status === "paga" ? "PDF para a contratada" : "Prévia do boletim (minuta)"}</Link>
        </div>
        <Rastro m={m} />
        {m.status === "em_elaboracao" && m.devolucao_motivo && <Aviso tipo="atencao">Devolvida por {m.devolvida_por_nome ?? "Gestor"}{m.devolvida_em ? ` em ${new Date(m.devolvida_em).toLocaleString("pt-BR")}` : ""}: <strong>{m.devolucao_motivo}</strong></Aviso>}
        {m.status === "aguardando_aprovacao" && !eGestor && <Aviso tipo="info">Enviada para aprovação. Só o Gestor pode aprovar ou devolver.</Aviso>}
        <div className="grade-3">
          <Campo rotulo="Período de"><input type="date" value={v.periodo_inicio} disabled={!editavel} onChange={(e) => setV({ ...v, periodo_inicio: e.target.value })} /></Campo>
          <Campo rotulo="até"><input type="date" value={v.periodo_fim} disabled={!editavel} onChange={(e) => setV({ ...v, periodo_fim: e.target.value })} /></Campo>
          <Campo rotulo="Data da medição"><input type="date" value={v.data_medicao} disabled={!editavel} onChange={(e) => setV({ ...v, data_medicao: e.target.value })} /></Campo>
        </div>
        <Campo rotulo="Entregas realizadas no período"><textarea rows={2} value={v.descricao} disabled={!editavel} onChange={(e) => setV({ ...v, descricao: e.target.value })} placeholder="O que o fornecedor entregou e está sendo medido" /></Campo>

        {itens.length ? (
          <div className="tabela-rolagem">
            <table className="tabela compacta tabela-medicao">
              <thead><tr><th>Item</th><th>Un.</th><th>Contratado</th><th>Medido antes</th><th>Nesta medição</th><th>Acumulado</th><th>Saldo</th><th>Valor nesta</th></tr></thead>
              <tbody>{linhas.map((l) => (
                <tr key={l.item.id} className={l.saldo < -0.0005 ? "linha-erro" : ""}>
                  <td>{l.item.descricao}<div className="sutil pequeno">{fmtMoeda(Number(l.item.valor_unitario))}/{l.item.unidade ?? "un"}</div></td>
                  <td>{l.item.unidade ?? "—"}</td>
                  <td className="num">{fmtQ(l.contratado)}</td>
                  <td className="num">{fmtQ(l.anterior)}</td>
                  <td>{editavel ? <input inputMode="decimal" className="input-qtd" value={qtd[l.item.id] ?? ""} onChange={(e) => setQtd({ ...qtd, [l.item.id]: e.target.value })} aria-label={`Quantidade medida de ${l.item.descricao}`} placeholder="0" /> : <span className="num">{fmtQ(l.atual)}</span>}</td>
                  <td className="num">{fmtQ(l.acumulado)} <small className="sutil">({l.percentual.toFixed(0)}%)</small></td>
                  <td className={`num${l.saldo < -0.0005 ? " texto-critico" : ""}`}>{fmtQ(l.saldo)}</td>
                  <td className="num"><strong>{fmtMoeda(l.valorAtual)}</strong></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : (
          <Campo rotulo="Valor desta medição (R$)" ajuda="Esta OC não tem planilha de itens: a medição é lançada por valor. Cadastre a planilha para medir por quantidade.">
            <input inputMode="decimal" value={v.valor} disabled={!editavel} onChange={(e) => setV({ ...v, valor: e.target.value })} placeholder="0,00" />
          </Campo>
        )}
        <div className="resumo-numeros">
          <div><span className="sutil pequeno">Valor desta medição</span><strong>{fmtMoeda(valorAtual)}</strong></div>
          <div><span className="sutil pequeno">Medido nas demais</span><strong>{fmtMoeda(outros)}</strong></div>
          <div><span className="sutil pequeno">Saldo da OC depois desta</span><strong className={saldoDepois < -0.005 ? "texto-critico" : ""}>{fmtMoeda(saldoDepois)}</strong></div>
        </div>
        {saldoDepois < -0.005 && <Aviso tipo="critico">O valor medido passa o valor da OC. Ajuste as quantidades/valor ou faça um aditivo na OC.</Aviso>}
        <Campo rotulo="Observação"><input value={v.observacao} disabled={m.status === "paga"} onChange={(e) => setV({ ...v, observacao: e.target.value })} /></Campo>

        {m.status === "aprovada" && (
          <div className="grade-2 pagamento">
            <Campo rotulo="Nota fiscal"><input value={pag.nf} onChange={(e) => setPag({ ...pag, nf: e.target.value })} placeholder="Nº da NF" /></Campo>
            <Campo rotulo="Data do pagamento"><input type="date" value={pag.data} onChange={(e) => setPag({ ...pag, data: e.target.value })} /></Campo>
          </div>
        )}
        {m.status === "paga" && <p><strong>Paga</strong> em {fmtData(m.data_pagamento)}{m.nota_fiscal ? ` · NF ${m.nota_fiscal.replace(/^NF\s*/i, "")}` : ""}</p>}

        <div className="campo">
          <span className="campo-rotulo">Anexos (NF, boletim assinado, fotos)</span>
          <ul className="docs">{docs.map((d) => (
            <li key={d.id}><span className="doc-icone" aria-hidden>📄</span><div className="doc-corpo"><button className="btn-texto" onClick={() => abrirDocumento(d.caminho)}>{d.nome}</button></div>
              <button className="btn-icone" onClick={async () => { await excluirDocumento(d.id, d.caminho).catch((e) => notificar(mensagemErro(e), "erro")); aoSalvar(); }} aria-label="Excluir anexo">✕</button></li>
          ))}</ul>
          <label className={`area-envio${enviando ? " ocupado" : ""}`}>
            <input type="file" multiple disabled={enviando} onChange={(e) => anexar(e.target.files)} />
            {enviando ? "Enviando…" : <>📎 <strong>Anexar arquivo</strong></>}
          </label>
        </div>

        {devolvendo && (
          <div className="linha devolucao">
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="O que precisa ser ajustado?" aria-label="Motivo da devolução" autoFocus />
            <button className="btn" onClick={() => setDevolvendo(false)}>Cancelar</button>
            <button className="btn btn-primario" disabled={!motivo.trim()} onClick={() => salvar("em_elaboracao", { devolucao_motivo: motivo.trim() })}>Devolver</button>
          </div>
        )}
        {erro && <div className="erro-form" role="alert">{erro}</div>}
        <div className="barra-acoes">
          {editavel && <button className="btn btn-perigo-link" onClick={excluir}>Excluir</button>}
          {m.status !== "cancelada" && m.status !== "paga" && <button className="btn btn-perigo-link" onClick={() => confirm("Cancelar esta medição? Ela deixa de contar no medido da OC.") && salvar("cancelada")}>Cancelar medição</button>}
          {(m.status === "cancelada" || (m.status === "aprovada" && eGestor)) && <button className="btn" onClick={() => salvar("em_elaboracao")}>Voltar para elaboração</button>}
          {m.status === "aguardando_aprovacao" && !eGestor && m.elaborada_por === perfil?.id && <button className="btn" onClick={() => salvar("em_elaboracao")}>Retirar da aprovação</button>}
          {m.status === "paga" && eGestor && <button className="btn" onClick={() => confirm("Desfazer o registro de pagamento?") && salvar("aprovada", { data_pagamento: null, nota_fiscal: m.nota_fiscal })}>Desfazer pagamento</button>}
          <button className="btn" onClick={aoFechar}>Fechar</button>
          {editavel && <button className="btn" onClick={() => salvar()}>Salvar</button>}
          {editavel && <button className="btn btn-primario" disabled={valorAtual <= 0 || saldoDepois < -0.005} onClick={() => salvar("aguardando_aprovacao")}>Enviar para aprovação do Gestor</button>}
          {m.status === "aguardando_aprovacao" && eGestor && !devolvendo && <button className="btn" onClick={() => setDevolvendo(true)}>Devolver para ajuste</button>}
          {m.status === "aguardando_aprovacao" && eGestor && <button className="btn btn-primario" onClick={() => salvar("aprovada")}>Aprovar medição</button>}
          {m.status === "aprovada" && <button className="btn btn-primario" onClick={() => salvar("paga", { nota_fiscal: pag.nf || null, data_pagamento: pag.data || hojeISO() })}>Registrar pagamento</button>}
        </div>
      </div>
    </Modal>
  );
}

function PendentesGestor({ medicoes, abrir }: { medicoes: MedV[]; abrir: (id: number) => void }) {
  const { eGestor } = useAuth();
  const pend = medicoes.filter((m) => m.status === "aguardando_aprovacao");
  if (!pend.length) return null;
  return (
    <Aviso tipo="atencao">
      {pend.length} medição(ões) aguardando aprovação do Gestor{eGestor ? ": " : "."}
      {eGestor && pend.map((m) => <button key={m.id} className="btn-link" onClick={() => abrir(m.id)}>nº {m.numero} ({fmtMoeda(m.valor)})</button>)}
    </Aviso>
  );
}

export default function MedicaoAba({ d }: { d: DemandaLinha }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [formOC, setFormOC] = useState<OrdemCompra | "nova" | null>(null);
  const [planilha, setPlanilha] = useState<OrdemCompra | null>(null);
  const [aberta, setAberta] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    try {
      const { data: ocs, error } = await supabase.from("v_ordens_compra").select("*").eq("demanda_id", d.id).order("data_emissao", { nullsFirst: false }).order("id");
      if (error) throw error;
      const ids = (ocs ?? []).map((o) => o.id);
      const [it, md, docs] = await Promise.all([
        ids.length ? supabase.from("oc_itens").select("*").in("oc_id", ids) : Promise.resolve({ data: [] }),
        ids.length ? supabase.from("v_medicoes").select("*").in("oc_id", ids).order("numero") : Promise.resolve({ data: [] }),
        supabase.from("documentos").select("id, nome, caminho, medicao_id").eq("demanda_id", d.id).not("medicao_id", "is", null),
      ]);
      const meds = (md.data ?? []) as MedV[];
      const mi = meds.length ? await supabase.from("medicao_itens").select("*").in("medicao_id", meds.map((m) => m.id)) : { data: [] };
      setDados({ ocs: (ocs ?? []) as OrdemCompra[], itens: (it.data ?? []) as ItemOC[], medicoes: meds.map((m) => ({ ...m, valor: Number(m.valor) })), medItens: (mi.data ?? []) as MedicaoItem[], docs: (docs.data ?? []) as Dados["docs"] });
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }, [d.id]);
  useEffect(() => { carregar(); }, [carregar]);

  async function novaMedicao(oc: OrdemCompra) {
    const ult = dados!.medicoes.filter((m) => m.oc_id === oc.id).sort((a, b) => b.numero - a.numero)[0];
    const inicio = ult?.periodo_fim ? new Date(new Date(ult.periodo_fim + "T00:00:00Z").getTime() + 86400000).toISOString().slice(0, 10) : null;
    const { data, error } = await supabase.from("medicoes").insert({ oc_id: oc.id, periodo_inicio: inicio, periodo_fim: hojeISO(), data_medicao: hojeISO(), valor_informado: (oc.qtd_itens ?? 0) > 0 ? null : 0 }).select("id").single();
    if (error) return notificar(mensagemErro(error), "erro");
    await carregar();
    setAberta(data.id);
  }

  if (erro) return <Aviso tipo="critico">{erro}</Aviso>;
  if (!dados) return <Carregando />;

  const validas = dados.ocs.filter((o) => o.situacao !== "cancelada");
  const total = validas.reduce((s, o) => s + Number(o.valor_total), 0);
  const medido = validas.reduce((s, o) => s + Number(o.medido ?? 0), 0);
  const pago = validas.reduce((s, o) => s + Number(o.pago ?? 0), 0);
  const aprovadoAPagar = validas.reduce((s, o) => s + Number(o.aprovado ?? 0) - Number(o.pago ?? 0), 0);
  const mAberta = dados.medicoes.find((m) => m.id === aberta);

  return (
    <div className="resumo">
      <section className="cartao">
        <div className="linha linha-entre">
          <h2>Medição <Ajuda>Controle financeiro do serviço contratado: a Ordem de Compra define o valor (e, se quiser, a planilha de itens); cada medição paga o fornecedor pelo que foi entregue no período. Visível só para Gestor e Engenheiro.</Ajuda></h2>
          <button className="btn btn-primario" onClick={() => setFormOC("nova")}>+ Ordem de Compra</button>
        </div>
        <div className="resumo-numeros">
          <div><span className="sutil pequeno">Valor contratado (OCs)</span><strong>{fmtMoeda(total)}</strong></div>
          <div><span className="sutil pequeno">Medido</span><strong>{fmtMoeda(medido)}</strong><span className="sutil pequeno">{total ? `${((medido / total) * 100).toFixed(1)}%` : ""}</span></div>
          <div><span className="sutil pequeno">Aprovado a pagar</span><strong className={aprovadoAPagar > 0 ? "texto-atencao" : ""}>{fmtMoeda(aprovadoAPagar)}</strong></div>
          <div><span className="sutil pequeno">Pago</span><strong>{fmtMoeda(pago)}</strong><span className="sutil pequeno">{total ? `${((pago / total) * 100).toFixed(1)}%` : ""}</span></div>
          <div><span className="sutil pequeno">Saldo a medir</span><strong>{fmtMoeda(total - medido)}</strong></div>
        </div>
        {total > 0 && <><Barra medido={medido} pago={pago} total={total} /><div className="legenda"><span><i className="leg-medido" />Medido</span><span><i className="leg-pago" />Pago</span></div></>}
      </section>

      <PendentesGestor medicoes={dados.medicoes} abrir={setAberta} />
      {dados.ocs.length === 0 && <Vazio titulo="Nenhuma Ordem de Compra cadastrada">Cadastre a OC emitida para o fornecedor para começar a medir.</Vazio>}

      {dados.ocs.map((oc) => {
        const meds = dados.medicoes.filter((m) => m.oc_id === oc.id);
        const r = resumoOC(oc, meds);
        return (
          <section key={oc.id} className={`cartao oc${oc.situacao === "cancelada" ? " oc-cancelada" : ""}`}>
            <div className="linha linha-entre">
              <div>
                <h2>OC {oc.numero} <span className={`badge oc-${oc.situacao}`}>{oc.situacao === "vigente" ? "Vigente" : oc.situacao === "encerrada" ? "Encerrada" : "Cancelada"}</span></h2>
                <p className="sutil pequeno">{oc.fornecedor_nome ?? "Fornecedor não informado"}{oc.data_emissao ? ` · emitida em ${fmtData(oc.data_emissao)}` : ""}{oc.objeto ? ` · ${oc.objeto}` : ""}</p>
              </div>
              <span className="linha">
                <button className="btn" onClick={() => setPlanilha(oc)}>Planilha ({oc.qtd_itens ?? 0} itens)</button>
                <button className="btn" onClick={() => setFormOC(oc)}>Editar OC</button>
                {oc.situacao === "vigente" && <button className="btn btn-primario" onClick={() => novaMedicao(oc)}>+ Nova medição</button>}
              </span>
            </div>
            <div className="resumo-numeros">
              <div><span className="sutil pequeno">Valor da OC</span><strong>{fmtMoeda(r.contratado)}</strong></div>
              <div><span className="sutil pequeno">Medido</span><strong>{fmtMoeda(r.medido)}</strong><span className="sutil pequeno">{r.pctMedido.toFixed(1)}%</span></div>
              <div><span className="sutil pequeno">Pago</span><strong>{fmtMoeda(r.pago)}</strong><span className="sutil pequeno">{r.pctPago.toFixed(1)}%</span></div>
              <div><span className="sutil pequeno">Saldo</span><strong>{fmtMoeda(r.saldo)}</strong></div>
            </div>
            <Barra medido={r.medido} pago={r.pago} total={r.contratado} />
            {meds.length === 0 ? <p className="sutil">Nenhuma medição ainda.</p> : (
              <div className="tabela-rolagem">
                <table className="tabela compacta">
                  <thead><tr><th>Nº</th><th>Período</th><th>Entregas</th><th>Valor</th><th>Situação</th><th>Elaborada / aprovada</th><th>NF / pagamento</th><th /></tr></thead>
                  <tbody>{meds.map((m) => (
                    <tr key={m.id} className={m.status === "cancelada" ? "inativo" : ""}>
                      <td><strong>{m.numero}</strong></td>
                      <td className="pequeno">{m.periodo_inicio || m.periodo_fim ? `${fmtData(m.periodo_inicio)} a ${fmtData(m.periodo_fim)}` : fmtData(m.data_medicao)}</td>
                      <td className="pequeno">{m.descricao?.slice(0, 80) ?? "—"}</td>
                      <td className="num"><strong>{fmtMoeda(valorMedicao(m, dados.itens.filter((i) => i.oc_id === oc.id), dados.medItens))}</strong></td>
                      <td><span className={`badge med-${m.status}`}>{STATUS_MEDICAO[m.status]}</span></td>
                      <td className="pequeno">{m.elaborada_por_nome ?? "—"}{m.aprovada_por_nome ? <> / <strong>{m.aprovada_por_nome}</strong></> : ""}</td>
                      <td className="pequeno">{m.status === "paga" ? `${m.nota_fiscal ? `NF ${m.nota_fiscal.replace(/^NF\s*/i, "")} · ` : ""}${fmtData(m.data_pagamento)}` : "—"}</td>
                      <td className="acoes-medicao">
                        <button className="btn btn-link pequeno" onClick={() => setAberta(m.id)}>Abrir</button>
                        {m.status !== "cancelada" && <Link className="btn-chip" to={`/demandas/${d.id}/medicao/${m.id}`} target="_blank" title={m.status === "aprovada" || m.status === "paga" ? "Boletim para imprimir ou salvar em PDF e enviar à contratada" : "Prévia (minuta): ainda não aprovada pelo Gestor"}>{m.status === "aprovada" || m.status === "paga" ? "PDF" : "Minuta"}</Link>}
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}

      {formOC && <FormOC demanda={d} inicial={formOC === "nova" ? undefined : formOC} aoFechar={() => setFormOC(null)} aoSalvar={carregar} />}
      {planilha && <PlanilhaItens oc={planilha} dados={dados} aoFechar={() => setPlanilha(null)} aoSalvar={carregar} />}
      {mAberta && <EditorMedicao key={mAberta.id + mAberta.status} demanda={d} oc={dados.ocs.find((o) => o.id === mAberta.oc_id)!} m={mAberta} dados={dados} aoFechar={() => setAberta(null)} aoSalvar={carregar} />}
    </div>
  );
}
