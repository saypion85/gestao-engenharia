import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase, mensagemErro } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { enviarDocumento, excluirDocumento, urlTemporaria } from "../lib/arquivos";
import { fmtData, fmtDataHora } from "../lib/dominio";
import { Ajuda, Aviso, Campo, Carregando, notificar } from "../components/ui";
import { STATUS_RDO } from "../components/demanda/RdosAba";
import type { Documento } from "../components/demanda/DocumentosAba";

/** Uma linha por pessoa. "quantidade" só existe em RDOs antigos (antes do campo Nome). */
interface Efetivo { nome?: string; funcao: string; quantidade?: number; tipo: "proprio" | "terceiro" }
interface Equip { descricao: string; quantidade: number }
interface Ocorrencia { descricao: string; impedimento: boolean }

interface Rdo {
  id: number; demanda_id: number; data: string; origem: "equipe" | "contratada"; empresa_id: number | null;
  horario_inicio: string | null; horario_fim: string | null; clima_manha: string | null; clima_tarde: string | null;
  area_praticavel: boolean | null; efetivo: Efetivo[]; equipamentos: Equip[]; atividades_executadas: string | null;
  atividades_ids: number[]; ocorrencias: Ocorrencia[]; dds_realizado: boolean | null; pt_emitida: boolean | null; ast_realizada: boolean | null;
  incidentes: string | null; materiais_recebidos: string | null; observacoes_contratada: string | null;
  apontamentos_contratante: string | null; apontado_por_nome: string | null; apontado_em: string | null;
  status: string; revisado_por_nome: string | null; revisado_em: string | null; criado_por: string | null; criado_em: string;
}

const CLIMA = { bom: "Bom", chuvoso: "Chuvoso", impraticavel: "Impraticável" };
const CAMPOS_CONTEUDO = ["data", "horario_inicio", "horario_fim", "clima_manha", "clima_tarde", "area_praticavel", "efetivo", "equipamentos",
  "atividades_executadas", "atividades_ids", "ocorrencias", "dds_realizado", "pt_emitida", "ast_realizada", "incidentes", "materiais_recebidos", "observacoes_contratada"] as const;

function SimNao({ valor, mudar, disabled }: { valor: boolean | null; mudar: (v: boolean | null) => void; disabled: boolean }) {
  return (
    <div className="segmentado pequeno">
      {[[true, "Sim"], [false, "Não"]].map(([v, n]) => (
        <button type="button" key={String(v)} disabled={disabled} className={valor === v ? "ativo" : ""} aria-pressed={valor === v}
          onClick={() => mudar(valor === v ? null : (v as boolean))}>{n as string}</button>
      ))}
    </div>
  );
}

