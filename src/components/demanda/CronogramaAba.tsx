import { Fragment, useCallback, useEffect, useState } from "react";
import { supabase, mensagemErro } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { FLUXO, fmtData, hojeISO } from "../../lib/dominio";
import type { DemandaLinha } from "../../lib/filtros";
import {
  SITUACAO_ITEM, calcularDatas, desvioDias, duracaoEntre, itensFaltantes, itensIniciais, periodo, situacaoItem,
  type Dependencia, type ItemCronograma,
} from "../../lib/cronograma";
import Gantt, { LegendaGantt, type LinhaGantt } from "../Gantt";
import { Ajuda, Aviso, Carregando, notificar } from "../ui";

type Item = ItemCronograma & { id?: number };
type Edit = Item & { chave: string; _novo?: boolean; _excluir?: boolean };
type DepEdit = { item: string; pred: string; folga: number };

export interface OpcoesLinha { uteis?: boolean; deps?: Dependencia[]; itens?: Item[] }

/** Converte um item do cronograma em linha do Gantt, com situação, desvio e predecessoras. */
export function linhaGantt(i: Item, d: Pick<DemandaLinha, "etapa" | "situacao" | "forma_execucao">, hoje: string, op: OpcoesLinha = {}): LinhaGantt & { desvio: number | null; sit: ReturnType<typeof situacaoItem> } {
  const ordemFluxo = FLUXO[d.forma_execucao];
  const passou = !!i.etapa && (d.situacao === "concluida" || ordemFluxo.indexOf(i.etapa) < ordemFluxo.indexOf(d.etapa));
  const preds = (op.deps ?? []).filter((x) => x.item_id === i.id).map((x) => ({ dep: x, it: op.itens?.find((y) => y.id === x.predecessora_id) })).filter((x) => x.it);
  const predPendente = preds.some((p) => !p.it!.fim_real);
  const sit = situacaoItem(i, hoje, passou, predPendente);
  const prev: [string, string] | null = i.inicio_previsto || i.fim_previsto ? [i.inicio_previsto ?? i.fim_previsto!, i.fim_previsto ?? i.inicio_previsto!] : null;
  const real: [string, string | null] | null = i.inicio_real ? [i.inicio_real, i.fim_real] : i.fim_real ? [i.fim_real, i.fim_real] : null;
  const desvio = desvioDias(i, hoje, op.uteis);
  const un = op.uteis ? "d úteis" : "d";
  const apos = preds.map((p) => `${p.it!.nome}${p.dep.folga_dias ? ` ${p.dep.folga_dias > 0 ? "+" : ""}${p.dep.folga_dias}${un}` : ""}`).join(", ");
  return {
    chave: String(i.id ?? i.ordem), nome: i.nome, previsto: prev, realizado: real, tom: SITUACAO_ITEM[sit].tom,
    situacao: SITUACAO_ITEM[sit].nome + (desvio && desvio > 0 ? ` (${desvio} ${op.uteis ? "dias úteis" : "dias"})` : "") + (apos ? ` · após ${apos}` : ""),
    sub: <>
      <span className={`tom-texto-${SITUACAO_ITEM[sit].tom}`}>{SITUACAO_ITEM[sit].nome}{desvio && desvio > 0 ? ` · ${desvio}${un}` : ""}</span>
      {apos && <span className="gantt-apos" title={`Predecessora(s): ${apos}`}> · após {apos}</span>}
    </>,
    destaque: i.etapa === d.etapa && d.situacao !== "concluida", desvio, sit,
  };
}

