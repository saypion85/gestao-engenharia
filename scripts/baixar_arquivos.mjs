// Cópia de segurança dos ARQUIVOS (fotos, PDFs) do Supabase Storage para uma pasta local.
// O backup diário do GitHub cobre o banco; os arquivos devem ser copiados com este script (sugestão: 1x por mês)
// e guardados no OneDrive/SharePoint da equipe.
//
// Uso (no computador de quem fará a cópia, com Node 20+ instalado):
//   SUPABASE_URL=https://SEU-PROJETO.supabase.co SUPABASE_SERVICE_ROLE_KEY=chave-secreta node scripts/baixar_arquivos.mjs pasta-destino
// A chave "service_role" fica em Supabase > Project Settings > API Keys. Nunca a coloque no site nem a envie por e-mail.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const url = process.env.SUPABASE_URL, chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
const destino = process.argv[2] ?? `arquivos-${new Date().toISOString().slice(0, 10)}`;
if (!url || !chave) { console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY."); process.exit(1); }
const sb = createClient(url, chave, { auth: { persistSession: false } });

const { data: docs, error } = await sb.from("documentos").select("id, demanda_id, nome, caminho, categoria, criado_em").order("id");
if (error) throw error;
let ok = 0, pulados = 0;
const indice = ["id;demanda;categoria;nome;arquivo;enviado_em"];
for (const d of docs) {
  const alvo = path.join(destino, d.caminho);
  indice.push([d.id, d.demanda_id, d.categoria, `"${d.nome.replace(/"/g, "'")}"`, d.caminho, d.criado_em].join(";"));
  if (fs.existsSync(alvo)) { pulados++; continue; }
  const { data, error: e } = await sb.storage.from("documentos").download(d.caminho);
  if (e) { console.error("Falhou:", d.caminho, e.message); continue; }
  fs.mkdirSync(path.dirname(alvo), { recursive: true });
  fs.writeFileSync(alvo, Buffer.from(await data.arrayBuffer()));
  ok++;
}
fs.writeFileSync(path.join(destino, "indice.csv"), indice.join("\n"));
console.log(`${ok} arquivo(s) baixado(s), ${pulados} já existiam. Pasta: ${destino}`);
