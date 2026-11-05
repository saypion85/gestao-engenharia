import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase, mensagemErro } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { CLASSES, ETAPAS, FORMAS, SITUACOES, diasAte, fmtData } from "../lib/dominio";
import { aplicarFiltros, filtrosParaURL, lerFiltros, MARCADORES, ordenarPadrao, type DemandaLinha, type Filtros } from "../lib/filtros";
import { Aviso, BadgeClasse, BadgeSituacao, Carregando, Vazio } from "../components/ui";

export async function carregarDemandas() {
  const [d, imp] = await Promise.all([
    supabase.from("v_demandas").select("*").order("id"),
    supabase.from("v_impedimentos").select("demanda_id"),
  ]);
  if (d.error) throw d.error;
  return { lista: (d.data ?? []) as DemandaLinha[], impedimentos: new Set((imp.data ?? []).map((i) => i.demanda_id as number)) };
}

export function PrazoCelula({ d }: { d: DemandaLinha }) {
  if (!d.prazo_conclusao) return <span className="sutil">—</span>;
  const n = diasAte(d.prazo_conclusao)!;
  const aberta = d.situacao !== "concluida" && d.situacao !== "cancelada";
  return (
    <span className={aberta && n < 0 ? "texto-critico" : aberta && n <= 7 ? "texto-atencao" : ""}>
      {fmtData(d.prazo_conclusao)}
      {aberta && n < 0 && <small> ({-n}d atraso)</small>}
    </span>
  );
}

