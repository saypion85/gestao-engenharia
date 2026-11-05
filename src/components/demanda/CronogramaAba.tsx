import { useCallback, useEffect, useState } from "react";
import { supabase, mensagemErro } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { FLUXO, fmtData, hojeISO } from "../../lib/dominio";
import type { DemandaLinha } from "../../lib/filtros";
import { SITUACAO_ITEM, desvioDias, itensIniciais, periodo, situacaoItem, type ItemCronograma } from "../../lib/cronograma";
import Gantt, { LegendaGantt, type LinhaGantt } from "../Gantt";
import { Ajuda, Aviso, Carregando, notificar } from "../ui";

type Item = ItemCronograma & { id?: number; _novo?: boolean; _excluir?: boolean };

export function linhaGantt(i: ItemCronograma, d: Pick<DemandaLinha, "etapa" | "situacao" | "forma_execucao">, hoje: string): LinhaGantt & { desvio: number | null; sit: ReturnType<typeof situacaoItem> } {
  const ordemFluxo = FLUXO[d.forma_execucao];
  const passou = !!i.etapa && (d.situacao === "concluida" || ordemFluxo.indexOf(i.etapa) < ordemFluxo.indexOf(d.etapa));
  const sit = situacaoItem(i, hoje, passou);
  const prev: [string, string] | null = i.inicio_previsto || i.fim_previsto ? [i.inicio_previsto ?? i.fim_previsto!, i.fim_previsto ?? i.inicio_previsto!] : null;
  const real: [string, string | null] | null = i.inicio_real ? [i.inicio_real, i.fim_real] : i.fim_real ? [i.fim_real, i.fim_real] : null;
  const desvio = desvioDias(i, hoje);
  return {
    chave: String(i.id ?? i.ordem), nome: i.nome, previsto: prev, realizado: real, tom: SITUACAO_ITEM[sit].tom,
    situacao: SITUACAO_ITEM[sit].nome + (desvio && desvio > 0 ? ` (${desvio} dias)` : ""),
    sub: <span className={`tom-texto-${SITUACAO_ITEM[sit].tom}`}>{SITUACAO_ITEM[sit].nome}{desvio && desvio > 0 ? ` · ${desvio}d` : ""}</span>,
    destaque: i.etapa === d.etapa && d.situacao !== "concluida", desvio, sit,
  };
}

