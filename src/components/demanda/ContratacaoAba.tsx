import { useCallback, useEffect, useState, type FormEvent } from "react";
import { supabase, mensagemErro } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { MD_SITUACOES, RMS_SITUACOES, fmtData } from "../../lib/dominio";
import type { DemandaLinha } from "../../lib/filtros";
import { Ajuda, Carregando, Vazio, notificar } from "../ui";

interface Revisao { id: number; codigo: string; revisao: number; data: string | null; observacao: string | null }
interface Rms { id: number; numero: string; situacao: string; descricao: string | null }

const pad = (n: number) => String(n).padStart(3, "0");

export default function ContratacaoAba({ d, recarregar }: { d: DemandaLinha; recarregar: () => void }) {
  const { podeEditar, cadastros } = useAuth();
  const [revs, setRevs] = useState<Revisao[] | null>(null);
  const [rms, setRms] = useState<Rms[] | null>(null);
  const [novaRms, setNovaRms] = useState("");
  const [os, setOs] = useState(d.os_numero ?? "");
  const [empresa, setEmpresa] = useState<number | null>(d.empresa_id);

  const carregar = useCallback(async () => {
    const [a, b] = await Promise.all([
      supabase.from("memoriais_revisoes").select("*").eq("demanda_id", d.id).order("revisao", { ascending: false }),
      supabase.from("rms").select("*").eq("demanda_id", d.id).order("id"),
    ]);
    setRevs((a.data as Revisao[]) ?? []);
    setRms((b.data as Rms[]) ?? []);
  }, [d.id]);
  useEffect(() => { carregar(); }, [carregar]);

  async function novaRevisao() {
    const base = d.md_codigo ?? prompt("Código base do MD (sem a revisão). Ex.: MD-INF-043-2026")?.trim();
    if (!base) return;
    const proxima = revs && revs.length ? Math.max(...revs.map((r) => r.revisao)) + 1 : 0;
    const obs = prompt(`Registrar ${base}-${pad(proxima)}. Observação da revisão (opcional):`, "") ;
    if (obs === null) return;
    const { error } = await supabase.from("memoriais_revisoes").insert({ demanda_id: d.id, codigo: `${base}-${pad(proxima)}`, revisao: proxima, data: new Date().toISOString().slice(0, 10), observacao: obs || null });
    if (error) return notificar(mensagemErro(error), "erro");
    const upd: Record<string, unknown> = { md_situacao: "emitido" };
    if (!d.md_codigo) upd.md_codigo = base;
    await supabase.from("demandas").update(upd).eq("id", d.id);
    await supabase.from("historico").insert({ demanda_id: d.id, texto: `MD ${base}-${pad(proxima)} registrado (revisão ${proxima}).` });
    notificar("Revisão do MD registrada.");
    carregar();
    recarregar();
  }

  async function adicionarRms(e: FormEvent) {
    e.preventDefault();
    if (!novaRms.trim()) return;
    const { error } = await supabase.from("rms").insert({ demanda_id: d.id, numero: novaRms.trim() });
    if (error) return notificar(mensagemErro(error), "erro");
    await supabase.from("historico").insert({ demanda_id: d.id, texto: `RMS ${novaRms.trim()} aberta.` });
    setNovaRms("");
    carregar();
    recarregar();
  }

  async function mudarRms(r: Rms, situacao: string) {
    const { error } = await supabase.from("rms").update({ situacao }).eq("id", r.id);
    if (error) return notificar(mensagemErro(error), "erro");
    await supabase.from("historico").insert({ demanda_id: d.id, texto: `RMS ${r.numero}: ${RMS_SITUACOES[situacao]}.`, tipo: "atualizacao" });
    carregar();
  }

  async function excluirRms(r: Rms) {
    if (!confirm(`Remover a RMS ${r.numero} desta demanda? (Se ela foi cancelada, prefira marcar como "Cancelada".)`)) return;
    await supabase.from("rms").delete().eq("id", r.id);
    carregar();
    recarregar();
  }

  async function salvarDados(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("demandas").update({ os_numero: os.trim() || null, empresa_id: empresa }).eq("id", d.id);
    if (error) return notificar(mensagemErro(error), "erro");
    notificar("Dados da contratação salvos.");
    recarregar();
  }

  if (!revs || !rms) return <Carregando />;

  return (
    <div className="resumo">
      <section className="cartao">
        <div className="linha linha-entre">
          <h2>Memorial Descritivo <Ajuda>Cada demanda tem um MD. Ao revisar, registre a nova revisão: o número sobe automaticamente (000, 001, 002…).</Ajuda></h2>
          {podeEditar && <button className="btn" onClick={novaRevisao}>+ Registrar revisão</button>}
        </div>
        <p>Situação: <strong>{d.md_situacao ? MD_SITUACOES[d.md_situacao] : "Não informada"}</strong>{d.md_codigo && <> · Código base: <strong>{d.md_codigo}</strong></>}</p>
        {revs.length === 0 ? <Vazio titulo="Nenhuma revisão registrada" /> : (
          <table className="tabela compacta">
            <thead><tr><th>Código</th><th>Revisão</th><th>Data</th><th>Observação</th></tr></thead>
            <tbody>{revs.map((r, i) => (
              <tr key={r.id}><td><strong>{r.codigo}</strong>{i === 0 && <span className="badge"> vigente</span>}</td><td>{r.revisao}</td><td>{fmtData(r.data)}</td><td>{r.observacao ?? "—"}</td></tr>
            ))}</tbody>
          </table>
        )}
        <p className="sutil pequeno">O arquivo do MD pode ser anexado na aba Documentos, categoria “Memorial”.</p>
      </section>

      <section className="cartao">
        <h2>RMS — Requisição de Material e Serviço <Ajuda>Uma demanda pode ter várias RMS. Atualize a situação de cada uma conforme o andamento em Suprimentos.</Ajuda></h2>
        {rms.length === 0 && <Vazio titulo="Nenhuma RMS registrada" />}
        {rms.length > 0 && (
          <table className="tabela compacta">
            <thead><tr><th>Número</th><th>Situação</th><th>Observação</th>{podeEditar && <th />}</tr></thead>
            <tbody>{rms.map((r) => (
              <tr key={r.id}>
                <td><strong>{r.numero}</strong></td>
                <td>{podeEditar ? (
                  <select value={r.situacao} onChange={(e) => mudarRms(r, e.target.value)} aria-label={`Situação da RMS ${r.numero}`}>
                    {Object.entries(RMS_SITUACOES).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
                  </select>) : RMS_SITUACOES[r.situacao]}</td>
                <td className="pequeno">{r.descricao ?? "—"}</td>
                {podeEditar && <td><button className="btn-icone" onClick={() => excluirRms(r)} aria-label="Remover">✕</button></td>}
              </tr>
            ))}</tbody>
          </table>
        )}
        {podeEditar && (
          <form className="linha" onSubmit={adicionarRms}>
            <input value={novaRms} onChange={(e) => setNovaRms(e.target.value)} placeholder="Número da RMS" inputMode="numeric" aria-label="Número da nova RMS" />
            <button className="btn">Adicionar RMS</button>
          </form>
        )}
      </section>

      <section className="cartao">
        <h2>Ordem de Serviço e empresa</h2>
        <form onSubmit={salvarDados} className="grade-2">
          <label className="campo"><span className="campo-rotulo">Número da OS</span>
            <input value={os} onChange={(e) => setOs(e.target.value)} disabled={!podeEditar} /></label>
          <label className="campo"><span className="campo-rotulo">Empresa contratada</span>
            <select value={empresa ?? ""} onChange={(e) => setEmpresa(e.target.value ? Number(e.target.value) : null)} disabled={!podeEditar}>
              <option value="">Ainda não definida</option>
              {cadastros.empresas.filter((x) => x.ativo !== false || x.id === empresa).map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
            </select></label>
          {podeEditar && <div><button className="btn btn-primario">Salvar</button></div>}
        </form>
      </section>
    </div>
  );
}
