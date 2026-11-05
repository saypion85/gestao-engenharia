import { useState, type FormEvent } from "react";
import { mensagemErro, supabase } from "../lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    setEnviando(false);
    if (error) setErro(mensagemErro(error));
  }

  return (
    <div className="login">
      <form className="login-cartao" onSubmit={entrar}>
        <img src="/logo-cor.svg" alt="Triunfo Logística" className="login-logo" />
        <h1>Gestão de Engenharia</h1>
        <p className="sutil">Projetos, demandas, RDOs e documentos da Infraestrutura.</p>
        <label className="campo">
          <span className="campo-rotulo">E-mail</span>
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="campo">
          <span className="campo-rotulo">Senha</span>
          <input type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
        </label>
        {erro && <div className="erro-form" role="alert">{erro}</div>}
        <button className="btn btn-primario btn-bloco" disabled={enviando}>{enviando ? "Entrando…" : "Entrar"}</button>
        <p className="sutil pequeno">Esqueceu a senha? Peça ao Gestor do sistema para redefinir.</p>
      </form>
    </div>
  );
}
