import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !chave) {
  throw new Error("Configuração ausente: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.");
}

export const supabase = createClient(url, chave, {
  auth: { persistSession: true, autoRefreshToken: true },
});

/** Converte erros técnicos em mensagens que a equipe entende. */
export function mensagemErro(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e);
  if (msg.includes("Invalid login credentials")) return "E-mail ou senha incorretos.";
  if (msg.includes("row-level security") || msg.includes("permission denied")) return "Você não tem permissão para esta ação.";
  if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) return "Sem conexão com o servidor. Verifique a internet e tente de novo.";
  if (msg.includes("RDO já revisado")) return "Este RDO já foi revisado e não pode mais ser alterado.";
  if (msg.includes("Payload too large") || msg.includes("exceeded the maximum")) return "Arquivo grande demais (limite de 15 MB).";
  return msg;
}
