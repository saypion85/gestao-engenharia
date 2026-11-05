import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase, mensagemErro } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { diasAte, fmtData, hojeISO } from "../lib/dominio";
import type { Acao, DecisaoRegistro, Reuniao } from "../lib/reunioes";
import { Ajuda, Aviso, Carregando, Vazio, notificar } from "../components/ui";
import { ResolverDecisao, type Registro } from "../components/demanda/HistoricoAba";

export const CAMPOS_DECISAO = "id, demanda_id, data, texto, autor_nome, tipo, decisao_status, decisao_responsavel, decisao_prazo, decisao_resultado, decidida_em, decidida_por_nome, reuniao_id, criado_em, autor_id, editado_em, editado_por_nome";

export async function carregarDecisoes() {
  const { data, error } = await supabase.from("historico").select(CAMPOS_DECISAO).eq("tipo", "decisao").order("data", { ascending: false });
  if (error) throw error;
  return data as unknown as (DecisaoRegistro & Registro)[];
}

export async function carregarAcoes() {
  const { data, error } = await supabase.from("atividades").select("*, demandas(codigo, assunto), reunioes(data, titulo)").eq("tipo", "acao").order("prazo", { nullsFirst: false });
  if (error) throw error;
  return data as (Acao & { demandas: { codigo: string; assunto: string } | null; reunioes: { data: string; titulo: string } | null })[];
}

export const aberta = (a: { situacao: string }) => a.situacao === "a_fazer" || a.situacao === "em_andamento";
export const vencida = (prazo: string | null) => { const n = diasAte(prazo); return n !== null && n < 0; };

