import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, mensagemErro } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { abrirDocumento, enviarDocumento, excluirDocumento } from "../../lib/arquivos";
import { fmtBytes, fmtDataHora } from "../../lib/dominio";
import { Aviso, Carregando, Vazio, notificar } from "../ui";

export const CATEGORIAS_DOC: Record<string, string> = {
  projeto: "Projeto / desenho", memorial: "Memorial Descritivo", rdo: "RDO (arquivo externo)", foto: "Foto",
  relatorio: "Relatório", contrato: "Contrato / proposta", orcamento: "Orçamento / cotação", nota_fiscal: "Nota fiscal / medição", outro: "Outro",
};

export interface Documento {
  id: number; demanda_id: number; rdo_id: number | null; categoria: string; nome: string; descricao: string | null;
  caminho: string; tamanho: number | null; mime: string | null; visivel_contratada: boolean;
  enviado_por: string | null; enviado_por_nome: string | null; criado_em: string;
}

export default function DocumentosAba({ demandaId }: { demandaId: number }) {
  const { podeEditar, eContratada, eGestor, perfil } = useAuth();
  const [docs, setDocs] = useState<Documento[] | null>(null);
  const [erro, setErro] = useState("");
  const [categoria, setCategoria] = useState(eContratada ? "relatorio" : "projeto");
  const [descricao, setDescricao] = useState("");
  const [visivel, setVisivel] = useState(false);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [filtroCat, setFiltroCat] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from("documentos").select("*").eq("demanda_id", demandaId).order("criado_em", { ascending: false });
    if (error) setErro(mensagemErro(error));
    else setDocs(data as Documento[]);
  }, [demandaId]);
  useEffect(() => { carregar(); }, [carregar]);

  async function enviar(arquivos: FileList | null) {
    if (!arquivos?.length) return;
    try {
      let i = 0;
      for (const arquivo of Array.from(arquivos)) {
        setEnviando(`Enviando ${++i} de ${arquivos.length}: ${arquivo.name}`);
        const cat = categoria === "projeto" && arquivo.type.startsWith("image/") ? "foto" : categoria;
        await enviarDocumento({ demandaId, arquivo, categoria: cat, descricao: descricao || null, visivelContratada: visivel });
      }
      notificar(arquivos.length > 1 ? `${arquivos.length} arquivos enviados.` : "Arquivo enviado.");
      setDescricao("");
      carregar();
    } catch (e) {
      notificar(mensagemErro(e), "erro");
    } finally {
      setEnviando(null);
      if (input.current) input.current.value = "";
    }
  }

  async function alternarVisivel(d: Documento) {
    const { error } = await supabase.from("documentos").update({ visivel_contratada: !d.visivel_contratada }).eq("id", d.id);
    if (error) return notificar(mensagemErro(error), "erro");
    carregar();
  }

  async function excluir(d: Documento) {
    if (!confirm(`Excluir o arquivo "${d.nome}"?`)) return;
    try { await excluirDocumento(d.id, d.caminho); carregar(); } catch (e) { notificar(mensagemErro(e), "erro"); }
  }

  if (erro) return <Aviso tipo="critico">{erro}</Aviso>;
  if (!docs) return <Carregando />;
  const lista = docs.filter((d) => !filtroCat || d.categoria === filtroCat);
  const podeEnviar = podeEditar || eContratada;

  return (
    <section className="cartao">
      <h2>Documentos e fotos</h2>
      {podeEnviar && (
        <div className="envio">
          <div className="grade-3">
            <label className="campo"><span className="campo-rotulo">Tipo</span>
              <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                {Object.entries(CATEGORIAS_DOC).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
              </select></label>
            <label className="campo"><span className="campo-rotulo">Descrição (opcional)</span>
              <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Planta baixa rev. 2" /></label>
            {podeEditar && (
              <label className="check-linha pequeno"><input type="checkbox" checked={visivel} onChange={(e) => setVisivel(e.target.checked)} /> Contratada pode ver</label>
            )}
          </div>
          <label className={`area-envio${enviando ? " ocupado" : ""}`}>
            <input ref={input} type="file" multiple onChange={(e) => enviar(e.target.files)} disabled={!!enviando} />
            {enviando ?? <>📎 <strong>Escolher arquivos</strong> ou tirar foto · até 15 MB cada · fotos são reduzidas automaticamente</>}
          </label>
        </div>
      )}

      <div className="linha linha-entre">
        <span className="sutil pequeno">{lista.length} arquivo(s)</span>
        <select value={filtroCat} onChange={(e) => setFiltroCat(e.target.value)} aria-label="Filtrar por tipo">
          <option value="">Todos os tipos</option>
          {Object.entries(CATEGORIAS_DOC).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
        </select>
      </div>
      {lista.length === 0 && <Vazio titulo="Nenhum documento" />}
      <ul className="docs">
        {lista.map((d) => (
          <li key={d.id}>
            <span className="doc-icone" aria-hidden>{d.mime?.startsWith("image/") ? "🖼" : d.mime === "application/pdf" ? "📄" : "📎"}</span>
            <div className="doc-corpo">
              <button className="btn-texto" onClick={() => abrirDocumento(d.caminho).catch((e) => notificar(mensagemErro(e), "erro"))}>{d.nome}</button>
              <div className="sutil pequeno">
                {CATEGORIAS_DOC[d.categoria]}{d.descricao && ` · ${d.descricao}`}{d.rdo_id && " · anexo de RDO"} · {d.tamanho ? fmtBytes(d.tamanho) : ""} · {d.enviado_por_nome ?? "—"} · {fmtDataHora(d.criado_em)}
              </div>
            </div>
            <div className="doc-acoes">
              {podeEditar && (
                <button className={`btn-chip${d.visivel_contratada ? " ativo" : ""}`} onClick={() => alternarVisivel(d)} title="Define se usuários da contratada veem este arquivo">
                  {d.visivel_contratada ? "Contratada vê" : "Só Triunfo"}
                </button>
              )}
              <button className="btn-icone" onClick={() => abrirDocumento(d.caminho, true)} aria-label="Baixar">⬇</button>
              {(eGestor || d.enviado_por === perfil?.id) && <button className="btn-icone" onClick={() => excluir(d)} aria-label="Excluir">✕</button>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
