import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase, mensagemErro } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { ETAPAS, FORMAS, fmtData, hojeISO } from "../lib/dominio";
import { FILTROS_PADRAO, aplicarFiltros, type DemandaLinha } from "../lib/filtros";
import type { Dependencia, ItemCronograma } from "../lib/cronograma";
import { carregarDemandas } from "./Demandas";
import { linhaGantt } from "../components/demanda/CronogramaAba";
import Gantt, { LegendaGantt, type LinhaGantt } from "../components/Gantt";
import { Ajuda, Aviso, Carregando, Vazio } from "../components/ui";

const JANELAS: Record<string, string> = { auto: "Ajustar às datas", "3": "3 meses", "6": "6 meses", "12": "12 meses" };

export default function Cronograma() {
  const { cadastros } = useAuth();
  const nav = useNavigate();
  const [demandas, setDemandas] = useState<DemandaLinha[] | null>(null);
  const [itens, setItens] = useState<ItemCronograma[]>([]);
  const [deps, setDeps] = useState<Dependencia[]>([]);
  const [uteis, setUteis] = useState<Set<number>>(new Set());
  const [erro, setErro] = useState("");
  const [resp, setResp] = useState("");
  const [forma, setForma] = useState("");
  const [situacao, setSituacao] = useState("ativas");
  const [q, setQ] = useState("");
  const [janela, setJanela] = useState("6");
  const [soAtraso, setSoAtraso] = useState(false);
  const hoje = hojeISO();

  useEffect(() => {
    Promise.all([carregarDemandas(), supabase.from("cronograma").select("*").order("ordem"),
      supabase.from("cronograma_dependencias").select("*"), supabase.from("cronograma_config").select("demanda_id, dias_uteis")])
      .then(([d, c, dp, cf]) => {
        if (c.error) throw c.error;
        setDemandas(d.lista); setItens(c.data as ItemCronograma[]);
        setDeps((dp.data as Dependencia[]) ?? []);
        setUteis(new Set(((cf.data ?? []) as { demanda_id: number; dias_uteis: boolean }[]).filter((x) => x.dias_uteis).map((x) => x.demanda_id)));
      })
      .catch((e) => setErro(mensagemErro(e)));
  }, []);

  const filtradas = useMemo(() => demandas
    ? aplicarFiltros(demandas, { ...FILTROS_PADRAO, situacao, resp, forma, q }, new Set())
    : [], [demandas, situacao, resp, forma, q]);

  if (erro) return <div className="pagina"><Aviso tipo="critico">{erro}</Aviso></div>;
  if (!demandas) return <Carregando />;

  const porDemanda = new Map<number, ItemCronograma[]>();
  itens.forEach((i) => porDemanda.set(i.demanda_id, [...(porDemanda.get(i.demanda_id) ?? []), i]));
  const comCrono = filtradas.filter((d) => porDemanda.has(d.id));
  const semCrono = filtradas.filter((d) => !porDemanda.has(d.id));

  const linhas: (LinhaGantt & { atraso: number; ordem: string })[] = comCrono.map((d) => {
    const its = porDemanda.get(d.id)!;
    const ls = its.map((i) => linhaGantt(i, d, hoje, { uteis: uteis.has(d.id), deps, itens: its }));
    const pi = its.map((i) => i.inicio_previsto ?? i.fim_previsto).filter(Boolean).sort() as string[];
    const pf = its.map((i) => i.fim_previsto ?? i.inicio_previsto).filter(Boolean).sort() as string[];
    const ri = its.map((i) => i.inicio_real ?? i.fim_real).filter(Boolean).sort() as string[];
    const aberto = its.some((i) => i.inicio_real && !i.fim_real);
    const rf = its.map((i) => i.fim_real).filter(Boolean).sort() as string[];
    const atrasadas = ls.filter((l) => l.tom === "critico").length;
    const maiorDesvio = Math.max(0, ...ls.map((l) => l.desvio ?? 0));
    return {
      chave: String(d.id),
      nome: <><span className="codigo">{d.codigo}</span> {d.assunto}</>,
      sub: <>
        {d.situacao === "concluida" ? "Concluída" : ETAPAS[d.etapa]} · {d.responsavel_nome ?? "sem responsável"}
        {atrasadas > 0 && <span className="tom-texto-critico"> · {atrasadas} etapa{atrasadas > 1 ? "s" : ""} atrasada{atrasadas > 1 ? "s" : ""}</span>}
      </>,
      previsto: pi.length ? [pi[0], pf[pf.length - 1]] as [string, string] : null,
      realizado: ri.length ? [ri[0], aberto || d.situacao !== "concluida" ? null : rf[rf.length - 1] ?? ri[ri.length - 1]] as [string, string | null] : null,
      tom: (atrasadas ? "critico" : "neutro") as LinhaGantt["tom"],
      situacao: atrasadas ? `${atrasadas} etapa(s) atrasada(s) · maior desvio ${maiorDesvio} dias` : "Sem atraso",
      marco: d.prazo_conclusao ? { data: d.prazo_conclusao, rotulo: "Prazo de conclusão" } : null,
      atraso: atrasadas, ordem: pi[0] ?? ri[0] ?? "9999",
    };
  }).filter((l) => !soAtraso || l.atraso > 0)
    .sort((a, b) => b.atraso - a.atraso || a.ordem.localeCompare(b.ordem));

  const todasDatas = linhas.flatMap((l) => [l.previsto?.[0], l.previsto?.[1], l.realizado?.[0], l.realizado?.[1], l.marco?.data]).filter(Boolean) as string[];
  let per: [string, string];
  if (janela === "auto" && todasDatas.length) {
    const ord = [...todasDatas, hoje].sort();
    per = [ord[0], ord[ord.length - 1]];
  } else {
    const meses = janela === "auto" ? 6 : Number(janela);
    const h = new Date(hoje + "T00:00:00Z");
    const ini = new Date(Date.UTC(h.getUTCFullYear(), h.getUTCMonth() - Math.max(1, Math.round(meses / 4)), 1));
    const fim = new Date(Date.UTC(ini.getUTCFullYear(), ini.getUTCMonth() + meses, 0));
    per = [ini.toISOString().slice(0, 10), fim.toISOString().slice(0, 10)];
  }

  return (
    <div className="pagina">
      <div className="pagina-topo">
        <div>
          <h1>Cronograma</h1>
          <p className="sutil">Linha do tempo das demandas: previsto × realizado. Clique numa linha para abrir o cronograma da demanda.</p>
        </div>
      </div>
      <div className="filtros cartao">
        <div className="filtros-linha">
          <select value={situacao} onChange={(e) => setSituacao(e.target.value)} aria-label="Situação">
            <option value="ativas">Ativas</option><option value="abertas">Abertas (inclui suspensas)</option><option value="todas">Todas</option><option value="concluida">Concluídas</option>
          </select>
          <select value={resp} onChange={(e) => setResp(e.target.value)} aria-label="Responsável">
            <option value="">Todos os responsáveis</option>
            {cadastros.pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
          <select value={forma} onChange={(e) => setForma(e.target.value)} aria-label="Execução">
            <option value="">Interna e contratada</option>
            {Object.entries(FORMAS).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
          <select value={janela} onChange={(e) => setJanela(e.target.value)} aria-label="Período">
            {Object.entries(JANELAS).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
          <input type="search" className="busca-curta" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar demanda…" aria-label="Buscar" />
          <label className="check-linha pequeno"><input type="checkbox" checked={soAtraso} onChange={(e) => setSoAtraso(e.target.checked)} /> Só com etapa atrasada</label>
        </div>
      </div>

      <section className="cartao">
        <h2>{linhas.length} demanda{linhas.length === 1 ? "" : "s"} com cronograma <Ajuda>Para cada demanda: o previsto vai do primeiro início previsto ao último fim previsto; o realizado, do primeiro início realizado até o último fim (ou até hoje, se ainda em andamento). Em vermelho, demandas com alguma etapa atrasada.</Ajuda></h2>
        <p className="sutil pequeno">Período: {fmtData(per[0])} a {fmtData(per[1])} · ordenado por atrasos e data de início</p>
        {linhas.length === 0 ? <Vazio titulo="Nenhuma demanda com cronograma neste filtro">Crie o cronograma na aba “Cronograma” de cada demanda.</Vazio> : (
          <>
            <Gantt linhas={linhas} periodo={per} rotuloColuna="Demanda" aoClicar={(k) => nav(`/demandas/${k}?aba=cronograma`)} />
            <LegendaGantt />
          </>
        )}
      </section>

      {semCrono.length > 0 && (
        <details className="cartao">
          <summary><strong>{semCrono.length} demanda{semCrono.length === 1 ? "" : "s"} sem cronograma</strong> <span className="sutil pequeno">neste filtro — clique para ver</span></summary>
          <ul className="lista-simples pequeno">
            {semCrono.slice(0, 60).map((d) => (
              <li key={d.id}><Link to={`/demandas/${d.id}?aba=cronograma`}>{d.codigo} · {d.assunto}</Link> <span className="sutil">— {ETAPAS[d.etapa]} · {d.responsavel_nome ?? "sem responsável"}</span></li>
            ))}
          </ul>
          {semCrono.length > 60 && <p className="sutil pequeno">+{semCrono.length - 60} demandas. Use os filtros para reduzir a lista.</p>}
        </details>
      )}
    </div>
  );
}