export default function Demandas() {
  const { cadastros, podeEditar, eContratada } = useAuth();
  const [params, setParams] = useSearchParams();
  const f = lerFiltros(params);
  const [dados, setDados] = useState<{ lista: DemandaLinha[]; impedimentos: Set<number> } | null>(null);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState(f.q);
  const [verFiltros, setVerFiltros] = useState(false);

  useEffect(() => {
    carregarDemandas().then(setDados).catch((e) => setErro(mensagemErro(e)));
  }, []);

  // mantém a caixa de busca alinhada à URL (ex.: ao clicar em "Demandas" no menu)
  const qURL = params.get("q") ?? "";
  useEffect(() => { setBusca(qURL); }, [qURL]);

  // busca com pequeno atraso para não filtrar a cada tecla
  useEffect(() => {
    const t = setTimeout(() => {
      if (busca !== (new URLSearchParams(window.location.search).get("q") ?? "")) mudar({ q: busca });
    }, 250);
    return () => clearTimeout(t);
  }, [busca]); // eslint-disable-line react-hooks/exhaustive-deps

  // sempre parte dos filtros atuais da URL (evita reaplicar um filtro antigo)
  function mudar(p: Partial<Filtros>) {
    const atual = new URLSearchParams(window.location.search);
    setParams(filtrosParaURL({ ...lerFiltros(atual), ...p }), { replace: true });
  }

  const filtradas = useMemo(
    () => (dados ? aplicarFiltros(dados.lista, f, dados.impedimentos).sort(ordenarPadrao) : []),
    [dados, params], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const filtrosAtivos = filtrosParaURL({ ...f, q: "" }).toString() !== "";

  return (
    <div className="pagina">
      <div className="pagina-topo">
        <div>
          <h1>{eContratada ? "Minhas demandas" : "Demandas"}</h1>
          <p className="sutil">{dados ? `${filtradas.length} de ${dados.lista.length} demandas` : " "}</p>
        </div>
        {podeEditar && <Link to="/demandas/nova" className="btn btn-primario">+ Nova demanda</Link>}
      </div>

      <div className="filtros cartao">
        <input className="busca" type="search" placeholder="Buscar por assunto, código, local, MD, RMS, OS…"
          value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar" />
        <button className="btn so-celular-flex" onClick={() => setVerFiltros(!verFiltros)} aria-expanded={verFiltros}>
          {verFiltros ? "Ocultar filtros" : `Filtros${filtrosAtivos ? " (ativos)" : ""}`}
        </button>
        <div className={`filtros-linha filtros-recolhiveis${verFiltros ? " aberto" : ""}`}>
          <select value={f.situacao} onChange={(e) => mudar({ situacao: e.target.value })} aria-label="Situação">
            <option value="abertas">Abertas</option>
            <option value="ativas">Ativas (sem suspensas)</option>
            <option value="todas">Todas as situações</option>
            {Object.entries(SITUACOES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={f.etapa} onChange={(e) => mudar({ etapa: e.target.value })} aria-label="Etapa">
            <option value="">Todas as etapas</option>
            {Object.entries(ETAPAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {!eContratada && (
            <select value={f.resp} onChange={(e) => mudar({ resp: e.target.value })} aria-label="Responsável">
              <option value="">Todos os responsáveis</option>
              <option value="sem">Sem responsável</option>
              {cadastros.pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          )}
          <select value={f.forma} onChange={(e) => mudar({ forma: e.target.value })} aria-label="Forma de execução">
            <option value="">Interna e contratada</option>
            {Object.entries(FORMAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={f.classe} onChange={(e) => mudar({ classe: e.target.value })} aria-label="Classe de prioridade">
            <option value="">Todas as prioridades</option>
            {Object.entries(CLASSES).map(([k, v]) => <option key={k} value={k}>{v.nome}</option>)}
            <option value="sem">Sem avaliação</option>
          </select>
          <select value={f.local} onChange={(e) => mudar({ local: e.target.value })} aria-label="Local">
            <option value="">Todos os locais</option>
            {cadastros.locais.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
          {!eContratada && (
            <select value={f.marcador} onChange={(e) => mudar({ marcador: e.target.value })} aria-label="Atenção">
              <option value="">Sem filtro de atenção</option>
              {Object.entries(MARCADORES).map(([k, v]) => <option key={k} value={k}>{v.nome}</option>)}
            </select>
          )}
          {(filtrosAtivos || f.q) && (
            <button className="btn btn-link" onClick={() => { setBusca(""); setParams(new URLSearchParams(), { replace: true }); }}>Limpar filtros</button>
          )}
        </div>
        {f.doc && <p className="sutil pequeno">Recorte do painel: contratadas ativas com MD “{f.doc.split("|")[0]}” e “{f.doc.split("|")[1]}”.</p>}
        {f.marcador && MARCADORES[f.marcador as keyof typeof MARCADORES] && (
          <p className="sutil pequeno">Critério: {MARCADORES[f.marcador as keyof typeof MARCADORES].criterio}</p>
        )}
      </div>

      {erro && <Aviso tipo="critico">{erro}</Aviso>}
      {!dados && !erro && <Carregando />}
      {dados && filtradas.length === 0 && (
        <Vazio titulo="Nenhuma demanda encontrada">Ajuste a busca ou os filtros acima.</Vazio>
      )}

      {dados && filtradas.length > 0 && (
        <>
          <div className="tabela-rolagem cartao so-desktop">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Prioridade</th>
                  <th>Demanda</th>
                  <th>Local</th>
                  {!eContratada && <th>Responsável</th>}
                  <th>Situação</th>
                  <th>Etapa</th>
                  <th>Prazo</th>
                  {!eContratada && <th title="Dias desde o último registro no histórico">Últ. atualização</th>}
                </tr>
              </thead>
              <tbody>
                {filtradas.map((d) => (
                  <tr key={d.id}>
                    <td><BadgeClasse c={d.classe} ranking={d.ranking} /></td>
                    <td className="col-demanda">
                      <Link to={`/demandas/${d.id}`} className="link-demanda">
                        <span className="codigo">{d.codigo}</span> {d.assunto}
                      </Link>
                      {d.situacao === "aguardando" && d.aguardando_o_que && <div className="sutil pequeno">Aguardando: {d.aguardando_o_que}</div>}
                      {dados.impedimentos.has(d.id) && <div className="texto-critico pequeno">▲ Impedimento</div>}
                    </td>
                    <td>{d.local_nome ?? "—"}</td>
                    {!eContratada && <td>{d.responsavel_nome ?? <span className="texto-atencao">Sem responsável</span>}</td>}
                    <td><BadgeSituacao s={d.situacao} /></td>
                    <td>{ETAPAS[d.etapa]}<div className="sutil pequeno">{d.forma_execucao === "interna" ? "Interna" : "Contratada"}</div></td>
                    <td><PrazoCelula d={d} /></td>
                    {!eContratada && (
                      <td className={(d.dias_sem_atualizacao ?? 0) > 15 && d.situacao !== "concluida" && d.situacao !== "cancelada" ? "texto-atencao" : ""}>
                        {d.dias_sem_atualizacao === null ? "—" : d.dias_sem_atualizacao === 0 ? "hoje" : `${d.dias_sem_atualizacao} dias`}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="lista-cartoes so-celular">
            {filtradas.map((d) => (
              <li key={d.id}>
                <Link to={`/demandas/${d.id}`} className="cartao cartao-demanda">
                  <div className="cartao-demanda-topo">
                    <span className="codigo">{d.codigo}</span>
                    <BadgeClasse c={d.classe} ranking={d.ranking} />
                  </div>
                  <strong>{d.assunto}</strong>
                  <div className="sutil pequeno">{[d.local_nome, d.responsavel_nome].filter(Boolean).join(" · ")}</div>
                  <div className="cartao-demanda-base">
                    <BadgeSituacao s={d.situacao} />
                    <span className="pequeno">{ETAPAS[d.etapa]}</span>
                    {d.prazo_conclusao && <span className="pequeno"><PrazoCelula d={d} /></span>}
                  </div>
                  {dados.impedimentos.has(d.id) && <div className="texto-critico pequeno">▲ Impedimento</div>}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
