import { useState, type FormEvent } from "react";
import { supabase, mensagemErro } from "../lib/supabase";
import { useAuth, type Opcao } from "../lib/auth";
import { notificar } from "../components/ui";

function Lista({ titulo, tabela, itens, ajuda, aoMudar }: { titulo: string; tabela: "pessoas" | "locais" | "empresas"; itens: Opcao[]; ajuda: string; aoMudar: () => void }) {
  const [novo, setNovo] = useState("");
  const [editando, setEditando] = useState<{ id: number; nome: string } | null>(null);
  const [verInativos, setVerInativos] = useState(false);

  async function incluir(e: FormEvent) {
    e.preventDefault();
    if (!novo.trim()) return;
    const { error } = await supabase.from(tabela).insert({ nome: novo.trim() });
    if (error) return notificar(error.message.includes("duplicate") ? "Já existe um item com este nome." : mensagemErro(error), "erro");
    setNovo("");
    aoMudar();
  }

  async function salvarNome(e: FormEvent) {
    e.preventDefault();
    if (!editando?.nome.trim()) return;
    const { error } = await supabase.from(tabela).update({ nome: editando.nome.trim() }).eq("id", editando.id);
    if (error) return notificar(error.message.includes("duplicate") ? "Já existe um item com este nome." : mensagemErro(error), "erro");
    setEditando(null);
    aoMudar();
  }

  async function alternar(i: Opcao) {
    const { error } = await supabase.from(tabela).update({ ativo: !(i.ativo ?? true) }).eq("id", i.id);
    if (error) return notificar(mensagemErro(error), "erro");
    aoMudar();
  }

  const visiveis = itens.filter((i) => verInativos || i.ativo !== false);
  return (
    <section className="cartao">
      <h2>{titulo}</h2>
      <p className="sutil pequeno">{ajuda}</p>
      <form className="linha" onSubmit={incluir}>
        <input value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="Novo item" aria-label={`Novo item em ${titulo}`} />
        <button className="btn">Incluir</button>
      </form>
      <ul className="lista-edicao">
        {visiveis.map((i) => (
          <li key={i.id} className={i.ativo === false ? "inativo" : ""}>
            {editando?.id === i.id ? (
              <form className="linha" onSubmit={salvarNome}>
                <input value={editando.nome} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} autoFocus aria-label="Nome" />
                <button className="btn">Salvar</button>
                <button type="button" className="btn btn-link" onClick={() => setEditando(null)}>Cancelar</button>
              </form>
            ) : (
              <>
                <span>{i.nome}</span>
                <span className="linha">
                  <button className="btn btn-link pequeno" onClick={() => setEditando({ id: i.id, nome: i.nome })}>Renomear</button>
                  <button className="btn btn-link pequeno" onClick={() => alternar(i)}>{i.ativo === false ? "Reativar" : "Desativar"}</button>
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
      {itens.some((i) => i.ativo === false) && (
        <button className="btn btn-link pequeno" onClick={() => setVerInativos(!verInativos)}>{verInativos ? "Ocultar" : "Mostrar"} desativados</button>
      )}
    </section>
  );
}

export default function Cadastros() {
  const { cadastros, recarregarCadastros } = useAuth();
  return (
    <div className="pagina">
      <div className="pagina-topo">
        <div>
          <h1>Cadastros</h1>
          <p className="sutil">Listas usadas nos formulários. Itens desativados somem das opções, mas continuam nas demandas antigas.</p>
        </div>
      </div>
      <div className="grade-3 alinhar-topo">
        <Lista titulo="Responsáveis (equipe)" tabela="pessoas" itens={cadastros.pessoas} aoMudar={recarregarCadastros}
          ajuda="Pessoas que podem ser responsáveis por demandas e atividades. Quem tem login é vinculado ao criar o usuário." />
        <Lista titulo="Empresas contratadas" tabela="empresas" itens={cadastros.empresas} aoMudar={recarregarCadastros}
          ajuda="Empresas que executam serviços. Usuários da contratada só veem demandas da própria empresa." />
        <Lista titulo="Locais" tabela="locais" itens={cadastros.locais} aoMudar={recarregarCadastros}
          ajuda="Locais padronizados para busca e filtros. Prefira renomear a criar variações." />
      </div>
    </div>
  );
}