export default function CronogramaAba({ d }: { d: DemandaLinha }) {
  const { podeEditar } = useAuth();
  const [itens, setItens] = useState<Item[] | null>(null);
  const [edicao, setEdicao] = useState<Item[] | null>(null);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const hoje = hojeISO();

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from("cronograma").select("*").eq("demanda_id", d.id).order("ordem").order("id");
    if (error) setErro(mensagemErro(error));
    else setItens(data as Item[]);
  }, [d.id]);
  useEffect(() => { carregar(); }, [carregar]);

  async function criar() {
    const novos = itensIniciais(d, hoje);
    const { error } = await supabase.from("cronograma").insert(novos);
    if (error) return notificar(mensagemErro(error), "erro");
    await carregar();
    notificar("Cronograma criado. Agora informe as datas previstas.");
    const { data } = await supabase.from("cronograma").select("*").eq("demanda_id", d.id).order("ordem").order("id");
    setEdicao((data as Item[]) ?? []);
  }

  async function salvar() {
    if (!edicao) return;
    for (const i of edicao) {
      if (!i.nome.trim()) return notificar("Todo item precisa de um nome.", "erro");
      if (i.inicio_previsto && i.fim_previsto && i.fim_previsto < i.inicio_previsto) return notificar(`“${i.nome}”: fim previsto antes do início.`, "erro");
      if (i.inicio_real && i.fim_real && i.fim_real < i.inicio_real) return notificar(`“${i.nome}”: fim realizado antes do início.`, "erro");
    }
    setSalvando(true);
    try {
      const campos = (i: Item) => ({ nome: i.nome.trim(), ordem: i.ordem, inicio_previsto: i.inicio_previsto || null, fim_previsto: i.fim_previsto || null, inicio_real: i.inicio_real || null, fim_real: i.fim_real || null, observacao: i.observacao || null });
      for (const i of edicao) {
        if (i._excluir && i.id) { const r = await supabase.from("cronograma").delete().eq("id", i.id); if (r.error) throw r.error; }
        else if (i._novo && !i._excluir) { const r = await supabase.from("cronograma").insert({ demanda_id: d.id, etapa: null, ...campos(i) }); if (r.error) throw r.error; }
        else if (i.id && !i._excluir) { const r = await supabase.from("cronograma").update(campos(i)).eq("id", i.id); if (r.error) throw r.error; }
      }
      notificar("Cronograma salvo.");
      setEdicao(null);
      carregar();
    } catch (e) {
      notificar(mensagemErro(e), "erro");
    } finally {
      setSalvando(false);
    }
  }

  if (erro) return <Aviso tipo="critico">{erro}</Aviso>;
  if (!itens) return <Carregando />;

  if (!itens.length && !edicao) {
    return (
      <section className="cartao">
        <h2>Cronograma</h2>
        <p>Esta demanda ainda não tem cronograma.</p>
        {podeEditar ? (
          <>
            <p className="sutil pequeno">O cronograma é criado com as etapas do fluxo ({d.forma_execucao === "interna" ? "execução interna" : "serviço contratado"}). Datas já conhecidas (recebimento, início e fim da execução) entram como realizadas. Depois é só informar as datas previstas.</p>
            <button className="btn btn-primario" onClick={criar}>Criar cronograma</button>
          </>
        ) : <p className="sutil pequeno">Peça ao responsável da demanda para criar o cronograma.</p>}
      </section>
    );
  }

  if (edicao) {
    const mudar = (k: number, p: Partial<Item>) => setEdicao((x) => x!.map((i, j) => (j === k ? { ...i, ...p } : i)));
    return (
      <section className="cartao">
        <h2>Editar cronograma</h2>
        <p className="sutil pequeno">Previsto = o planejado. Realizado = o que aconteceu de fato. Ao mudar a etapa da demanda, o sistema preenche o realizado sozinho (fim da etapa anterior e início da nova), se estiver vazio.</p>
        <div className="tabela-rolagem">
          <table className="tabela compacta tabela-cronograma">
            <thead>
              <tr><th>Etapa / item</th><th>Início previsto</th><th>Fim previsto</th><th>Início realizado</th><th>Fim realizado</th><th>Observação</th><th /></tr>
            </thead>
            <tbody>
              {edicao.map((i, k) => i._excluir ? null : (
                <tr key={i.id ?? `n${k}`}>
                  <td>{i.etapa ? <strong>{i.nome}</strong> : <input value={i.nome} onChange={(e) => mudar(k, { nome: e.target.value })} aria-label="Nome do item" placeholder="Ex.: Mobilização" />}</td>
                  <td><input type="date" value={i.inicio_previsto ?? ""} onChange={(e) => mudar(k, { inicio_previsto: e.target.value || null })} aria-label={`Início previsto de ${i.nome}`} /></td>
                  <td><input type="date" value={i.fim_previsto ?? ""} onChange={(e) => mudar(k, { fim_previsto: e.target.value || null })} aria-label={`Fim previsto de ${i.nome}`} /></td>
                  <td><input type="date" value={i.inicio_real ?? ""} onChange={(e) => mudar(k, { inicio_real: e.target.value || null })} aria-label={`Início realizado de ${i.nome}`} /></td>
                  <td><input type="date" value={i.fim_real ?? ""} onChange={(e) => mudar(k, { fim_real: e.target.value || null })} aria-label={`Fim realizado de ${i.nome}`} /></td>
                  <td><input value={i.observacao ?? ""} onChange={(e) => mudar(k, { observacao: e.target.value || null })} aria-label={`Observação de ${i.nome}`} /></td>
                  <td>{!i.etapa && <button className="btn-icone" onClick={() => (i._novo ? setEdicao((x) => x!.filter((_, j) => j !== k)) : mudar(k, { _excluir: true }))} aria-label="Remover item">✕</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className="btn btn-link" onClick={() => setEdicao((x) => [...x!, { demanda_id: d.id, etapa: null, nome: "", ordem: Math.max(0, ...x!.map((i) => i.ordem)) + 10, inicio_previsto: null, fim_previsto: null, inicio_real: null, fim_real: null, observacao: null, _novo: true }])}>
          + Item personalizado (ex.: mobilização, entrega de material)
        </button>
        <div className="barra-acoes">
          <button className="btn" onClick={() => setEdicao(null)}>Cancelar</button>
          <button className="btn btn-primario" disabled={salvando} onClick={salvar}>{salvando ? "Salvando…" : "Salvar cronograma"}</button>
        </div>
      </section>
    );
  }

  const linhas = itens.map((i) => linhaGantt(i, d, hoje));
  const datas = itens.flatMap((i) => [i.inicio_previsto, i.fim_previsto, i.inicio_real, i.fim_real]).concat(d.prazo_conclusao);
  const atrasados = linhas.filter((l) => l.tom === "critico").length;
  const comPrev = itens.filter((i) => i.fim_previsto).length;
  const prevFim = itens.map((i) => i.fim_previsto).filter(Boolean).sort().pop() ?? null;

  return (
    <section className="cartao">
      <div className="linha linha-entre">
        <h2>Cronograma <Ajuda>Linha do tempo das etapas: contorno = previsto; barra cheia = realizado. Em vermelho, o que está atrasado em relação ao previsto.</Ajuda></h2>
        {podeEditar && <button className="btn" onClick={() => setEdicao(itens.map((i) => ({ ...i })))}>Editar datas</button>}
      </div>
      <div className="resumo-numeros">
        <div><span className="sutil pequeno">Etapas com previsão</span><strong>{comPrev} de {itens.length}</strong></div>
        <div><span className="sutil pequeno">Atrasadas agora</span><strong className={atrasados ? "texto-critico" : ""}>{atrasados}</strong></div>
        <div><span className="sutil pequeno">Término previsto</span><strong>{fmtData(prevFim)}</strong></div>
        <div><span className="sutil pequeno">Prazo de conclusão</span><strong>{fmtData(d.prazo_conclusao)}</strong></div>
      </div>
      {comPrev === 0 && <Aviso tipo="atencao">Nenhuma etapa tem data prevista ainda. {podeEditar ? "Clique em “Editar datas” para planejar." : ""}</Aviso>}
      {prevFim && d.prazo_conclusao && prevFim > d.prazo_conclusao && <Aviso tipo="atencao">O término previsto ({fmtData(prevFim)}) é depois do prazo de conclusão da demanda ({fmtData(d.prazo_conclusao)}).</Aviso>}
      <Gantt linhas={linhas} periodo={periodo(datas, hoje)} prazo={d.prazo_conclusao} />
      <LegendaGantt />
      <details className="dados pequeno"><summary>Ver em tabela</summary>
        <div className="rolagem-x">
          <table className="tabela compacta">
            <thead><tr><th>Etapa</th><th>Previsto</th><th>Realizado</th><th>Situação</th><th>Observação</th></tr></thead>
            <tbody>{itens.map((i, k) => (
              <tr key={i.id}>
                <td>{i.nome}</td>
                <td>{fmtData(i.inicio_previsto)} → {fmtData(i.fim_previsto)}</td>
                <td>{fmtData(i.inicio_real)} → {i.inicio_real && !i.fim_real ? "em andamento" : fmtData(i.fim_real)}</td>
                <td>{linhas[k].situacao}</td>
                <td>{i.observacao ?? ""}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
