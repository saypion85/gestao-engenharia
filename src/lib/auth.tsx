import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { Papel } from "./dominio";

export interface Perfil {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  empresa_id: number | null;
  ativo: boolean;
}

export interface Opcao { id: number; nome: string; ativo?: boolean; perfil_id?: string | null }

interface Cadastros { pessoas: Opcao[]; locais: Opcao[]; empresas: Opcao[] }

interface Ctx {
  session: Session | null;
  perfil: Perfil | null;
  carregando: boolean;
  cadastros: Cadastros;
  recarregarCadastros: () => Promise<void>;
  sair: () => Promise<void>;
  // atalhos de permissão (a regra real fica no banco, via RLS)
  eGestor: boolean;
  podeEditar: boolean;
  eContratada: boolean;
}

const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [cadastros, setCadastros] = useState<Cadastros>({ pessoas: [], locais: [], empresas: [] });

  const recarregarCadastros = useCallback(async () => {
    const [p, l, e] = await Promise.all([
      supabase.from("pessoas").select("id, nome, ativo, perfil_id").order("nome"),
      supabase.from("locais").select("id, nome, ativo").order("nome"),
      supabase.from("empresas").select("id, nome, ativo").order("nome"),
    ]);
    setCadastros({ pessoas: p.data ?? [], locais: l.data ?? [], empresas: e.data ?? [] });
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_ev, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let ativo = true;
    (async () => {
      if (!session) {
        setPerfil(null);
        setCarregando(false);
        return;
      }
      setCarregando(true);
      const { data } = await supabase.from("perfis").select("*").eq("id", session.user.id).maybeSingle();
      if (!ativo) return;
      setPerfil((data as Perfil) ?? null);
      await recarregarCadastros();
      setCarregando(false);
    })();
    return () => { ativo = false; };
  }, [session?.user.id, recarregarCadastros]); // eslint-disable-line react-hooks/exhaustive-deps

  const sair = async () => { await supabase.auth.signOut(); };

  const papel = perfil?.ativo ? perfil.papel : null;
  return (
    <AuthCtx.Provider value={{
      session, perfil, carregando, cadastros, recarregarCadastros, sair,
      eGestor: papel === "gestor",
      podeEditar: papel === "gestor" || papel === "engenheiro",
      eContratada: papel === "contratada",
    }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const c = useContext(AuthCtx);
  if (!c) throw new Error("useAuth fora do AuthProvider");
  return c;
}
