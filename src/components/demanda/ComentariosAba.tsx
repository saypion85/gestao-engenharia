import { useCallback, useEffect, useState, type FormEvent } from "react";
import { supabase, mensagemErro } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { fmtDataHora } from "../../lib/dominio";
import { Ajuda, Aviso, Carregando, Vazio, notificar } from "../ui";

export interface Comentario {
  id: number; demanda_id: number; texto: string; importante: boolean;
  autor_id: string | null; autor_nome: string | null; criado_em: string;
  editado_em: string | null; editado_por_nome: string | null;
}

function Item({ c, aoMudar }: { c: Comentario; aoMudar: () => void }) {
  const { perfil, eGestor, podeEditar } = useAuth();
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(c.texto);
  const [importante, setImportante] = useState(c.importante);
  const pode = eGestor || (podeEditar && c.autor_id === perfil?.id);

  async function salvar() {
    if (!texto.trim()) return notificar("O comentário não pode ficar vazio.", "erro");
    const { error } = await supabase.from("comentarios").update({ texto: texto.trim(), importante }).eq("id", c.id);
    if (error) return notificar(mensagemErro(error), "erro");
    setEditando(false);
    aoMudar();
  }
  async function excluir() {
    if (!confirm("Excluir este comentário? Esta ação não pode ser desfeita.")) return;
    const { error } = await supabase.from("comentarios").delete().eq("id", c.id);
    if (error) return notificar(mensagemErro(error), "erro");
    aoMudar();
  }

  return (
    <li className={`comentario${c.importante ? " importante" : ""}`}>
      <div className="comentario-topo">
        <span className="avatar" aria-hidden>{(c.autor_nome ?? "?").split(" ").map((p) => p[0]).slice(0, 2).join("")}</span>
        <div>
          <strong>{c.autor_nome ?? "—"}</strong>
          <div className="sutil pequeno">{fmtDataHora(c.criado_em)}{c.editado_em && ` · editado${c.editado_por_nome && c.editado_por_nome !== c.autor_nome ? ` por ${c.editado_por_nome}` : ""} em ${fmtDataHora(c.editado_em)}`}</div>
        </div>
        {c.importante && <span className="badge badge-critico">★ Importante</span>}
      </div>
      {editando ? (
        <div className="form">
          <textarea rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Editar comentário" autoFocus />
          <div className="linha linha-entre">
            <label className="check-linha pequeno"><input type="checkbox" checked={importante} onChange={(e) => setImportante(e.target.checked)} /> Marcar como importante</label>
            <span className="linha">
              <button className="btn" onClick={() => { setEditando(false); setTexto(c.texto); setImportante(c.importante); }}>Cancelar</button>
              <button className="btn btn-primario" onClick={salvar}>Salvar</button>
            </span>
          </div>
        </div>
      ) : (
        <>
          <p className="pre comentario-texto">{c.texto}</p>
          {pode && (
            <div className="linha pequeno">
              <button className="btn-link pequeno" onClick={() => setEditando(true)}>Editar</button>
              <button className="btn-perigo-link pequeno" onClick={excluir}>Excluir</button>
            </div>
          )}
        </>
      )}
    </li>
  );
}

export default function ComentariosAba({ demandaId }: { demandaId: number }) {
  const { podeEditar } = useAuth();
  const [lista, setLista] = useState<Comentario[] | null>(null);
  const [erro, setErro] = useState("");
  const [texto, setTexto] = useState("");
  const [importante, setImportante] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [soImportantes, setSoImportantes] = useState(false);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from("comentarios").select("*").eq("demanda_id", demandaId).order("criado_em", { ascending: false });
    if (error) setErro(mensagemErro(error));
    else setLista(data as Comentario[]);
  }, [demandaId]);
  useEffect(() => { carregar(); }, [carregar]);

  async function publicar(e: FormEvent) {
    e.preventDefault();
    if (!texto.trim()) return;
    setEnviando(true);
    const { error } = await supabase.from("comentarios").insert({ demanda_id: demandaId, texto: texto.trim(), importante });
    setEnviando(false);
    if (error) return notificar(mensagemErro(error), "erro");
    setTexto("");
    setImportante(false);
    notificar("Comentário publicado.");
    carregar();
  }

  if (erro) return <Aviso tipo="critico">{erro}</Aviso>;
  if (!lista) return <Carregando />;
  const visiveis = soImportantes ? lista.filter((c) => c.importante) : lista;

  return (
    <section className="cartao">
      <div className="linha linha-entre">
        <h2>Comentários <Ajuda>Registre fatos importantes para toda a equipe. Fica gravado quem escreveu e quando. Só o autor ou o Gestor podem editar ou excluir. A contratada não vê os comentários.</Ajuda></h2>
        {lista.some((c) => c.importante) && (
          <label className="check-linha pequeno"><input type="checkbox" checked={soImportantes} onChange={(e) => setSoImportantes(e.target.checked)} /> Só importantes</label>
        )}
      </div>
      {podeEditar && (
        <form className="form novo-comentario" onSubmit={publicar}>
          <textarea rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escreva um fato ou informação importante sobre esta demanda…" aria-label="Novo comentário" />
          <div className="linha linha-entre">
            <label className="check-linha pequeno"><input type="checkbox" checked={importante} onChange={(e) => setImportante(e.target.checked)} /> Marcar como importante (aparece no Resumo)</label>
            <button className="btn btn-primario" disabled={enviando || !texto.trim()}>{enviando ? "Publicando…" : "Publicar comentário"}</button>
          </div>
        </form>
      )}
      {visiveis.length === 0 ? <Vazio titulo={soImportantes ? "Nenhum comentário importante" : "Nenhum comentário ainda"} /> : (
        <ul className="comentarios">{visiveis.map((c) => <Item key={c.id} c={c} aoMudar={carregar} />)}</ul>
      )}
    </section>
  );
}