export default function RdoPagina() {
  const { id, rdoId } = useParams();
  const { perfil, podeEditar, eContratada, eGestor, cadastros } = useAuth();
  const nav = useNavigate();
  const [r, setR] = useState<Rdo | null>(null);
  const [demanda, setDemanda] = useState<{ codigo: string; assunto: string; local_nome: string | null; empresa_nome: string | null } | null>(null);
  const [atividades, setAtividades] = useState<{ id: number; titulo: string }[]>([]);
  const [fotos, setFotos] = useState<(Documento & { url?: string | null })[]>([]);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [alterado, setAlterado] = useState(false);

  const carregarFotos = useCallback(async () => {
    const { data } = await supabase.from("documentos").select("*").eq("rdo_id", Number(rdoId)).order("criado_em");
    const lista = await Promise.all(((data ?? []) as Documento[]).map(async (f) => ({ ...f, url: f.mime?.startsWith("image/") ? await urlTemporaria(f.caminho) : null })));
    setFotos(lista);
  }, [rdoId]);

  const carregar = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      supabase.from("rdos").select("*").eq("id", Number(rdoId)).maybeSingle(),
      supabase.from("v_demandas").select("codigo, assunto, local_nome, empresa_nome").eq("id", Number(id)).maybeSingle(),
      supabase.from("atividades").select("id, titulo").eq("demanda_id", Number(id)).in("situacao", ["a_fazer", "em_andamento", "concluida"]).order("id"),
    ]);
    if (a.error || !a.data) return setErro(a.error ? mensagemErro(a.error) : "RDO não encontrado.");
    setR(a.data as Rdo);
    setDemanda(b.data);
    setAtividades(c.data ?? []);
    setAlterado(false);
    carregarFotos();
  }, [id, rdoId, carregarFotos]);
  useEffect(() => { carregar(); }, [carregar]);

  if (erro) return <div className="pagina"><Aviso tipo="critico">{erro}</Aviso></div>;
  if (!r || !demanda) return <Carregando />;

  const travado = r.status === "revisado_ok" || r.status === "revisado_ressalvas";
  const souDaContratada = eContratada && r.empresa_id === perfil?.empresa_id;
  const podeConteudo = !travado && ((r.origem === "equipe" && podeEditar) || (r.origem === "contratada" && souDaContratada));
  const podeApontar = !travado && podeEditar && r.origem === "contratada";
  const podeRevisar = !travado && podeEditar && r.status === "enviado";
  const mudar = (p: Partial<Rdo>) => { setR((x) => ({ ...x!, ...p })); setAlterado(true); };
  const empresaNome = cadastros.empresas.find((e) => e.id === r.empresa_id)?.nome ?? demanda.empresa_nome;

  async function salvar(novoStatus?: string) {
    if (!r) return;
    setSalvando(true);
    const dados: Record<string, unknown> = {};
    if (podeConteudo) CAMPOS_CONTEUDO.forEach((k) => (dados[k] = r[k]));
    if (podeApontar) dados.apontamentos_contratante = r.apontamentos_contratante;
    if (novoStatus) dados.status = novoStatus;
    if (Array.isArray(dados.efetivo)) dados.efetivo = (dados.efetivo as Efetivo[]).filter((e) => e.funcao.trim() || e.nome?.trim());
    if (Array.isArray(dados.equipamentos)) dados.equipamentos = (dados.equipamentos as Equip[]).filter((e) => e.descricao.trim());
    if (Array.isArray(dados.ocorrencias)) dados.ocorrencias = (dados.ocorrencias as Ocorrencia[]).filter((e) => e.descricao.trim());
    const { error } = await supabase.from("rdos").update(dados).eq("id", r.id);
    setSalvando(false);
    if (error) return notificar(mensagemErro(error), "erro");
    if (novoStatus === "enviado") notificar(r.origem === "contratada" ? "RDO enviado para a Triunfo." : "RDO finalizado.");
    else if (novoStatus?.startsWith("revisado")) {
      await supabase.from("historico").insert({ demanda_id: r.demanda_id, texto: `RDO de ${fmtData(r.data)} revisado ${novoStatus === "revisado_ok" ? "sem ressalvas" : "com ressalvas"}.` });
      notificar("Revisão registrada. O RDO está travado.");
    } else notificar("RDO salvo.");
    carregar();
  }

  async function reabrir() {
    if (!confirm("Reabrir este RDO para alteração? Ele volta para “Enviado”.")) return;
    const { error } = await supabase.from("rdos").update({ status: "enviado" }).eq("id", r!.id);
    if (error) return notificar(mensagemErro(error), "erro");
    carregar();
  }

  async function excluir() {
    if (!confirm("Excluir este rascunho de RDO?")) return;
    for (const f of fotos) await excluirDocumento(f.id, f.caminho).catch(() => null);
    const { error } = await supabase.from("rdos").delete().eq("id", r!.id);
    if (error) return notificar(mensagemErro(error), "erro");
    nav(`/demandas/${id}?aba=rdo`, { replace: true });
  }

  async function adicionarFotos(lista: FileList | null) {
    if (!lista?.length) return;
    setEnviandoFoto(true);
    try {
      for (const arquivo of Array.from(lista)) {
        const legenda = lista.length === 1 ? prompt("Legenda da foto (opcional):", "") : null;
        await enviarDocumento({ demandaId: r!.demanda_id, rdoId: r!.id, arquivo, categoria: arquivo.type.startsWith("image/") ? "foto" : "rdo", descricao: legenda || null, visivelContratada: true });
      }
      carregarFotos();
    } catch (e) {
      notificar(mensagemErro(e), "erro");
    } finally {
      setEnviandoFoto(false);
    }
  }

  const linhaLista = <T,>(campo: "efetivo" | "equipamentos" | "ocorrencias", i: number, p: Partial<T>) => {
    const arr = [...(r[campo] as unknown as T[])];
    arr[i] = { ...arr[i], ...p };
    mudar({ [campo]: arr } as Partial<Rdo>);
  };
  const remover = (campo: "efetivo" | "equipamentos" | "ocorrencias", i: number) =>
    mudar({ [campo]: (r[campo] as unknown[]).filter((_, j) => j !== i) } as Partial<Rdo>);

  // cada linha é uma pessoa; RDOs antigos com "quantidade" continuam somando certo
  const pessoas = (e: Efetivo) => (e.quantidade && !e.nome ? Number(e.quantidade) || 1 : 1);
  const totalProprio = r.efetivo.filter((e) => e.tipo === "proprio").reduce((s, e) => s + pessoas(e), 0);
  const totalTerceiro = r.efetivo.filter((e) => e.tipo === "terceiro").reduce((s, e) => s + pessoas(e), 0);
  const dis = !podeConteudo;

  return (
    <div className="pagina pagina-estreita rdo">
      <div className="so-tela">
        <Link to={`/demandas/${id}?aba=rdo`} className="voltar">← {demanda.codigo} · RDOs</Link>
      </div>
      <div className="rdo-cabecalho">
        <img src="/logo-cor.svg" alt="Triunfo Logística" className="so-impressao rdo-logo" />
        <div>
          <h1>RDO — Relatório Diário de Obra</h1>
          <p><strong>{demanda.codigo}</strong> · {demanda.assunto}{demanda.local_nome && ` · ${demanda.local_nome}`}</p>
          <div className="linha-badges">
            <span className={`badge rdo-${r.status}`}>{STATUS_RDO[r.status]}</span>
            <span className="badge">{r.origem === "contratada" ? `Preenchido pela contratada${empresaNome ? `: ${empresaNome}` : ""}` : "Preenchido pela equipe Triunfo"}</span>
          </div>
        </div>
        <button className="btn so-tela" onClick={() => window.print()}>Imprimir / PDF</button>
      </div>

      {travado && <Aviso tipo="ok">Revisado por {r.revisado_por_nome ?? "—"} em {fmtDataHora(r.revisado_em)}. Este RDO não pode mais ser alterado.</Aviso>}
      {!travado && !podeConteudo && !podeApontar && <Aviso tipo="info">Você está vendo este RDO em modo de leitura.</Aviso>}

      <section className="cartao">
        <h2>1. Identificação</h2>
        <div className="grade-3">
          <Campo rotulo="Data"><input type="date" value={r.data} disabled={dis} onChange={(e) => mudar({ data: e.target.value })} /></Campo>
          <Campo rotulo="Início do trabalho"><input type="time" value={r.horario_inicio?.slice(0, 5) ?? ""} disabled={dis} onChange={(e) => mudar({ horario_inicio: e.target.value || null })} /></Campo>
          <Campo rotulo="Fim do trabalho"><input type="time" value={r.horario_fim?.slice(0, 5) ?? ""} disabled={dis} onChange={(e) => mudar({ horario_fim: e.target.value || null })} /></Campo>
        </div>
      </section>

      <section className="cartao">
        <h2>2. Clima e condição da área</h2>
        <div className="grade-3">
          {(["clima_manha", "clima_tarde"] as const).map((c) => (
            <Campo key={c} rotulo={c === "clima_manha" ? "Manhã" : "Tarde"}>
              <select value={r[c] ?? ""} disabled={dis} onChange={(e) => mudar({ [c]: e.target.value || null })}>
                <option value="">—</option>
                {Object.entries(CLIMA).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
              </select>
            </Campo>
          ))}
          <div className="campo"><span className="campo-rotulo">Área praticável?</span><SimNao valor={r.area_praticavel} disabled={dis} mudar={(v) => mudar({ area_praticavel: v })} /></div>
        </div>
      </section>

      <section className="cartao">
        <h2>3. Efetivo <span className="sutil pequeno">Próprio: {totalProprio} · Terceiros: {totalTerceiro}</span></h2>
        <table className="tabela compacta tabela-form">
          <thead><tr><th>Nome</th><th>Função</th><th>Vínculo</th>{!dis && <th />}</tr></thead>
          <tbody>
            {r.efetivo.map((e, i) => (
              <tr key={i}>
                <td><input value={e.nome ?? ""} disabled={dis} onChange={(x) => linhaLista<Efetivo>("efetivo", i, { nome: x.target.value })} placeholder="Nome da pessoa" aria-label="Nome" /></td>
                <td><input value={e.funcao} disabled={dis} onChange={(x) => linhaLista<Efetivo>("efetivo", i, { funcao: x.target.value })} placeholder="Ex.: Pedreiro" aria-label="Função" />
                  {e.quantidade && e.quantidade > 1 && !e.nome ? <small className="sutil"> ({e.quantidade} pessoas — registro antigo)</small> : null}</td>
                <td><select value={e.tipo} disabled={dis} onChange={(x) => linhaLista<Efetivo>("efetivo", i, { tipo: x.target.value as Efetivo["tipo"] })} aria-label="Vínculo">
                  <option value="proprio">Próprio</option><option value="terceiro">Terceiro</option></select></td>
                {!dis && <td><button type="button" className="btn-icone" onClick={() => remover("efetivo", i)} aria-label="Remover">✕</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
        {!dis && <button type="button" className="btn btn-link" onClick={() => mudar({ efetivo: [...r.efetivo, { nome: "", funcao: "", tipo: r.origem === "contratada" ? "terceiro" : "proprio" }] })}>+ Adicionar pessoa</button>}
      </section>

      <section className="cartao">
        <h2>4. Equipamentos</h2>
        <table className="tabela compacta tabela-form">
          <thead><tr><th>Equipamento</th><th>Qtd.</th>{!dis && <th />}</tr></thead>
          <tbody>
            {r.equipamentos.map((e, i) => (
              <tr key={i}>
                <td><input value={e.descricao} disabled={dis} onChange={(x) => linhaLista<Equip>("equipamentos", i, { descricao: x.target.value })} placeholder="Ex.: Retroescavadeira" aria-label="Equipamento" /></td>
                <td><input type="number" min={0} value={e.quantidade} disabled={dis} onChange={(x) => linhaLista<Equip>("equipamentos", i, { quantidade: Number(x.target.value) })} className="input-qtd" aria-label="Quantidade" /></td>
                {!dis && <td><button type="button" className="btn-icone" onClick={() => remover("equipamentos", i)} aria-label="Remover">✕</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
        {!dis && <button type="button" className="btn btn-link" onClick={() => mudar({ equipamentos: [...r.equipamentos, { descricao: "", quantidade: 1 }] })}>+ Adicionar equipamento</button>}
      </section>

      <section className="cartao">
        <h2>5. Atividades executadas no dia</h2>
        <textarea rows={5} value={r.atividades_executadas ?? ""} disabled={dis} onChange={(e) => mudar({ atividades_executadas: e.target.value || null })}
          placeholder="Descreva o que foi executado hoje." aria-label="Atividades executadas" />
        {atividades.length > 0 && (
          <div className="campo">
            <span className="campo-rotulo pequeno">Atividades da demanda trabalhadas hoje (opcional)</span>
            <div className="checks">
              {atividades.map((a) => (
                <label key={a.id}><input type="checkbox" disabled={dis} checked={r.atividades_ids.includes(a.id)}
                  onChange={(e) => mudar({ atividades_ids: e.target.checked ? [...r.atividades_ids, a.id] : r.atividades_ids.filter((x) => x !== a.id) })} /> {a.titulo}</label>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="cartao">
        <h2>6. Ocorrências e interferências</h2>
        <p className="sutil pequeno">Ex.: área não liberada pela Operação, integração no DHO, falta de material, paralisação. Marque “Impedimento” quando travar o serviço — aparece no painel.</p>
        {r.ocorrencias.map((o, i) => (
          <div key={i} className="linha ocorrencia">
            <input value={o.descricao} disabled={dis} onChange={(x) => linhaLista<Ocorrencia>("ocorrencias", i, { descricao: x.target.value })} aria-label="Ocorrência" />
            <label className="check-linha pequeno"><input type="checkbox" checked={o.impedimento} disabled={dis} onChange={(x) => linhaLista<Ocorrencia>("ocorrencias", i, { impedimento: x.target.checked })} /> Impedimento</label>
            {!dis && <button type="button" className="btn-icone" onClick={() => remover("ocorrencias", i)} aria-label="Remover">✕</button>}
          </div>
        ))}
        {r.ocorrencias.length === 0 && dis && <p className="sutil">Nenhuma ocorrência.</p>}
        {!dis && <button type="button" className="btn btn-link" onClick={() => mudar({ ocorrencias: [...r.ocorrencias, { descricao: "", impedimento: false }] })}>+ Adicionar ocorrência</button>}
      </section>

      <section className="cartao">
        <h2>7. Segurança</h2>
        <div className="grade-3">
          <div className="campo"><span className="campo-rotulo">DDS realizado?</span><SimNao valor={r.dds_realizado} disabled={dis} mudar={(v) => mudar({ dds_realizado: v })} /></div>
          <div className="campo"><span className="campo-rotulo">PT emitida?</span><SimNao valor={r.pt_emitida} disabled={dis} mudar={(v) => mudar({ pt_emitida: v })} /></div>
          <div className="campo"><span className="campo-rotulo">AST realizada? <Ajuda>Análise de Segurança da Tarefa feita antes do início dos serviços.</Ajuda></span><SimNao valor={r.ast_realizada} disabled={dis} mudar={(v) => mudar({ ast_realizada: v })} /></div>
        </div>
        <Campo rotulo="Incidentes / quase acidentes"><textarea rows={2} value={r.incidentes ?? ""} disabled={dis} onChange={(e) => mudar({ incidentes: e.target.value || null })} placeholder="Deixe em branco se não houve." /></Campo>
      </section>

      <section className="cartao">
        <h2>8. Materiais recebidos <span className="sutil pequeno">(opcional)</span></h2>
        <textarea rows={2} value={r.materiais_recebidos ?? ""} disabled={dis} onChange={(e) => mudar({ materiais_recebidos: e.target.value || null })} aria-label="Materiais recebidos" />
      </section>

      <section className="cartao">
        <h2>9. Fotos e anexos</h2>
        <div className="galeria">
          {fotos.map((f) => (
            <figure key={f.id}>
              {f.url ? <a href={f.url} target="_blank" rel="noopener"><img src={f.url} alt={f.descricao ?? f.nome} loading="lazy" /></a> : <div className="galeria-arquivo">📎 {f.nome}</div>}
              <figcaption>{f.descricao ?? ""}</figcaption>
              {podeConteudo && <button className="btn-icone so-tela" onClick={async () => { await excluirDocumento(f.id, f.caminho).catch((e) => notificar(mensagemErro(e), "erro")); carregarFotos(); }} aria-label="Remover foto">✕</button>}
            </figure>
          ))}
        </div>
        {fotos.length === 0 && <p className="sutil">Nenhuma foto.</p>}
        {podeConteudo && (
          <label className={`area-envio so-tela${enviandoFoto ? " ocupado" : ""}`}>
            <input type="file" accept="image/*,application/pdf" multiple disabled={enviandoFoto} onChange={(e) => adicionarFotos(e.target.files)} />
            {enviandoFoto ? "Enviando…" : <>📷 <strong>Adicionar fotos</strong> (câmera ou galeria)</>}
          </label>
        )}
      </section>

      <section className="cartao">
        <h2>10. Observações {r.origem === "contratada" ? "da contratada" : "gerais"}</h2>
        <textarea rows={3} value={r.observacoes_contratada ?? ""} disabled={dis} onChange={(e) => mudar({ observacoes_contratada: e.target.value || null })} aria-label="Observações" />
      </section>

      {r.origem === "contratada" && (
        <section className="cartao destaque">
          <h2>11. Apontamentos da Contratante (Triunfo)</h2>
          {podeApontar ? (
            <textarea rows={4} value={r.apontamentos_contratante ?? ""} onChange={(e) => mudar({ apontamentos_contratante: e.target.value || null })}
              placeholder="Registre observações da fiscalização: não conformidades, pendências, orientações à contratada." aria-label="Apontamentos da Contratante" />
          ) : (
            <p className="pre">{r.apontamentos_contratante || <span className="sutil">Sem apontamentos.</span>}</p>
          )}
          {r.apontado_por_nome && <p className="sutil pequeno">Último apontamento: {r.apontado_por_nome} em {fmtDataHora(r.apontado_em)}</p>}
        </section>
      )}

      <div className="barra-acoes barra-fixa so-tela">
        {r.status === "rascunho" && (podeConteudo) && <button className="btn btn-perigo-link" onClick={excluir}>Excluir rascunho</button>}
        {travado && eGestor && <button className="btn" onClick={reabrir}>Reabrir</button>}
        {(podeConteudo || podeApontar) && <button className="btn" disabled={salvando || !alterado} onClick={() => salvar()}>{alterado ? "Salvar" : "Salvo"}</button>}
        {podeConteudo && r.status === "rascunho" && <button className="btn btn-primario" disabled={salvando} onClick={() => salvar("enviado")}>{r.origem === "contratada" ? "Enviar para a Triunfo" : "Finalizar RDO"}</button>}
        {podeRevisar && (
          <>
            <button className="btn" disabled={salvando} onClick={() => salvar("revisado_ressalvas")}>Revisar com ressalvas</button>
            <button className="btn btn-primario" disabled={salvando} onClick={() => salvar("revisado_ok")}>Revisar sem ressalvas</button>
          </>
        )}
      </div>

      <div className="so-impressao assinaturas">
        <div><span>{r.origem === "contratada" ? "Responsável da contratada" : "Responsável Triunfo"}</span></div>
        <div><span>Fiscal Triunfo</span></div>
      </div>
    </div>
  );
}
