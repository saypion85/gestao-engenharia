// Cria usuários de TESTE no Supabase LOCAL (nunca rodar em produção).
// Uso: node scripts/usuarios_teste.mjs
import { createClient } from "@supabase/supabase-js";

const URL = "http://127.0.0.1:54321";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const SENHA = "Teste@12345";

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

// 1) Gestor inicial (em produção: criado no painel do Supabase + SQL de promoção)
const { error: e1 } = await admin.auth.admin.createUser({
  email: "gestor@teste.local", password: SENHA, email_confirm: true, user_metadata: { nome: "Gustavo Sipião", papel: "gestor" },
});
if (e1 && !e1.message.includes("already")) throw e1;
const { data: g } = await admin.from("perfis").select("id").eq("email", "gestor@teste.local").single();
await admin.from("pessoas").update({ perfil_id: g.id }).eq("nome", "Gustavo Sipião");

// 2) Demais usuários criados pela Edge Function, logado como Gestor
const gestor = createClient(URL, ANON, { auth: { persistSession: false } });
const { error: e2 } = await gestor.auth.signInWithPassword({ email: "gestor@teste.local", password: SENHA });
if (e2) throw e2;

const { data: emp } = await gestor.from("empresas").upsert({ nome: "AVM Engenharia (teste)" }, { onConflict: "nome" }).select("id").single();
await gestor.from("empresas").upsert({ nome: "Outra Empresa (teste)" }, { onConflict: "nome" });

const usuarios = [
  { nome: "Luis Soares", email: "engenheiro@teste.local", papel: "engenheiro", vincular_pessoa: true },
  { nome: "Consulta Teste", email: "consulta@teste.local", papel: "consulta" },
  { nome: "Fiscal AVM", email: "contratada@teste.local", papel: "contratada", empresa_id: emp.id },
];
for (const u of usuarios) {
  const { data, error } = await gestor.functions.invoke("admin-usuarios", { body: { acao: "criar", senha: SENHA, ...u } });
  const msg = error ? (await error.context?.json?.().catch(() => null))?.erro ?? error.message : data?.erro;
  console.log(u.email, msg ? `-> ${msg}` : "-> criado");
}

// 3) Vincula duas demandas abertas à empresa de teste
const { data: abertas } = await admin.from("demandas").select("id").eq("forma_execucao", "contratada").in("situacao", ["em_andamento", "aguardando"]).order("id").limit(2);
await admin.from("demandas").update({ empresa_id: emp.id }).in("id", abertas.map((d) => d.id));
console.log("Demandas vinculadas à contratada de teste:", abertas.map((d) => d.id).join(", "));
console.log(`Senha de todos: ${SENHA}`);