export default function CronogramaAba({ d }: { d: DemandaLinha }) {
  const { podeEditar } = useAuth();
  const [itens, setItens] = useState<Item[] | null>(null);
  const [deps, setDeps] = useState<Dependencia[]>([]);
  const [uteis, setUteis] = useState(false);
  const [edicao, setEdicao] = useState<{ itens: Edit[]; deps: DepEdit[]; uteis: boolean; erros: string[] } | null>(null);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const hoje = hojeISO();

  const carregar = useCallback(async () => {
    const [a, b] = await Promise.all([
      supabase.from("cronograma").select("*").eq("demanda_id", d.id).order("ordem").order("id"),
      supabase.from("cronograma_config").select("dias_uteis").eq("demanda_id", d.id).maybeSingle(),
    ]);
    if (a.error) return setErro(mensagemErro(a.error));
    const lista = a.data as Item[];
    const ids = lista.map((i) => i.id!);
    const c = ids.length ? await supabase.from("cronograma_dependencias").select("*").in("item_id", ids) : { data: [] };
    setItens(lista);
    setDeps((c.data as Dependencia[]) ?? []);
    setUteis(!!b.data?.dias_uteis);
    return lista;
  }, [d.id]);
  useEffect(() => { carregar(); }, [carregar]);

  function abrirEdicao(lista: Item[], depsAtuais: Dependencia[], cal: boolean) {
    const ed: Edit[] = lista.map((i) => ({ ...i, chave: String(i.id), duracao_dias: i.duracao_dias ?? (i.inicio_previsto && i.fim_previsto ? duracaoEntre(i.inicio_previsto, i.fim_previsto, cal) || null : null) }));
    setEdicao({ itens: ed, deps: depsAtuais.map((x) => ({ item: String(x.item_id), pred: String(x.predecessora_id), folga: x.folga_dias })), uteis: cal, erros: [] });
  }

  async function criar() {
    const novos = itensIniciais(d, hoje);
    const { error } = await supabase.from("cronograma").insert(novos);
    if (error) return notificar(mensagemErro(error), "erro");
    const lista = await carregar();
    notificar("Cronograma criado. Agora informe durações, predecessoras e datas.");
    if (lista) abrirEdicao(lista, [], uteis);
  }

  /** Aplica a mudança e recalcula a cadeia de predecessoras. */
  function aplicar(novos: Edit[], novasDeps: DepEdit[], cal: boolean) {
    const ativos = novos.filter((i) => !i._excluir);
    const depsValidas = novasDeps.filter((x) => ativos.some((i) => i.chave === x.item) && ativos.some((i) => i.chave === x.pred));
    const r = calcularDatas(ativos, depsValidas, cal);
    const calc = new Map(r.itens.map((i) => [i.chave, i]));
    setEdicao({ itens: novos.map((i) => calc.get(i.chave) ?? i), deps: depsValidas, uteis: cal, erros: r.erros });
  }

  async function salvar() {
    if (!edicao) return;
    const ativos = edicao.itens.filter((i) => !i._excluir);
    for (const i of ativos) {
      if (!i.nome.trim()) return notificar("Todo item precisa de um nome.", "erro");
      if (i.inicio_previsto && i.fim_previsto && i.fim_previsto < i.inicio_previsto) return notificar(`“${i.nome}”: fim previsto antes do início.`, "erro");
      if (i.inicio_real && i.fim_real && i.fim_real < i.inicio_real) return notificar(`“${i.nome}”: fim realizado antes do início.`, "erro");
    }
    if (edicao.erros.some((e) => e.includes("circular"))) return notificar("Corrija a dependência circular antes de salvar.", "erro");
    setSalvando(true);
    try {
      const campos = (i: Edit) => ({
        nome: i.nome.trim(), ordem: i.ordem, duracao_dias: i.duracao_dias || null,
        inicio_previsto: i.inicio_previsto || null, fim_previsto: i.fim_previsto || null,
        inicio_real: i.inicio_real || null, fim_real: i.fim_real || null, observacao: i.observacao || null,
      });
      const idDe = new Map<string, number>();
      for (const i of edicao.itens) {
        if (i._excluir) { if (i.id) { const r = await supabase.from("cronograma").delete().eq("id", i.id); if (r.error) throw r.error; } continue; }
        if (i._novo) {
          const r = await supabase.from("cronograma").insert({ demanda_id: d.id, etapa: null, ...campos(i) }).select("id").single();
          if (r.error) throw r.error;
          idDe.set(i.chave, r.data.id);
        } else {
          const r = await supabase.from("cronograma").update(campos(i)).eq("id", i.id!);
          if (r.error) throw r.error;
          idDe.set(i.chave, i.id!);
        }
      }
      // predecessoras: substitui o conjunto da demanda
      const idsAtuais = [...idDe.values()];
      if (idsAtuais.length) { const r = await supabase.from("cronograma_dependencias").delete().in("item_id", idsAtuais); if (r.error) throw r.error; }
      const novasDeps = edicao.deps.filter((x) => idDe.has(x.item) && idDe.has(x.pred))
        .map((x) => ({ item_id: idDe.get(x.item)!, predecessora_id: idDe.get(x.pred)!, folga_dias: x.folga || 0 }));
      if (novasDeps.length) { const r = await supabase.from("cronograma_dependencias").insert(novasDeps); if (r.error) throw r.error; }
      const rc = await supabase.from("cronograma_config").upsert({ demanda_id: d.id, dias_uteis: edicao.uteis });
      if (rc.error) throw rc.error;
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
            <p className="sutil pequeno">O cronograma é criado com as etapas do fluxo ({d.forma_execucao === "interna" ? "execução interna" : "serviço contratado"}). Datas já conhecidas (recebimento, início e fim da execução) entram como realizadas. Depois informe a duração de cada etapa e as predecessoras: o sistema calcula as datas.</p>
            <button className="btn btn-primario" onClick={criar}>Criar cronograma</button>
          </>
        ) : <p className="sutil pequeno">Peça ao responsável da demanda para criar o cronograma.</p>}
      </section>
    );
  }

  if (edicao) {
    const { uteis: cal } = edicao;
    const visiveis = edicao.itens.map((i, k) => ({ i, k })).filter(({ i }) => !i._excluir);
    const numero = (chave: string) => visiveis.findIndex(({ i }) => i.chave === chave) + 1;
    const mudarItem = (k: number, p: Partial<Edit>) => aplicar(edicao.itens.map((i, j) => (j === k ? { ...i, ...p } : i)), edicao.deps, cal);
    const temPred = (chave: string) => edicao.deps.some((x) => x.item === chave);
    const un = cal ? "dias úteis" : "dias";

    return (
      <section className="cartao">
        <h2>Editar cronograma</h2>
        <div className="calendario-opcao">
          <span className="campo-rotulo">Contar fins de semana nos prazos? <Ajuda>Dias corridos: sábado e domingo contam na duração e nas folgas. Dias úteis: só de segunda a sexta; um início que cairia no fim de semana passa para segunda. Feriados não são considerados.</Ajuda></span>
          <div className="segmentado">
            <button type="button" className={!cal ? "ativo" : ""} aria-pressed={!cal} onClick={() => aplicar(edicao.itens, edicao.deps, false)}>Sim · dias corridos</button>
            <button type="button" className={cal ? "ativo" : ""} aria-pressed={cal} onClick={() => aplicar(edicao.itens, edicao.deps, true)}>Não · dias úteis (seg–sex)</button>
          </div>
        </div>
        <p className="sutil pequeno">
          Informe a <strong>duração</strong> e as <strong>predecessoras</strong> (a etapa só começa depois que a predecessora termina; a folga adia ou antecipa esse início).
          O início de quem tem predecessora é calculado; para as demais, informe o início. Ao mudar a etapa da demanda, o realizado é preenchido sozinho.
        </p>
        {edicao.erros.map((e) => <Aviso key={e} tipo={e.includes("circular") ? "critico" : "atencao"}>{e}</Aviso>)}
        <div className="tabela-rolagem">
          <table className="tabela compacta tabela-cronograma">
            <thead>
              <tr><th>#</th><th>Etapa / item</th><th>Predecessoras <Ajuda>Término → início. Folga em {un}: positiva adia, negativa antecipa.</Ajuda></th><th>Duração ({un})</th><th>Início previsto</th><th>Fim previsto</th><th>Início realizado</th><th>Fim realizado</th><th>Observação</th><th /></tr>
            </thead>
            <tbody>
              {visiveis.map(({ i, k }, n) => {
                const minhas = edicao.deps.filter((x) => x.item === i.chave);
                const opcoes = visiveis.filter(({ i: o }) => o.chave !== i.chave && !minhas.some((m) => m.pred === o.chave));
                return (
                  <tr key={i.chave}>
                    <td className="sutil">{n + 1}</td>
                    <td>{i.etapa ? <strong>{i.nome}</strong> : <input value={i.nome} onChange={(e) => mudarItem(k, { nome: e.target.value })} aria-label="Nome do item" placeholder="Ex.: Mobilização" />}</td>
                    <td className="celula-preds">
                      {minhas.map((m) => {
                        const p = edicao.itens.find((x) => x.chave === m.pred)!;
                        return (
                          <span key={m.pred} className="pred-chip" title={p.nome}>
                            #{numero(m.pred)} {p.nome.length > 16 ? p.nome.slice(0, 15) + "…" : p.nome}
                            <input type="number" value={m.folga} aria-label={`Folga após ${p.nome}`} title={`Folga em ${un}`}
                              onChange={(e) => aplicar(edicao.itens, edicao.deps.map((x) => (x === m ? { ...x, folga: Number(e.target.value) || 0 } : x)), cal)} />
                            <button type="button" onClick={() => aplicar(edicao.itens, edicao.deps.filter((x) => x !== m), cal)} aria-label={`Remover predecessora ${p.nome}`}>✕</button>
                          </span>
                        );
                      })}
                      {opcoes.length > 0 && (
                        <select value="" aria-label={`Adicionar predecessora para ${i.nome}`}
                          onChange={(e) => e.target.value && aplicar(edicao.itens, [...edicao.deps, { item: i.chave, pred: e.target.value, folga: 0 }], cal)}>
                          <option value="">+ predecessora</option>
                          {opcoes.map(({ i: o }) => <option key={o.chave} value={o.chave}>#{numero(o.chave)} {o.nome}</option>)}
                        </select>
                      )}
                    </td>
                    <td><input type="number" min={1} className="input-qtd" value={i.duracao_dias ?? ""} aria-label={`Duração de ${i.nome}`}
                      onChange={(e) => mudarItem(k, { duracao_dias: e.target.value ? Math.max(1, Number(e.target.value)) : null })} /></td>
                    <td>{temPred(i.chave)
                      ? <span className="calculado" title="Calculado pelas predecessoras">{fmtData(i.inicio_previsto)} <small>calculado</small></span>
                      : <input type="date" value={i.inicio_previsto ?? ""} onChange={(e) => mudarItem(k, { inicio_previsto: e.target.value || null })} aria-label={`Início previsto de ${i.nome}`} />}</td>
                    <td><input type="date" value={i.fim_previsto ?? ""} aria-label={`Fim previsto de ${i.nome}`}
                      onChange={(e) => {
                        const fim = e.target.value || null;
                        mudarItem(k, { fim_previsto: fim, duracao_dias: fim && i.inicio_previsto ? duracaoEntre(i.inicio_previsto, fim, cal) || null : i.duracao_dias });
                      }} /></td>
                    <td><input type="date" value={i.inicio_real ?? ""} onChange={(e) => mudarItem(k, { inicio_real: e.target.value || null })} aria-label={`Início realizado de ${i.nome}`} /></td>
                    <td><input type="date" value={i.fim_real ?? ""} onChange={(e) => mudarItem(k, { fim_real: e.target.value || null })} aria-label={`Fim realizado de ${i.nome}`} /></td>
                    <td><input value={i.observacao ?? ""} onChange={(e) => mudarItem(k, { observacao: e.target.value || null })} aria-label={`Observação de ${i.nome}`} /></td>
                    <td>{!i.etapa && <button className="btn-icone" onClick={() => (i._novo ? aplicar(edicao.itens.filter((_, j) => j !== k), edicao.deps, cal) : mudarItem(k, { _excluir: true }))} aria-label="Remover item">✕</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button className="btn btn-link" onClick={() => {
          const chave = `n${Date.now()}`;
          aplicar([...edicao.itens, { chave, demanda_id: d.id, etapa: null, nome: "", ordem: Math.max(0, ...edicao.itens.map((i) => i.ordem)) + 10, inicio_previsto: null, fim_previsto: null, inicio_real: null, fim_real: null, observacao: null, duracao_dias: null, _novo: true }], edicao.deps, cal);
        }}>+ Item personalizado (ex.: mobilização, entrega de material)</button>
        <div className="barra-acoes">
          <button className="btn" onClick={() => setEdicao(null)}>Cancelar</button>
          <button className="btn btn-primario" disabled={salvando} onClick={salvar}>{salvando ? "Salvando…" : "Salvar cronograma"}</button>
        </div>
      </section>
    );
  }

  const faltantes = itensFaltantes(itens, d);
  async function completar() {
    const { error } = await supabase.from("cronograma").insert(faltantes);
    if (error) return notificar(mensagemErro(error), "erro");
    notificar(`${faltantes.length} etapa(s) incluída(s): ${faltantes.map((f) => f.nome).join(", ")}.`);
    carregar();
  }
  const op = { uteis, deps, itens };
  const linhas = itens.map((i) => linhaGantt(i, d, hoje, op));
  const datas = itens.flatMap((i) => [i.inicio_previsto, i.fim_previsto, i.inicio_real, i.fim_real]).concat(d.prazo_conclusao);
  const atrasados = linhas.filter((l) => l.tom === "critico").length;
  const comPrev = itens.filter((i) => i.fim_previsto).length;
  const prevFim = itens.map((i) => i.fim_previsto).filter(Boolean).sort().pop() ?? null;
  const per = periodo(datas, hoje);
  const nomeDe = (id: number) => itens.find((i) => i.id === id)?.nome ?? "?";

  return (
    <section className="cartao">
      <div className="linha linha-entre">
        <h2>Cronograma <Ajuda>Linha do tempo das etapas: contorno = previsto; barra cheia = realizado. Em vermelho, o que está atrasado em relação ao previsto.</Ajuda></h2>
        <span className="linha">
          {podeEditar && faltantes.length > 0 && <button className="btn" onClick={completar} title={faltantes.map((f) => f.nome).join(", ")}>+ Incluir etapas que faltam ({faltantes.length})</button>}
          {podeEditar && <button className="btn" onClick={() => abrirEdicao(itens, deps, uteis)}>Editar cronograma</button>}
        </span>
      </div>
      <div className="resumo-numeros">
        <div><span className="sutil pequeno">Calendário</span><strong>{uteis ? "Dias úteis" : "Dias corridos"}</strong><span className="sutil pequeno">{uteis ? "sem sábados e domingos" : "conta fins de semana"}</span></div>
        <div><span className="sutil pequeno">Etapas com previsão</span><strong>{comPrev} de {itens.length}</strong></div>
        <div><span className="sutil pequeno">Atrasadas agora</span><strong className={atrasados ? "texto-critico" : ""}>{atrasados}</strong></div>
        <div><span className="sutil pequeno">Término previsto</span><strong>{fmtData(prevFim)}</strong></div>
        <div><span className="sutil pequeno">Prazo de conclusão</span><strong>{fmtData(d.prazo_conclusao)}</strong></div>
      </div>
      {comPrev === 0 && <Aviso tipo="atencao">Nenhuma etapa tem data prevista ainda. {podeEditar ? "Clique em “Editar cronograma” para planejar." : ""}</Aviso>}
      {prevFim && d.prazo_conclusao && prevFim > d.prazo_conclusao && <Aviso tipo="atencao">O término previsto ({fmtData(prevFim)}) é depois do prazo de conclusão da demanda ({fmtData(d.prazo_conclusao)}).</Aviso>}
      <Gantt linhas={linhas} periodo={per} prazo={d.prazo_conclusao} fimDeSemana={uteis} />
      <LegendaGantt fimDeSemana={uteis} />
      <details className="dados pequeno"><summary>Ver em tabela</summary>
        <div className="rolagem-x">
          <table className="tabela compacta">
            <thead><tr><th>#</th><th>Etapa</th><th>Predecessoras</th><th>Duração</th><th>Previsto</th><th>Realizado</th><th>Situação</th><th>Observação</th></tr></thead>
            <tbody>{itens.map((i, k) => {
              const ps = deps.filter((x) => x.item_id === i.id);
              return (
                <tr key={i.id}>
                  <td>{k + 1}</td>
                  <td>{i.nome}</td>
                  <td>{ps.length ? ps.map((p) => <Fragment key={p.predecessora_id}>#{itens.findIndex((x) => x.id === p.predecessora_id) + 1} {nomeDe(p.predecessora_id)}{p.folga_dias ? ` (${p.folga_dias > 0 ? "+" : ""}${p.folga_dias}d)` : ""}<br /></Fragment>) : "—"}</td>
                  <td>{i.duracao_dias ? `${i.duracao_dias} ${uteis ? "d úteis" : "d"}` : "—"}</td>
                  <td>{fmtData(i.inicio_previsto)} → {fmtData(i.fim_previsto)}</td>
                  <td>{fmtData(i.inicio_real)} → {i.inicio_real && !i.fim_real ? "em andamento" : fmtData(i.fim_real)}</td>
                  <td>{linhas[k].situacao}</td>
                  <td>{i.observacao ?? ""}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
