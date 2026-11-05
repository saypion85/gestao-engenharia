import { useState, type FormEvent } from "react";
import { supabase, mensagemErro } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { PAPEIS, PAPEIS_AJUDA } from "../lib/dominio";
import { Campo, notificar } from "../components/ui";

export default function Conta() {
  const { perfil, cadastros } = useAuth();
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [erro, setErro] = useState("");

  async function trocar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    if (senha.length < 8) return setErro("A senha precisa ter pelo menos 8 caracteres.");
    if (senha !== confirma) return setErro("As senhas não conferem.");
    const { error } = await supabase.auth.updateUser({ password: senha });
    if (error) return setErro(mensagemErro(error));
    setSenha("");
    setConfirma("");
    notificar("Senha alterada.");
  }

  if (!perfil) return null;
  return (
    <div className="pagina pagina-estreita">
      <h1>Minha conta</h1>
      <section className="cartao">
        <dl className="infos">
          <div className="info"><dt>Nome</dt><dd>{perfil.nome}</dd></div>
          <div className="info"><dt>E-mail</dt><dd>{perfil.email}</dd></div>
          <div className="info"><dt>Perfil</dt><dd>{PAPEIS[perfil.papel]} — <span className="sutil">{PAPEIS_AJUDA[perfil.papel]}</span></dd></div>
          {perfil.empresa_id && <div className="info"><dt>Empresa</dt><dd>{cadastros.empresas.find((x) => x.id === perfil.empresa_id)?.nome}</dd></div>}
        </dl>
      </section>
      <form className="cartao form" onSubmit={trocar}>
        <h2>Trocar senha</h2>
        <Campo rotulo="Nova senha"><input type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} /></Campo>
        <Campo rotulo="Repita a nova senha"><input type="password" autoComplete="new-password" value={confirma} onChange={(e) => setConfirma(e.target.value)} /></Campo>
        {erro && <div className="erro-form">{erro}</div>}
        <div className="barra-acoes"><button className="btn btn-primario">Alterar senha</button></div>
      </form>
    </div>
  );
}
