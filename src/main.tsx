import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./styles.css";
import { AuthProvider, useAuth } from "./lib/auth";
import Layout from "./components/Layout";
import { Carregando, Notificacoes } from "./components/ui";
import Login from "./pages/Login";
import { aplicarTema, temaSalvo } from "./lib/tema";

aplicarTema(temaSalvo());

const Painel = lazy(() => import("./pages/Painel"));
const Demandas = lazy(() => import("./pages/Demandas"));
const DemandaNova = lazy(() => import("./pages/DemandaNova"));
const DemandaDetalhe = lazy(() => import("./pages/DemandaDetalhe"));
const RdoPagina = lazy(() => import("./pages/RdoPagina"));
const RdoResumo = lazy(() => import("./pages/RdoResumo"));
const Atividades = lazy(() => import("./pages/Atividades"));
const Cronograma = lazy(() => import("./pages/Cronograma"));
const Reunioes = lazy(() => import("./pages/Reunioes"));
const ReuniaoPagina = lazy(() => import("./pages/Reuniao"));
const AtaPagina = lazy(() => import("./pages/Ata"));
const BoletimMedicao = lazy(() => import("./pages/BoletimMedicao"));
const Usuarios = lazy(() => import("./pages/Usuarios"));
const Cadastros = lazy(() => import("./pages/Cadastros"));
const Conta = lazy(() => import("./pages/Conta"));

function Rotas() {
  const { session, perfil, carregando, eGestor, eContratada, podeEditar, sair } = useAuth();
  if (carregando) return <Carregando />;
  if (!session) return <Login />;
  if (!perfil || !perfil.ativo) {
    return (
      <div className="login">
        <div className="login-cartao">
          <h1>Acesso não liberado</h1>
          <p>Seu usuário ainda não tem perfil ativo. Fale com o Gestor do sistema.</p>
          <button className="btn" onClick={sair}>Sair</button>
        </div>
      </div>
    );
  }
  return (
    <Suspense fallback={<Carregando />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={eContratada ? <Navigate to="/demandas" replace /> : <Painel />} />
          <Route path="demandas" element={<Demandas />} />
          <Route path="demandas/nova" element={podeEditar ? <DemandaNova /> : <Navigate to="/demandas" />} />
          <Route path="demandas/:id" element={<DemandaDetalhe />} />
          <Route path="demandas/:id/rdo/:rdoId" element={<RdoPagina />} />
          <Route path="demandas/:id/rdo-resumo" element={<RdoResumo />} />
          <Route path="demandas/:id/medicao/:medId" element={podeEditar ? <BoletimMedicao /> : <Navigate to="/demandas" />} />
          <Route path="atividades" element={eContratada ? <Navigate to="/demandas" /> : <Atividades />} />
          <Route path="cronograma" element={eContratada ? <Navigate to="/demandas" /> : <Cronograma />} />
          <Route path="reunioes" element={eContratada ? <Navigate to="/demandas" /> : <Reunioes />} />
          <Route path="reunioes/:id" element={eContratada ? <Navigate to="/demandas" /> : <ReuniaoPagina />} />
          <Route path="reunioes/:id/ata" element={eContratada ? <Navigate to="/demandas" /> : <AtaPagina />} />
          <Route path="usuarios" element={eGestor ? <Usuarios /> : <Navigate to="/" />} />
          <Route path="cadastros" element={eGestor ? <Cadastros /> : <Navigate to="/" />} />
          <Route path="conta" element={<Conta />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Rotas />
        <Notificacoes />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
