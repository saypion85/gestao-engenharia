import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase, mensagemErro } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { fmtDataHora } from "../../lib/dominio";
import { notificar } from "../ui";

export interface PontoAuto {
  id: string;
  titulo: string;
  diagnostico: string;
  acao: string;
  critico: boolean;
  peso: number;
  link?: string; // lista de demandas com o recorte do ponto
}

interface Ajuste {
  id: string; manual: boolean; titulo: string | null; diagnostico: string | null; acao: string | null;
  nota: string | null; critico: boolean; oculto: boolean; atualizado_por_nome: string | null; atualizado_em: string;
}

function Editor({ ponto, ajuste, aoFechar, aoSalvar }: { ponto?: PontoAuto; ajuste?: Ajuste; aoFechar: () => void; aoSalvar: () => void }) {
  const manual = !ponto;
  const [v, setV] = useState({
    titulo: ajuste?.titulo ?? "", diagnostico: ajuste?.diagnostico ?? "",
    acao: ajuste?.acao ?? ponto?.acao ?? "", nota: ajuste?.nota ?? "", critico: ajuste?.critico ?? false,
  });
  const [erro, setErro] = useState("");

  async function salvar() {
    if (manual && (!v.titulo.trim() || !v.diagnostico.trim())) return setErro("Informe título e diagnóstico.");
    const id = ajuste?.id ?? ponto?.id ?? `manual-${crypto.randomUUID()}`;
    const dados = manual
      ? { id, manual: true, titulo: v.titulo.trim(), diagnostico: v.diagnostico.trim(), acao: v.acao.trim() || null, critico: v.critico, oculto: false }
      : { id, manual: false, acao: v.acao.trim() && v.acao.trim() !== ponto!.acao ? v.acao.trim() : null, nota: v.nota.trim() || null, oculto: ajuste?.oculto ?? false };
    const { error } = await supabase.from("painel_pontos").upsert(dados);
    if (error) return setErro(mensagemErro(error));
    aoSalvar();
    aoFechar();
  }

  async function restaurar() {
    if (!ajuste) return aoFechar();
    const { error } = await supabase.from("painel_pontos").delete().eq("id", ajuste.id);
    if (error) return setErro(mensagemErro(error));
    aoSalvar();
    aoFechar();
  }

  return (
    <div className="ponto-editor">
      {manual && (
        <>
          <label className="campo"><span className="campo-rotulo">Título</span><input maxLength={80} value={v.titulo} onChange={(e) => setV({ ...v, titulo: e.target.value })} autoFocus /></label>
          <label className="campo"><span className="campo-rotulo">Diagnóstico</span><textarea rows={3} maxLength={400} value={v.diagnostico} onChange={(e) => setV({ ...v, diagnostico: e.target.value })} /></label>
        </>
      )}
      {!manual && <p className="sutil pequeno">{ponto!.diagnostico}</p>}
      <label className="campo"><span className="campo-rotulo">Ação recomendada</span><textarea rows={2} maxLength={300} value={v.acao} onChange={(e) => setV({ ...v, acao: e.target.value })} /></label>
      {!manual && <label className="campo"><span className="campo-rotulo">Nota do Gestor (opcional)</span><textarea rows={2} maxLength={300} value={v.nota} onChange={(e) => setV({ ...v, nota: e.target.value })} /></label>}
      {manual && <label className="check-linha pequeno"><input type="checkbox" checked={v.critico} onChange={(e) => setV({ ...v, critico: e.target.checked })} /> Marcar como crítico</label>}
      {erro && <div className="erro-form">{erro}</div>}
      <div className="barra-acoes">
        {ajuste && <button type="button" className="btn-perigo-link pequeno" onClick={restaurar}>{manual ? "Excluir ponto" : "Voltar ao texto automático"}</button>}
        <button type="button" className="btn" onClick={aoFechar}>Cancelar</button>
        <button type="button" className="btn btn-primario" onClick={salvar}>Salvar</button>
      </div>
    </div>
  );
}

