import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase, mensagemErro } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { CLASSES, ETAPAS, FORMAS, LIMITES, SITUACOES, estaAberta, fmtBytes, fmtMoeda, type Situacao } from "../lib/dominio";
import { FILTROS_PADRAO, MARCADORES, aplicarFiltros, filtrosParaURL, temMarcador, type DemandaLinha, type Filtros, type Marcador } from "../lib/filtros";
import { carregarDemandas } from "./Demandas";
import { Ajuda, Aviso, BadgeClasse, Carregando } from "../components/ui";
import { ListaItens, type Atividade } from "../components/demanda/AtividadesAba";

/** Link para a lista de demandas com o recorte do painel + o filtro do indicador. */
function useLink(base: Partial<Filtros>) {
  return (extra: Partial<Filtros>) => `/demandas?${filtrosParaURL({ ...FILTROS_PADRAO, ...base, ...extra }).toString()}`;
}

function Barras({ titulo, ajuda, itens, link }: { titulo: string; ajuda: string; itens: { nome: string; valor: number; filtro: Partial<Filtros> }[]; link: (f: Partial<Filtros>) => string }) {
  const max = Math.max(1, ...itens.map((i) => i.valor));
  const total = itens.reduce((s, i) => s + i.valor, 0);
  return (
    <section className="cartao">
      <h2>{titulo} <Ajuda>{ajuda}</Ajuda></h2>
      {total === 0 ? <p className="sutil">Nenhuma demanda no recorte.</p> : (
        <ul className="barras">
          {itens.filter((i) => i.valor > 0).map((i) => (
            <li key={i.nome}>
              <Link to={link(i.filtro)} title={`Ver ${i.valor} demanda(s)`}>
                <span className="barra-nome">{i.nome}</span>
                <span className="barra-trilho"><span className="barra" style={{ width: `${(i.valor / max) * 100}%` }} /></span>
                <span className="barra-valor">{i.valor}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Indicador({ nome, valor, criterio, to, tom }: { nome: string; valor: number; criterio: string; to: string; tom?: "critico" | "atencao" }) {
  return (
    <Link to={to} className={`indicador${tom && valor > 0 ? ` ind-${tom}` : ""}`}>
      <span className="ind-valor">{valor}</span>
      <span className="ind-nome">{nome} <Ajuda>{criterio}</Ajuda></span>
    </Link>
  );
}

export default function Painel() {
  const { cadastros, eGestor } = useAuth();
  const [dados, setDados] = useState<{ lista: DemandaLinha[]; impedimentos: Set<number> } | null>(null);
  const [ativs, setAtivs] = useState<Atividade[]>([]);
  const [impedList, setImpedList] = useState<{ origem: string; demanda_id: number; descricao: string; detalhe: string; data: string }[]>([]);
  const [save, setSave] = useState<{ total: number; n: number } | null>(null);
  const [uso, setUso] = useState<{ bytes: number; arquivos: number } | null>(null);
  const [erro, setErro] = useState("");
  const [recorte, setRecorte] = useState<Partial<Filtros>>({ resp: "", forma: "", local: "" });

  async function carregarAtividades() {
    const limite = new Date(Date.now() + LIMITES.diasVencendo * 86400000).toISOString().slice(0, 10);
    const { data } = await supabase.from("atividades").select("*, demandas(codigo, assunto)")
      .in("situacao", ["a_fazer", "em_andamento"]).not("prazo", "is", null).lte("prazo", limite).order("prazo").limit(30);
    setAtivs((data as Atividade[]) ?? []);
  }

  useEffect(() => {
    carregarDemandas().then(setDados).catch((e) => setErro(mensagemErro(e)));
    carregarAtividades();
    supabase.from("v_impedimentos").select("*").order("data", { ascending: false }).limit(20).then(({ data }) => setImpedList(data ?? []));
    supabase.rpc("uso_armazenamento").then(({ data }) => data?.[0] && setUso({ bytes: Number(data[0].bytes), arquivos: Number(data[0].arquivos) }));
    if (eGestor) {
      supabase.from("v_custos").select("save").not("save", "is", null).then(({ data }) =>
        setSave({ total: (data ?? []).reduce((s, x) => s + Number(x.save), 0), n: data?.length ?? 0 }));
    }
  }, [eGestor]);

  const base = useMemo(() => ({ ...recorte, situacao: "todas" }), [recorte]);
  const link = useLink(recorte);
  const noRecorte = useMemo(() => (dados ? aplicarFiltros(dados.lista, { ...FILTROS_PADRAO, ...base }, dados.impedimentos) : []), [dados, base]);

  if (erro) return <div className="pagina"><Aviso tipo="critico">{erro}</Aviso></div>;
  if (!dados) return <Carregando />;

  const abertas = noRecorte.filter((d) => estaAberta(d.situacao));
  const conta = (m: Marcador) => noRecorte.filter((d) => temMarcador(d, m, dados.impedimentos)).length;
  const porSit = (s: Situacao) => noRecorte.filter((d) => d.situacao === s).length;
  const topo = abertas.filter((d) => d.ranking).sort((a, b) => a.ranking! - b.ranking!).slice(0, 10);
  const recorteAtivo = Object.values(recorte).some(Boolean);
  const impNoRecorte = impedList.filter((i) => noRecorte.some((d) => d.id === i.demanda_id));
  const nomeDemanda = (id: number) => dados.lista.find((d) => d.id === id);

  return (
    <div className="pagina">
      <div className="pagina-topo">
        <div>
          <h1>Painel</h1>
          <p className="sutil">Dados atualizados ao abrir a página · {abertas.length} demandas abertas{recorteAtivo ? " no recorte" : ""}</p>
        </div>
        <div className="filtros-linha">
          <select value={recorte.resp} onChange={(e) => setRecorte({ ...recorte, resp: e.target.value })} aria-label="Responsável">
            <option value="">Todos os responsáveis</option>
            {cadastros.pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
          <select value={recorte.forma} onChange={(e) => setRecorte({ ...recorte, forma: e.target.value })} aria-label="Forma de execução">
            <option value="">Interna e contratada</option>
            {Object.entries(FORMAS).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
          <select value={recorte.local} onChange={(e) => setRecorte({ ...recorte, local: e.target.value })} aria-label="Local">
            <option value="">Todos os locais</option>
            {cadastros.locais.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
        </div>
      </div>

      <div className="indicadores">
        <Indicador nome="Abertas" valor={abertas.length} criterio="Demandas com situação diferente de Concluída e Cancelada." to={link({ situacao: "abertas" })} />
        <Indicador nome="Em andamento" valor={porSit("em_andamento")} criterio="Situação = Em andamento." to={link({ situacao: "em_andamento" })} />
        <Indicador nome="Aguardando" valor={porSit("aguardando")} criterio="Situação = Aguardando (veja na lista o que cada uma aguarda)." to={link({ situacao: "aguardando" })} />
        <Indicador nome="Suspensas" valor={porSit("suspensa")} criterio="Situação = Suspensa. Continuam no ranking de prioridade." to={link({ situacao: "suspensa" })} />
        <Indicador nome="Concluídas" valor={porSit("concluida")} criterio="Situação = Concluída (todas as datas)." to={link({ situacao: "concluida" })} />
      </div>

      <h2 className="titulo-secao">Onde agir</h2>
      <div className="indicadores">
        <Indicador nome={MARCADORES.atrasada.nome} valor={conta("atrasada")} criterio={MARCADORES.atrasada.criterio} to={link({ situacao: "abertas", marcador: "atrasada" })} tom="critico" />
        <Indicador nome={MARCADORES.impedimento.nome} valor={conta("impedimento")} criterio={MARCADORES.impedimento.criterio} to={link({ situacao: "todas", marcador: "impedimento" })} tom="critico" />
        <Indicador nome={MARCADORES.vencendo.nome} valor={conta("vencendo")} criterio={MARCADORES.vencendo.criterio} to={link({ situacao: "abertas", marcador: "vencendo" })} tom="atencao" />
        <Indicador nome={MARCADORES.sem_atualizacao.nome} valor={conta("sem_atualizacao")} criterio={MARCADORES.sem_atualizacao.criterio} to={link({ situacao: "abertas", marcador: "sem_atualizacao" })} tom="atencao" />
        <Indicador nome={MARCADORES.sem_avaliacao.nome} valor={conta("sem_avaliacao")} criterio={MARCADORES.sem_avaliacao.criterio} to={link({ situacao: "abertas", marcador: "sem_avaliacao" })} tom="atencao" />
        <Indicador nome={MARCADORES.acomp.nome} valor={conta("acomp")} criterio={MARCADORES.acomp.criterio} to={link({ situacao: "abertas", marcador: "acomp" })} />
      </div>
      {abertas.filter((d) => !d.prazo_conclusao).length > abertas.length / 2 && (
        <Aviso tipo="atencao">
          {abertas.filter((d) => !d.prazo_conclusao).length} de {abertas.length} demandas abertas não têm prazo de conclusão: o indicador de atraso só enxerga as que têm prazo.
        </Aviso>
      )}

      <div className="grade-painel">
        <section className="cartao">
          <h2>Prioridades — top 10 <Ajuda>Ranking das demandas abertas avaliadas pela matriz Probabilidade × Severidade. Concluídas e canceladas saem do ranking.</Ajuda></h2>
          {topo.length === 0 ? <p className="sutil">Nenhuma demanda avaliada ainda. Avalie a prioridade nas demandas abertas.</p> : (
            <ol className="ranking">
              {topo.map((d) => (
                <li key={d.id}>
                  <BadgeClasse c={d.classe} ranking={d.ranking} />
                  <Link to={`/demandas/${d.id}`}>{d.assunto}</Link>
                  <span className="sutil pequeno">{SITUACOES[d.situacao]} · {d.responsavel_nome ?? "sem responsável"}</span>
                </li>
              ))}
            </ol>
          )}
          <Link to={link({ situacao: "abertas" })} className="pequeno">Ver todas por prioridade →</Link>
        </section>

        <section className="cartao">
          <h2>Atividades vencidas e dos próximos {LIMITES.diasVencendo} dias <Ajuda>Atividades, pendências e entregas em aberto com prazo até {LIMITES.diasVencendo} dias à frente (inclui as vencidas).</Ajuda></h2>
          {ativs.length === 0 ? <p className="sutil">Nada vencendo. 👍</p> : <ListaItens itens={ativs} mostrarDemanda aoMudar={carregarAtividades} podeEditar={false} aoEditar={() => null} />}
          <Link to="/atividades" className="pequeno">Ver todas as atividades →</Link>
        </section>

        <section className="cartao">
          <h2>Impedimentos <Ajuda>{MARCADORES.impedimento.criterio}</Ajuda></h2>
          {impNoRecorte.length === 0 ? <p className="sutil">Nenhum impedimento registrado.</p> : (
            <ul className="lista-simples">
              {impNoRecorte.map((i, k) => (
                <li key={k}>
                  <span className="texto-critico">▲</span> {i.descricao}{i.detalhe && `: ${i.detalhe}`}
                  <div className="pequeno"><Link to={`/demandas/${i.demanda_id}?aba=${i.origem === "rdo" ? "rdo" : "atividades"}`}>{nomeDemanda(i.demanda_id)?.codigo} · {nomeDemanda(i.demanda_id)?.assunto}</Link> <span className="sutil">({i.origem === "rdo" ? "RDO" : "atividade"})</span></div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <Barras titulo="Abertas por classe de prioridade" ajuda="Demandas abertas agrupadas pela classe calculada (Crítico, Alto, Médio, Baixo) ou sem avaliação." link={link}
          itens={[...Object.entries(CLASSES).map(([k, c]) => ({ nome: c.nome, valor: abertas.filter((d) => d.classe === k).length, filtro: { situacao: "abertas", classe: k } })),
            { nome: "Sem avaliação", valor: abertas.filter((d) => !d.classe).length, filtro: { situacao: "abertas", classe: "sem" } }]} />

        <Barras titulo="Abertas por etapa" ajuda="Em que ponto do fluxo estão as demandas abertas." link={link}
          itens={Object.entries(ETAPAS).filter(([k]) => k !== "concluida").map(([k, n]) => ({ nome: n, valor: abertas.filter((d) => d.etapa === k).length, filtro: { situacao: "abertas", etapa: k } }))} />

        <Barras titulo="Abertas por responsável" ajuda="Quantidade de demandas abertas sob responsabilidade de cada pessoa." link={link}
          itens={[...cadastros.pessoas.map((p) => ({ nome: p.nome, valor: abertas.filter((d) => d.responsavel_id === p.id).length, filtro: { situacao: "abertas", resp: String(p.id) } })),
            { nome: "Sem responsável", valor: abertas.filter((d) => !d.responsavel_id).length, filtro: { situacao: "abertas", resp: "sem" } }].sort((a, b) => b.valor - a.valor)} />

        <Barras titulo="Interna × contratada" ajuda="Demandas abertas por forma de execução: feitas pela equipe Triunfo ou por empresa contratada." link={link}
          itens={Object.entries(FORMAS).map(([k, n]) => ({ nome: n, valor: abertas.filter((d) => d.forma_execucao === k).length, filtro: { situacao: "abertas", forma: k } }))} />

        <Barras titulo="Todas por situação" ajuda="Todas as demandas (abertas e encerradas) por situação atual." link={link}
          itens={Object.entries(SITUACOES).map(([k, n]) => ({ nome: n, valor: porSit(k as Situacao), filtro: { situacao: k } }))} />

        {eGestor && save && (
          <section className="cartao">
            <h2>Economia (Save) <Ajuda>Soma do Save das demandas com orçado externo informado. Save = Orçado externo − custo realizado total. Visível só para o Gestor. Não considera o recorte de filtros.</Ajuda></h2>
            <p className="numero-grande">{fmtMoeda(save.total)}</p>
            <p className="sutil pequeno">em {save.n} demanda(s) com orçado externo</p>
          </section>
        )}

        {uso && (
          <section className="cartao">
            <h2>Armazenamento de arquivos <Ajuda>O plano gratuito permite 1 GB de arquivos. Fotos já são reduzidas no envio. Ao passar de 80%, avalie arquivar ou migrar.</Ajuda></h2>
            <div className="barra-trilho grande"><span className={`barra${uso.bytes / LIMITES.armazenamentoBytes > 0.8 ? " barra-critico" : ""}`} style={{ width: `${Math.min(100, (uso.bytes / LIMITES.armazenamentoBytes) * 100)}%` }} /></div>
            <p className="pequeno">{fmtBytes(uso.bytes)} de 1 GB · {uso.arquivos} arquivo(s)</p>
          </section>
        )}
      </div>
    </div>
  );
}
