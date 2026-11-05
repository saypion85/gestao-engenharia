import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { PAPEIS } from "../lib/dominio";
import { aplicarTema, temaSalvo, type Tema } from "../lib/tema";

export default function Layout() {
  const { perfil, sair, eGestor, eContratada } = useAuth();
  const [menu, setMenu] = useState(false);
  const [tema, setTema] = useState<Tema>(temaSalvo());
  const trocarTema = () => { const t: Tema = tema === "dark" ? "light" : "dark"; aplicarTema(t); setTema(t); };
  const loc = useLocation();
  useEffect(() => setMenu(false), [loc.pathname]);

  const links = eContratada
    ? [{ to: "/demandas", nome: "Minhas demandas" }]
    : [
        { to: "/", nome: "Painel" },
        { to: "/demandas", nome: "Demandas" },
        { to: "/atividades", nome: "Atividades" },
        { to: "/cronograma", nome: "Cronograma" },
        { to: "/reunioes", nome: "Reuniões" },
        ...(eGestor ? [{ to: "/usuarios", nome: "Usuários" }, { to: "/cadastros", nome: "Cadastros" }] : []),
      ];

  return (
    <div className="app">
      <header className="topo">
        <div className="topo-interno">
          <NavLink to={eContratada ? "/demandas" : "/"} className="marca" aria-label="Início">
            <img src="/logo-branco.svg" alt="Triunfo Logística" />
            <span className="marca-sistema">Engenharia</span>
          </NavLink>
          <button className="btn-menu" aria-label="Abrir menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>☰</button>
          <nav className={`nav${menu ? " aberto" : ""}`}>
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.to === "/"}>{l.nome}</NavLink>
            ))}
            <div className="nav-usuario">
              <NavLink to="/conta" className="usuario" title="Minha conta">
                <span className="usuario-nome">{perfil?.nome}</span>
                <span className="usuario-papel">{perfil && PAPEIS[perfil.papel]}</span>
              </NavLink>
              <button className="btn-tema" onClick={trocarTema} aria-pressed={tema === "dark"} title="Alternar tema claro/escuro">
                {tema === "dark" ? "☀ Claro" : "☾ Escuro"}
              </button>
              <button className="btn-sair" onClick={sair}>Sair</button>
            </div>
          </nav>
        </div>
      </header>
      <main className="conteudo">
        <Outlet />
      </main>
    </div>
  );
}
