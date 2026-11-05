import { useCallback, useEffect, useState, type FormEvent } from "react";
import { supabase, mensagemErro } from "../lib/supabase";
import { useAuth, type Perfil } from "../lib/auth";
import { PAPEIS, PAPEIS_AJUDA, type Papel } from "../lib/dominio";
import { Aviso, Campo, Carregando, Modal, notificar } from "../components/ui";

async function chamar(corpo: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("admin-usuarios", { body: corpo });
  if (error) {
    // a função devolve { erro } com status 4xx
    const ctx = (error as { context?: Response }).context;
    const msg = ctx ? (await ctx.json().catch(() => null))?.erro : null;
    throw new Error(msg ?? error.message);
  }
  if (data?.erro) throw new Error(data.erro);
  return data;
}

function senhaAleatoria() {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from(crypto.getRandomValues(new Uint32Array(10)), (n) => c[n % c.length]).join("");
}

function NovoUsuario({ aoFechar, aoSalvar }: { aoFechar: () => void; aoSalvar: () => void }) {
  const { cadastros } = useAuth();
  const [v, setV] = useState({ nome: "", email: "", papel: "engenheiro" as Papel, empresa_id: "", senha: senhaAleatoria(), vincular_pessoa: true });
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [criado, setCriado] = useState(false);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      await chamar({ acao: "criar", ...v, empresa_id: v.empresa_id || null, vincular_pessoa: v.papel !== "contratada" && v.vincular_pessoa });
      setCriado(true);
      aoSalvar();
    } catch (er) {
      setErro(mensagemErro(er));
    } finally {
      setEnviando(false);
    }
  }

  if (criado) {
    const texto = `Acesso ao sistema de Gestão de Engenharia\nEndereço: ${location.origin}\nE-mail: ${v.email}\nSenha provisória: ${v.senha}\nTroque a senha no primeiro acesso em "Minha conta".`;
    return (
      <Modal titulo="Usuário criado" aoFechar={aoFechar}>
        <p>Envie os dados abaixo para <strong>{v.nome}</strong> (por e-mail ou Teams):</p>
        <pre className="caixa-copiar">{texto}</pre>
        <div className="barra-acoes">
          <button className="btn" onClick={() => navigator.clipboard.writeText(texto).then(() => notificar("Copiado."))}>Copiar</button>
          <button className="btn btn-primario" onClick={aoFechar}>Concluir</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal titulo="Novo usuário" aoFechar={aoFechar}>
      <form className="form" onSubmit={salvar}>
        <Campo rotulo="Nome" obrigatorio><input value={v.nome} onChange={(e) => setV({ ...v, nome: e.target.value })} autoFocus /></Campo>
        <Campo rotulo="E-mail" obrigatorio><input type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></Campo>
        <Campo rotulo="Perfil" obrigatorio>
          <select value={v.papel} onChange={(e) => setV({ ...v, papel: e.target.value as Papel })}>
            {Object.entries(PAPEIS).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
          <small className="sutil">{PAPEIS_AJUDA[v.papel]}</small>
        </Campo>
        {v.papel === "contratada" ? (
          <Campo rotulo="Empresa" obrigatorio>
            <select value={v.empresa_id} onChange={(e) => setV({ ...v, empresa_id: e.target.value })}>
              <option value="">Selecione…</option>
              {cadastros.empresas.filter((x) => x.ativo !== false).map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
            </select>
            {cadastros.empresas.length === 0 && <small className="texto-atencao">Cadastre a empresa primeiro em Cadastros.</small>}
          </Campo>
        ) : (
          <label className="check-linha"><input type="checkbox" checked={v.vincular_pessoa} onChange={(e) => setV({ ...v, vincular_pessoa: e.target.checked })} /> Pode ser responsável por demandas e atividades</label>
        )}
        <Campo rotulo="Senha provisória" ajuda="Gerada automaticamente. A pessoa pode trocar depois em “Minha conta”.">
          <input value={v.senha} onChange={(e) => setV({ ...v, senha: e.target.value })} />
        </Campo>
        {erro && <div className="erro-form">{erro}</div>}
        <div className="barra-acoes">
          <button type="button" className="btn" onClick={aoFechar}>Cancelar</button>
          <button className="btn btn-primario" disabled={enviando}>{enviando ? "Criando…" : "Criar usuário"}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Usuarios() {
  const { cadastros, perfil: eu } = useAuth();
  const [lista, setLista] = useState<Perfil[] | null>(null);
  const [erro, setErro] = useState("");
  const [novo, setNovo] = useState(false);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from("perfis").select("*").order("ativo", { ascending: false }).order("nome");
    if (error) setErro(mensagemErro(error));
    else setLista(data as Perfil[]);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function atualizar(p: Perfil, alt: Record<string, unknown>) {
    try {
      await chamar({ acao: "atualizar", id: p.id, ...alt });
      notificar("Usuário atualizado.");
      carregar();
    } catch (e) {
      notificar(mensagemErro(e), "erro");
      carregar();
    }
  }

  async function redefinir(p: Perfil) {
    const senha = senhaAleatoria();
    if (!confirm(`Gerar nova senha provisória para ${p.nome}?`)) return;
    try {
      await chamar({ acao: "redefinir_senha", id: p.id, senha });
      prompt(`Nova senha de ${p.nome} (copie e envie para a pessoa):`, senha);
    } catch (e) {
      notificar(mensagemErro(e), "erro");
    }
  }

  if (erro) return <div className="pagina"><Aviso tipo="critico">{erro}</Aviso></div>;
  if (!lista) return <Carregando />;

  return (
    <div className="pagina">
      <div className="pagina-topo">
        <div>
          <h1>Usuários</h1>
          <p className="sutil">Quem acessa o sistema e com qual perfil. O cadastro público está desligado: só o Gestor cria acessos.</p>
        </div>
        <button className="btn btn-primario" onClick={() => setNovo(true)}>+ Novo usuário</button>
      </div>
      <dl className="legenda-papeis cartao">
        {Object.entries(PAPEIS).map(([k, n]) => <div key={k}><dt>{n}</dt><dd>{PAPEIS_AJUDA[k as Papel]}</dd></div>)}
      </dl>
      <div className="tabela-rolagem cartao">
        <table className="tabela">
          <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Empresa</th><th>Acesso</th><th /></tr></thead>
          <tbody>
            {lista.map((p) => (
              <tr key={p.id} className={p.ativo ? "" : "inativo"}>
                <td>{p.nome}{p.id === eu?.id && <span className="badge"> você</span>}</td>
                <td className="pequeno">{p.email}</td>
                <td>
                  <select value={p.papel} disabled={p.id === eu?.id} onChange={(e) => atualizar(p, { papel: e.target.value, ...(e.target.value !== "contratada" ? { empresa_id: null } : {}) })} aria-label={`Perfil de ${p.nome}`}>
                    {Object.entries(PAPEIS).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
                  </select>
                </td>
                <td>
                  {p.papel === "contratada" ? (
                    <select value={p.empresa_id ?? ""} onChange={(e) => atualizar(p, { empresa_id: e.target.value || null })} aria-label={`Empresa de ${p.nome}`}>
                      <option value="">—</option>
                      {cadastros.empresas.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                    </select>
                  ) : <span className="sutil">Triunfo</span>}
                </td>
                <td>
                  <button className={`btn-chip${p.ativo ? " ativo" : ""}`} disabled={p.id === eu?.id} onClick={() => atualizar(p, { ativo: !p.ativo })}>
                    {p.ativo ? "Ativo" : "Bloqueado"}
                  </button>
                </td>
                <td><button className="btn btn-link pequeno" onClick={() => redefinir(p)}>Nova senha</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {novo && <NovoUsuario aoFechar={() => setNovo(false)} aoSalvar={carregar} />}
    </div>
  );
}
