import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { supabase, mensagemErro } from "../lib/supabase";
import { fmtData, hojeISO } from "../lib/dominio";
import { CLIMA, MOTIVOS_PARALISACAO, dataComSemana, destaques, fmtHoras, resumirPeriodo, textoParaIA, type RdoResumivel } from "../lib/rdo";
import { Ajuda, Aviso, Campo, Carregando, Vazio, notificar } from "../components/ui";

const somaDias = (iso: string, n: number) => {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

export default function RdoResumo() {
  const { id } = useParams();
  const [qs, setQs] = useSearchParams();
  const hoje = hojeISO();
  const de = qs.get("de") ?? hoje.slice(0, 8) + "01";
  const ate = qs.get("ate") ?? hoje;
  const [demanda, setDemanda] = useState<{ codigo: string; assunto: string; local_nome: string | null } | null>(null);
  const [rdos, setRdos] = useState<RdoResumivel[] | null>(null);
  const [primeiroRdo, setPrimeiroRdo] = useState<string | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    supabase.from("v_demandas").select("codigo, assunto, local_nome").eq("id", Number(id)).maybeSingle().then(({ data }) => setDemanda(data));
    supabase.from("rdos").select("data").eq("demanda_id", Number(id)).order("data").limit(1).then(({ data }) => setPrimeiroRdo(data?.[0]?.data ?? null));
  }, [id]);

  useEffect(() => {
    setRdos(null);
    supabase.from("rdos").select("*").eq("demanda_id", Number(id)).gte("data", de).lte("data", ate).order("data")
      .then(({ data, error }) => (error ? setErro(mensagemErro(error)) : setRdos(data as RdoResumivel[])));
  }, [id, de, ate]);

  const s = useMemo(() => (rdos ? resumirPeriodo(rdos) : null), [rdos]);
  const periodo = (a: string, b: string) => setQs({ de: a, ate: b }, { replace: true });
  const mesAnterior = () => {
    const ini = new Date(Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7)) - 2, 1);
    const fim = new Date(Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7)) - 1, 0);
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    periodo(iso(ini), iso(fim));
  };

  if (erro) return <div className="pagina"><Aviso tipo="critico">{erro}</Aviso></div>;
  if (!demanda) return <Carregando />;
  const nomeObra = `${demanda.codigo} · ${demanda.assunto}${demanda.local_nome ? ` · ${demanda.local_nome}` : ""}`;

  function copiarIA() {
    if (!s) return;
    navigator.clipboard.writeText(textoParaIA(nomeObra, de, ate, s)).then(
      () => notificar("Texto copiado. Abra o Claude (claude.ai), cole e envie para receber o resumo redigido."),
      () => notificar("Não foi possível copiar.", "erro"),
    );
  }

  const maxHoras = Math.max(1, ...(s?.paralisacao.map((p) => p.horas) ?? [1]));
  const pct = ([a, b]: [number, number]) => (b ? `${a} de ${b} (${Math.round((a / b) * 100)}%)` : "sem registro");

  return (
    <div className="pagina pagina-estreita rdo-resumo-pagina">
      <div className="so-tela">
        <Link to={`/demandas/${id}?aba=rdo`} className="voltar">← {demanda.codigo} · RDOs</Link>
      </div>
      <div className="rdo-cabecalho">
        <img src="/logo-cor.svg" alt="Triunfo Logística" className="so-impressao rdo-logo" />
        <div>
          <h1>Resumo do período — RDO</h1>
          <p><strong>{demanda.codigo}</strong> · {demanda.assunto}{demanda.local_nome && ` · ${demanda.local_nome}`}</p>
          <p className="rdo-data"><strong>Período:</strong> {fmtData(de)} a {fmtData(ate)}</p>
        </div>
        <div className="linha so-tela">
          <button className="btn" disabled={!s?.rdos} onClick={copiarIA}>Copiar para IA</button>
          <button className="btn btn-primario" onClick={() => window.print()}>Imprimir / PDF</button>
        </div>
      </div>

      <section className="cartao so-tela">
        <div className="linha filtros-periodo">
          <Campo rotulo="De"><input type="date" value={de} max={ate} onChange={(e) => e.target.value && periodo(e.target.value, ate)} /></Campo>
          <Campo rotulo="Até"><input type="date" value={ate} min={de} onChange={(e) => e.target.value && periodo(de, e.target.value)} /></Campo>
          <div className="linha">
            <button className="btn btn-link" onClick={() => periodo(somaDias(hoje, -6), hoje)}>Últimos 7 dias</button>
            <button className="btn btn-link" onClick={() => periodo(hoje.slice(0, 8) + "01", hoje)}>Este mês</button>
            <button className="btn btn-link" onClick={mesAnterior}>Mês anterior</button>
            {primeiroRdo && <button className="btn btn-link" onClick={() => periodo(primeiroRdo, hoje)}>Desde o início</button>}
          </div>
        </div>
        <p className="sutil pequeno">
          Consolida os RDOs finalizados do período (rascunhos ficam de fora). <strong>Copiar para IA</strong> copia os dados prontos para colar no Claude
          e receber um resumo redigido — sem custo para o sistema. <Ajuda>O resumo abaixo é calculado pelo próprio sistema a partir do que foi registrado. Para as horas de paralisação, registre cada parada no RDO com motivo e horário (seção 6).</Ajuda>
        </p>
      </section>

      {!s ? <Carregando /> : s.rdos === 0 ? (
        <Vazio titulo="Nenhum RDO finalizado no período">{s.rascunhosIgnorados ? `${s.rascunhosIgnorados} rascunho(s) não entram no resumo.` : "Escolha outro período."}</Vazio>
      ) : (
        <>
          <section className="cartao">
            <h2>Destaques</h2>
            <ul className="destaques">{destaques(s).map((t, i) => <li key={i}>{t}</li>)}</ul>
            {s.rascunhosIgnorados > 0 && <p className="sutil pequeno">{s.rascunhosIgnorados} rascunho(s) no período não foram considerados.</p>}
          </section>

          <div className="indicadores resumo-ind">
            <div className="indicador"><span className="ind-valor">{s.rdos}</span><span className="ind-nome">RDOs</span></div>
            <div className="indicador"><span className="ind-valor">{fmtHoras(s.horasParalisadas)}</span><span className="ind-nome">Paralisado</span></div>
            <div className="indicador"><span className="ind-valor">{fmtHoras(s.horasMauTempo)}</span><span className="ind-nome">Parado por mau tempo</span></div>
            <div className="indicador"><span className="ind-valor">{s.diasComChuva}</span><span className="ind-nome">Dias com chuva</span></div>
          </div>

          <section className="cartao">
            <h2>Paralisações por motivo</h2>
            {s.paralisacao.length === 0 ? <p className="sutil">Nenhuma paralisação registrada no período.</p> : (
              <table className="tabela compacta">
                <thead><tr><th>Motivo</th><th className="num">Horas</th><th className="num">Vezes</th><th className="num">Dias</th><th className="so-tela" /></tr></thead>
                <tbody>
                  {s.paralisacao.map((p) => (
                    <tr key={p.motivo}>
                      <td>{p.nome}</td><td className="num">{fmtHoras(p.horas)}</td><td className="num">{p.vezes}</td><td className="num">{p.dias}</td>
                      <td className="so-tela barra-celula"><span className="barra-h" style={{ width: `${(p.horas / maxHoras) * 100}%` }} /></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="linha-total"><td><strong>Total</strong></td><td className="num"><strong>{fmtHoras(s.horasParalisadas)}</strong></td><td className="num"><strong>{s.paralisacoes.length}</strong></td><td /><td className="so-tela" /></tr></tfoot>
              </table>
            )}
            {s.horasTrabalhadas > 0 && s.horasParalisadas > 0 && (
              <p className="pequeno">Jornada registrada no período: {fmtHoras(s.horasTrabalhadas)} · parado: {Math.round((s.horasParalisadas / s.horasTrabalhadas) * 100)}%</p>
            )}
            {s.paralisacoesSemHorario > 0 && <Aviso tipo="atencao">{s.paralisacoesSemHorario} paralisação(ões) sem horário completo não entram na soma de horas.</Aviso>}
            {s.paralisacoes.length > 0 && (
              <details className="detalhes" open>
                <summary>Paralisações dia a dia</summary>
                <ul className="lista-dias">
                  {s.paralisacoes.map((p, i) => (
                    <li key={i}><strong className="primeira-maiuscula">{dataComSemana(p.data)}</strong> — {MOTIVOS_PARALISACAO[p.motivo] ?? p.motivo}
                      {p.horas !== null ? ` · ${p.inicio} às ${p.fim} (${fmtHoras(p.horas)})` : " · sem horário"}{p.descricao && ` · ${p.descricao}`}</li>
                  ))}
                </ul>
              </details>
            )}
          </section>

          <section className="cartao">
            <h2>Clima e condição da área</h2>
            <p>{Object.entries(CLIMA).filter(([k]) => s.clima[k]).map(([k, n]) => `${n}: ${s.clima[k]} turno(s)`).join(" · ") || "Clima não informado."}</p>
            <p className="pequeno">Dias com chuva: <strong>{s.diasComChuva}</strong> · Dias com área impraticável: <strong>{s.diasAreaImpraticavel}</strong></p>
          </section>

          <section className="cartao">
            <h2>Efetivo e equipamentos</h2>
            <p>{s.homensDia} homens-dia ({s.proprio} próprios, {s.terceiro} terceiros) · média {s.mediaDia.toFixed(1).replace(".", ",")} por dia
              {s.picoDia && ` · pico de ${s.picoDia.pessoas} em ${fmtData(s.picoDia.data)}`}</p>
            {s.equipamentos.length > 0 && <p className="pequeno">Equipamentos: {s.equipamentos.map((e) => `${e.descricao} (${e.dias} dia${e.dias > 1 ? "s" : ""})`).join(" · ")}</p>}
          </section>

          <section className="cartao">
            <h2>Ocorrências</h2>
            {s.ocorrencias.length === 0 ? <p className="sutil">Nenhuma ocorrência.</p> : (
              <ul className="lista-dias">
                {s.ocorrencias.map((o, i) => (
                  <li key={i}><strong className="primeira-maiuscula">{dataComSemana(o.data)}</strong> — <span className="pre">{o.descricao}</span>{o.impedimento && <span className="texto-critico pequeno"> ▲ Impedimento</span>}</li>
                ))}
              </ul>
            )}
          </section>

          <section className="cartao">
            <h2>Segurança</h2>
            <p className="pequeno">DDS: {pct(s.seguranca.dds)} · PT: {pct(s.seguranca.pt)} · AST: {pct(s.seguranca.ast)}</p>
            {s.incidentes.length > 0 && (
              <ul className="lista-dias">{s.incidentes.map((x, i) => <li key={i}><strong className="primeira-maiuscula">{dataComSemana(x.data)}</strong> — <span className="pre">{x.texto}</span></li>)}</ul>
            )}
          </section>

          {(s.apontamentos.length > 0 || s.ressalvas > 0) && (
            <section className="cartao destaque">
              <h2>Apontamentos da Contratante (Triunfo)</h2>
              {s.ressalvas > 0 && <p className="pequeno">{s.ressalvas} RDO(s) revisado(s) com ressalvas.</p>}
              <ul className="lista-dias">{s.apontamentos.map((x, i) => <li key={i}><strong className="primeira-maiuscula">{dataComSemana(x.data)}</strong> — <span className="pre">{x.texto}</span></li>)}</ul>
            </section>
          )}

          <section className="cartao">
            <h2>Atividades executadas</h2>
            {s.atividades.length === 0 ? <p className="sutil">Sem registro.</p> : (
              <ul className="lista-dias">{s.atividades.map((x, i) => <li key={i}><strong className="primeira-maiuscula">{dataComSemana(x.data)}</strong> — <span className="pre">{x.texto}</span></li>)}</ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
