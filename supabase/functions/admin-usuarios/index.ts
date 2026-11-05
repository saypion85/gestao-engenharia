// Gestão de usuários (somente Gestor): criar, alterar perfil/empresa/ativo, redefinir senha.
// Sem dependências externas: usa as APIs REST do próprio Supabase.
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são fornecidas automaticamente às Edge Functions.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...cors, "Content-Type": "application/json" } });

const PAPEIS = ["gestor", "engenheiro", "consulta", "contratada"];
const URL_BASE = Deno.env.get("SUPABASE_URL")!;
const SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const cab = { apikey: SERVICO, Authorization: `Bearer ${SERVICO}`, "Content-Type": "application/json" };

async function api(caminho: string, metodo = "GET", corpo?: unknown, extra: Record<string, string> = {}) {
  const r = await fetch(`${URL_BASE}${caminho}`, { method: metodo, headers: { ...cab, ...extra }, body: corpo ? JSON.stringify(corpo) : undefined });
  const texto = await r.text();
  let dados: unknown = null;
  try { dados = texto ? JSON.parse(texto) : null; } catch { dados = texto; }
  return { ok: r.ok, status: r.status, dados: dados as Record<string, unknown> & unknown[] };
}

const msgErro = (d: unknown) => {
  const o = (d ?? {}) as Record<string, string>;
  return o.msg ?? o.message ?? o.error_description ?? o.error ?? "Erro inesperado";
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return resposta({ erro: "Método não permitido" }, 405);

  // Quem está chamando?
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const eu = await fetch(`${URL_BASE}/auth/v1/user`, { headers: { apikey: SERVICO, Authorization: `Bearer ${token}` } });
  if (!eu.ok) return resposta({ erro: "Sessão inválida" }, 401);
  const quem = await eu.json() as { id: string };
  const perfis = await api(`/rest/v1/perfis?id=eq.${quem.id}&select=papel,ativo`);
  const perfil = perfis.dados?.[0] as { papel: string; ativo: boolean } | undefined;
  if (!perfil || perfil.papel !== "gestor" || !perfil.ativo) return resposta({ erro: "Apenas o Gestor pode gerenciar usuários" }, 403);

  let corpo: Record<string, unknown>;
  try { corpo = await req.json(); } catch { return resposta({ erro: "Requisição inválida" }, 400); }
  const acao = corpo.acao as string;

  if (acao === "criar") {
    const email = String(corpo.email ?? "").trim().toLowerCase();
    const nome = String(corpo.nome ?? "").trim();
    const senha = String(corpo.senha ?? "");
    const papel = String(corpo.papel ?? "consulta");
    const empresa_id = corpo.empresa_id ? Number(corpo.empresa_id) : null;
    if (!email || !nome) return resposta({ erro: "Informe nome e e-mail" }, 400);
    if (senha.length < 8) return resposta({ erro: "A senha precisa ter pelo menos 8 caracteres" }, 400);
    if (!PAPEIS.includes(papel)) return resposta({ erro: "Perfil inválido" }, 400);
    if (papel === "contratada" && !empresa_id) return resposta({ erro: "Usuário de contratada precisa de empresa" }, 400);

    const novo = await api("/auth/v1/admin/users", "POST", {
      email, password: senha, email_confirm: true, user_metadata: { nome, papel, empresa_id: empresa_id ?? "" },
    });
    if (!novo.ok) {
      const m = msgErro(novo.dados);
      return resposta({ erro: /already|registered|exists/i.test(m) ? "Já existe um usuário com este e-mail" : m }, 400);
    }
    const id = (novo.dados as unknown as { id: string }).id;
    // Vincula à lista de responsáveis (equipe interna)
    if (papel !== "contratada" && corpo.vincular_pessoa) {
      const existe = await api(`/rest/v1/pessoas?nome=eq.${encodeURIComponent(nome)}&select=id`);
      if (existe.dados?.length) {
        await api(`/rest/v1/pessoas?id=eq.${(existe.dados[0] as { id: number }).id}`, "PATCH", { perfil_id: id, email });
      } else {
        await api("/rest/v1/pessoas", "POST", { nome, email, perfil_id: id });
      }
    }
    return resposta({ ok: true, id });
  }

  if (acao === "atualizar") {
    const id = String(corpo.id ?? "");
    if (!/^[0-9a-f-]{36}$/.test(id)) return resposta({ erro: "Usuário não informado" }, 400);
    if (id === quem.id && ((corpo.papel && corpo.papel !== "gestor") || corpo.ativo === false)) {
      return resposta({ erro: "Você não pode remover o seu próprio acesso de Gestor" }, 400);
    }
    const alt: Record<string, unknown> = {};
    if (corpo.nome) alt.nome = String(corpo.nome).trim();
    if (corpo.papel) {
      if (!PAPEIS.includes(String(corpo.papel))) return resposta({ erro: "Perfil inválido" }, 400);
      alt.papel = corpo.papel;
    }
    if ("empresa_id" in corpo) alt.empresa_id = corpo.empresa_id ? Number(corpo.empresa_id) : null;
    if (typeof corpo.ativo === "boolean") alt.ativo = corpo.ativo;
    const r = await api(`/rest/v1/perfis?id=eq.${id}`, "PATCH", alt, { Prefer: "return=minimal" });
    if (!r.ok) {
      const m = msgErro(r.dados);
      return resposta({ erro: m.includes("contratada_tem_empresa") ? "Usuário de contratada precisa de empresa" : m }, 400);
    }
    if (typeof corpo.ativo === "boolean") {
      await api(`/auth/v1/admin/users/${id}`, "PUT", { ban_duration: corpo.ativo ? "none" : "876000h" });
    }
    return resposta({ ok: true });
  }

  if (acao === "redefinir_senha") {
    const id = String(corpo.id ?? "");
    const senha = String(corpo.senha ?? "");
    if (!/^[0-9a-f-]{36}$/.test(id)) return resposta({ erro: "Usuário não informado" }, 400);
    if (senha.length < 8) return resposta({ erro: "A senha precisa ter pelo menos 8 caracteres" }, 400);
    const r = await api(`/auth/v1/admin/users/${id}`, "PUT", { password: senha });
    if (!r.ok) return resposta({ erro: msgErro(r.dados) }, 400);
    return resposta({ ok: true });
  }

  return resposta({ erro: "Ação desconhecida" }, 400);
});