/** Cria uma reunião já com os participantes da última reunião (ou todos da equipe ativa). */
export async function novaReuniao(pessoasAtivas: number[]): Promise<number> {
  const { data: ultima } = await supabase.from("reunioes").select("participantes_ids, titulo, local, hora").order("data", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await supabase.from("reunioes").insert({
    data: hojeISO(), titulo: ultima?.titulo ?? "Reunião de acompanhamento", local: ultima?.local ?? null, hora: ultima?.hora ?? null,
    participantes_ids: ultima?.participantes_ids?.length ? ultima.participantes_ids : pessoasAtivas,
  }).select("id").single();
  if (error) throw error;
  return data.id;
}

export default function Reunioes() {
  const { podeEditar, cadastros } = useAuth();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const aba = params.get("aba") ?? "reunioes";
  const [reunioes, setReunioes] = useState<(Reuniao & { reuniao_itens: { count: number }[] })[] | null>(null);
  const [decisoes, setDecisoes] = useState<(DecisaoRegistro & Registro)[]>([]);
  const [acoes, setAcoes] = useState<Awaited<ReturnType<typeof carregarAcoes>>>([]);
  const [demandas, setDemandas] = useState<Map<number, { codigo: string; assunto: string }>>(new Map());
  const [erro, setErro] = useState("");
  const [filtroDec, setFiltroDec] = useState<"pendentes" | "tomadas" | "todas">("pendentes");
  const [filtroAcao, setFiltroAcao] = useState<"abertas" | "vencidas" | "todas">("abertas");
  const [respAcao, setRespAcao] = useState("");

  const carregar = useCallback(async () => {
    try {
      const [r, dc, ac, dm] = await Promise.all([
        supabase.from("reunioes").select("*, reuniao_itens(count)").order("data", { ascending: false }),
        carregarDecisoes(), carregarAcoes(), supabase.from("demandas").select("id, codigo, assunto"),
      ]);
      if (r.error) throw r.error;
      setReunioes(r.data as never);
      setDecisoes(dc);
      setAcoes(ac);
      setDemandas(new Map((dm.data ?? []).map((d) => [d.id, d])));
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const pendentes = decisoes.filter((d) => d.decisao_status === "pendente");
  const acoesAbertas = acoes.filter(aberta);
  const nome = (id: number | null) => cadastros.pessoas.find((p) => p.id === id)?.nome;
  const decVisiveis = useMemo(() => decisoes.filter((d) => filtroDec === "todas" || (filtroDec === "pendentes" ? d.decisao_status === "pendente" : d.decisao_status === "tomada"))
    .sort((a, b) => (a.decisao_status === "pendente" && b.decisao_status === "pendente" ? (a.decisao_prazo ?? "9999").localeCompare(b.decisao_prazo ?? "9999") : 0)), [decisoes, filtroDec]);
  const acoesVisiveis = acoes.filter((a) => (filtroAcao === "todas" || (filtroAcao === "abertas" ? aberta(a) : aberta(a) && vencida(a.prazo))) && (!respAcao || String(a.responsavel_id) === respAcao));

  async function criar() {
    try {
      const id = await novaReuniao(cadastros.pessoas.filter((p) => p.ativo !== false && p.perfil_id).map((p) => p.id));
      nav(`/reunioes/${id}`);
    } catch (e) { notificar(mensagemErro(e), "erro"); }
  }

  async function mudarAcao(a: Acao, situacao: string) {
    const { error } = await supabase.from("atividades").update({ situacao }).eq("id", a.id);
    if (error) return notificar(mensagemErro(error), "erro");
    carregar();
  }

  if (erro) return <div className="pagina"><Aviso tipo="critico">{erro}</Aviso></div>;
  if (!reunioes) return <Carregando />;
  const proxima = reunioes.filter((r) => r.status === "planejada").sort((a, b) => a.data.localeCompare(b.data))[0];

  return (
    <div className="pagina">
      <div className="pagina-topo">
        <div>
          <h1>Reuniões</h1>
          <p className="sutil">Pauta por demanda, decisões, ata e plano de ação — tudo ligado às demandas.</p>
        </div>
        {podeEditar && <button className="btn btn-primario" onClick={criar}>+ Nova reunião</button>}
      </div>

      <div className="kpis">
        <div className={`kpi kpi-clicavel${pendentes.length ? " kpi-alert" : ""}`} role="button" tabIndex={0} onClick={() => { setParams({ aba: "decisoes" }); setFiltroDec("pendentes"); }}>
          <span className="kpi-lbl">Decisões a tomar <Ajuda>Decisões marcadas como “a tomar” no histórico das demandas e ainda não registradas como tomadas.</Ajuda></span>
          <span className="kpi-val">{pendentes.length}</span>
          <span className="kpi-foot">{pendentes.filter((d) => vencida(d.decisao_prazo)).length} com prazo vencido</span>
        </div>
        <div className={`kpi kpi-clicavel${acoesAbertas.some((a) => vencida(a.prazo)) ? " kpi-alert" : ""}`} role="button" tabIndex={0} onClick={() => { setParams({ aba: "acoes" }); setFiltroAcao("abertas"); }}>
          <span className="kpi-lbl">Ações em aberto <Ajuda>Ações dos planos de ação das reuniões que ainda não foram concluídas.</Ajuda></span>
          <span className="kpi-val">{acoesAbertas.length}</span>
          <span className="kpi-foot">{acoesAbertas.filter((a) => vencida(a.prazo)).length} vencidas</span>
        </div>
        <div className="kpi">
          <span className="kpi-lbl">Decisões tomadas (30 dias)</span>
          <span className="kpi-val">{decisoes.filter((d) => d.decisao_status === "tomada" && (diasAte(d.decidida_em ?? d.data) ?? -99) >= -30).length}</span>
          <span className="kpi-foot">registradas no histórico</span>
        </div>
        <div className="kpi">
          <span className="kpi-lbl">Próxima reunião</span>
          <span className="kpi-val kpi-val-texto">{proxima ? fmtData(proxima.data) : "—"}</span>
          <span className="kpi-foot">{proxima ? <Link to={`/reunioes/${proxima.id}`}>Abrir pauta →</Link> : "nenhuma planejada"}</span>
        </div>
      </div>

      <nav className="abas" role="tablist">
        {[["reunioes", "Reuniões"], ["decisoes", `Decisões (${pendentes.length} a tomar)`], ["acoes", `Plano de ação (${acoesAbertas.length} em aberto)`]].map(([k, n]) => (
          <button key={k} role="tab" aria-selected={aba === k} className={aba === k ? "ativa" : ""} onClick={() => setParams(k === "reunioes" ? {} : { aba: k })}>{n}</button>
        ))}
      </nav>

      {aba === "reunioes" && (
        <section className="cartao">
          {reunioes.length === 0 ? <Vazio titulo="Nenhuma reunião ainda">{podeEditar ? "Clique em “+ Nova reunião” para montar a primeira pauta." : ""}</Vazio> : (
            <ul className="lista-reunioes">
              {reunioes.map((r) => {
                const nAcoes = acoes.filter((a) => a.reuniao_id === r.id).length;
                return (
                  <li key={r.id}>
                    <Link to={`/reunioes/${r.id}`} className="reuniao-linha">
                      <span className="reuniao-data"><strong>{fmtData(r.data)}</strong>{r.hora && <small>{r.hora.slice(0, 5)}</small>}</span>
                      <span className="reuniao-corpo">
                        <strong>{r.titulo}</strong>
                        <span className="sutil pequeno">{r.reuniao_itens?.[0]?.count ?? 0} demanda(s) na pauta · {nAcoes} ação(ões) · {r.participantes_ids.length} participante(s){r.local ? ` · ${r.local}` : ""}</span>
                      </span>
                      <span className={`badge ${r.status === "realizada" ? "sit-concluida" : "sit-aguardando"}`}>{r.status === "realizada" ? "Realizada · ata gerada" : "Planejada"}</span>
                    </Link>
                    {r.status === "realizada" && <Link to={`/reunioes/${r.id}/ata`} className="pequeno ver-ata">Ver ata →</Link>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {aba === "decisoes" && (
        <section className="cartao">
          <div className="linha linha-entre">
            <h2>Decisões <Ajuda>Todas as decisões importantes registradas no histórico das demandas. As “a tomar” aparecem também na pauta das reuniões.</Ajuda></h2>
            <div className="segmentado pequeno">
              {([["pendentes", "A tomar"], ["tomadas", "Tomadas"], ["todas", "Todas"]] as const).map(([k, n]) => (
                <button key={k} className={filtroDec === k ? "ativo" : ""} aria-pressed={filtroDec === k} onClick={() => setFiltroDec(k)}>{n}</button>
              ))}
            </div>
          </div>
          {decVisiveis.length === 0 ? <Vazio titulo="Nenhuma decisão neste filtro" /> : (
            <ul className="lista-decisoes">
              {decVisiveis.map((d) => {
                const dm = demandas.get(d.demanda_id);
                const venc = d.decisao_status === "pendente" && vencida(d.decisao_prazo);
                return (
                  <li key={d.id} className={`decisao ${d.decisao_status}${venc ? " vencida" : ""}`}>
                    <div className="linha linha-entre">
                      <Link to={`/demandas/${d.demanda_id}?aba=historico`} className="pequeno">{dm?.codigo} · {dm?.assunto}</Link>
                      <span className={`badge ${d.decisao_status === "pendente" ? "badge-atencao" : "badge-critico"}`}>{d.decisao_status === "pendente" ? "◐ A tomar" : "Tomada"}</span>
                    </div>
                    <p className="pre"><strong>{d.texto}</strong></p>
                    {d.decisao_status === "pendente" ? (
                      <p className="pequeno">
                        {d.decisao_responsavel ? <>Quem decide: <strong>{d.decisao_responsavel}</strong> · </> : null}
                        {d.decisao_prazo ? <span className={venc ? "texto-critico" : ""}>Decidir até {fmtData(d.decisao_prazo)}{venc ? ` (${-diasAte(d.decisao_prazo)!}d vencida)` : ""}</span> : <span className="sutil">sem prazo</span>}
                        <span className="sutil"> · registrada por {d.autor_nome} em {fmtData(d.data)}</span>
                      </p>
                    ) : (
                      <p className="pequeno">{d.decisao_resultado && <><strong>Decidido:</strong> {d.decisao_resultado} · </>}<span className="sutil">{d.decidida_por_nome ?? d.autor_nome} · {fmtData(d.decidida_em ?? d.data)}</span>
                        {d.reuniao_id && <> · <Link to={`/reunioes/${d.reuniao_id}/ata`}>ata</Link></>}</p>
                    )}
                    {podeEditar && <ResolverDecisao r={d} aoMudar={carregar} />}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {aba === "acoes" && (
        <section className="cartao">
          <div className="linha linha-entre">
            <h2>Plano de ação <Ajuda>Ações definidas nas reuniões. Também aparecem nas Atividades da demanda e na página Atividades.</Ajuda></h2>
            <div className="linha">
              <select value={respAcao} onChange={(e) => setRespAcao(e.target.value)} aria-label="Responsável">
                <option value="">Todos os responsáveis</option>
                {cadastros.pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
              <div className="segmentado pequeno">
                {([["abertas", "Em aberto"], ["vencidas", "Vencidas"], ["todas", "Todas"]] as const).map(([k, n]) => (
                  <button key={k} className={filtroAcao === k ? "ativo" : ""} aria-pressed={filtroAcao === k} onClick={() => setFiltroAcao(k)}>{n}</button>
                ))}
              </div>
            </div>
          </div>
          {acoesVisiveis.length === 0 ? <Vazio titulo="Nenhuma ação neste filtro" /> : (
            <div className="tabela-rolagem">
              <table className="tabela">
                <thead><tr><th>Ação</th><th>Demanda</th><th>Responsável</th><th>Prazo</th><th>Situação</th><th>Origem</th></tr></thead>
                <tbody>
                  {acoesVisiveis.map((a) => (
                    <tr key={a.id}>
                      <td>{a.titulo}</td>
                      <td className="pequeno">{a.demandas ? <Link to={`/demandas/${a.demanda_id}?aba=atividades`}>{a.demandas.codigo} · {a.demandas.assunto}</Link> : <span className="sutil">Assuntos gerais</span>}</td>
                      <td>{nome(a.responsavel_id) ?? <span className="texto-atencao">a definir</span>}</td>
                      <td className={aberta(a) && vencida(a.prazo) ? "texto-critico" : ""}>{fmtData(a.prazo)}{aberta(a) && vencida(a.prazo) ? ` (${-diasAte(a.prazo)!}d)` : ""}</td>
                      <td>{podeEditar ? (
                        <select value={a.situacao} onChange={(e) => mudarAcao(a, e.target.value)} aria-label={`Situação da ação ${a.titulo}`}>
                          <option value="a_fazer">A fazer</option><option value="em_andamento">Em andamento</option><option value="concluida">Concluída</option><option value="cancelada">Cancelada</option>
                        </select>) : a.situacao}</td>
                      <td className="pequeno">{a.reunioes ? <Link to={`/reunioes/${a.reuniao_id}`}>Reunião {fmtData(a.reunioes.data)}</Link> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