export default function PontosAcao({ pontos }: { pontos: PontoAuto[] }) {
  const { eGestor } = useAuth();
  const [ajustes, setAjustes] = useState<Record<string, Ajuste>>({});
  const [editando, setEditando] = useState<string | null>(null);

  async function carregar() {
    const { data } = await supabase.from("painel_pontos").select("*");
    setAjustes(Object.fromEntries(((data ?? []) as Ajuste[]).map((a) => [a.id, a])));
  }
  useEffect(() => { carregar(); }, []);

  async function ocultar(id: string, oculto: boolean) {
    const { error } = await supabase.from("painel_pontos").upsert({ id, manual: false, oculto, acao: ajustes[id]?.acao ?? null, nota: ajustes[id]?.nota ?? null });
    if (error) return notificar(mensagemErro(error), "erro");
    carregar();
  }

  const manuais = Object.values(ajustes).filter((a) => a.manual);
  const visiveis = pontos.filter((p) => !ajustes[p.id]?.oculto);
  const ocultos = pontos.filter((p) => ajustes[p.id]?.oculto);

  return (
    <>
      <section className="pontos" aria-label="Pontos de ação">
        {editando === "novo" && (
          <article className="ponto"><div className="ponto-topo"><span className="k">Novo ponto manual</span></div>
            <Editor aoFechar={() => setEditando(null)} aoSalvar={carregar} /></article>
        )}
        {manuais.map((a) => (
          <article key={a.id} className={`ponto${a.critico ? " crit" : ""}`}>
            <div className="ponto-topo"><span className="k">{a.titulo}</span><span className="tag-ponto">Manual</span></div>
            {editando === a.id ? <Editor ajuste={a} aoFechar={() => setEditando(null)} aoSalvar={carregar} /> : (
              <>
                <p>{a.diagnostico}</p>
                {a.acao && <p className="acao">{a.acao}</p>}
                <div className="ponto-rodape">
                  <span className="sutil pequeno">{a.atualizado_por_nome} · {fmtDataHora(a.atualizado_em)}</span>
                  {eGestor && <button className="btn-link pequeno" onClick={() => setEditando(a.id)}>Editar</button>}
                </div>
              </>
            )}
          </article>
        ))}
        {visiveis.map((p) => {
          const a = ajustes[p.id];
          return (
            <article key={p.id} className={`ponto${p.critico ? " crit" : ""}`}>
              <div className="ponto-topo"><span className="k">{p.titulo}</span><span className="tag-ponto">{a?.acao || a?.nota ? "Ajustado" : "Automático"}</span></div>
              {editando === p.id ? <Editor ponto={p} ajuste={a} aoFechar={() => setEditando(null)} aoSalvar={carregar} /> : (
                <>
                  <p>{p.diagnostico}</p>
                  <p className="acao">{a?.acao ?? p.acao}</p>
                  {a?.nota && <p className="nota-gestor"><strong>Nota do Gestor:</strong> {a.nota}</p>}
                  <div className="ponto-rodape">
                    {p.link && <Link to={p.link} className="pequeno">Ver demandas →</Link>}
                    {eGestor && (
                      <span className="linha">
                        <button className="btn-link pequeno" onClick={() => setEditando(p.id)}>Ajustar</button>
                        <button className="btn-link pequeno" onClick={() => ocultar(p.id, true)}>Ocultar</button>
                      </span>
                    )}
                  </div>
                </>
              )}
            </article>
          );
        })}
        {!visiveis.length && !manuais.length && editando !== "novo" && <div className="cartao estado vazio"><strong>Nenhum ponto de atenção no recorte atual.</strong></div>}
      </section>
      <div className="pontos-barra pequeno sutil">
        Gerados a partir dos dados do sistema e do recorte de filtros; recalculam a cada atualização.
        {eGestor && <> <button className="btn-link pequeno" onClick={() => setEditando("novo")}>+ Ponto manual</button></>}
        {eGestor && ocultos.length > 0 && (
          <> · Ocultos: {ocultos.map((p) => <button key={p.id} className="btn-link pequeno" onClick={() => ocultar(p.id, false)}>{p.titulo} (mostrar)</button>)}</>
        )}
      </div>
    </>
  );
}
