import { supabase } from "./supabase";

/** Reduz fotos no navegador antes do envio (≈1600 px, JPEG 0,75) para economizar o 1 GB do plano gratuito. */
export async function comprimirImagem(arquivo: File, ladoMax = 1600, qualidade = 0.75): Promise<File> {
  if (!arquivo.type.startsWith("image/") || arquivo.type === "image/gif" || arquivo.type === "image/svg+xml") return arquivo;
  try {
    const bitmap = await createImageBitmap(arquivo);
    const escala = Math.min(1, ladoMax / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * escala), h = Math.round(bitmap.height * escala);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/jpeg", qualidade));
    if (!blob || blob.size >= arquivo.size) return arquivo;
    return new File([blob], arquivo.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return arquivo;
  }
}

function nomeSeguro(nome: string) {
  return nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_").slice(-80);
}

export interface NovoDocumento {
  demandaId: number;
  arquivo: File;
  categoria: string;
  descricao?: string | null;
  rdoId?: number | null;
  atividadeId?: number | null;
  medicaoId?: number | null;
  visivelContratada?: boolean;
}

export async function enviarDocumento(n: NovoDocumento) {
  const arq = await comprimirImagem(n.arquivo);
  const caminho = `${n.demandaId}/${crypto.randomUUID()}-${nomeSeguro(arq.name)}`;
  const up = await supabase.storage.from("documentos").upload(caminho, arq, { contentType: arq.type || "application/octet-stream" });
  if (up.error) throw up.error;
  const { error } = await supabase.from("documentos").insert({
    demanda_id: n.demandaId, rdo_id: n.rdoId ?? null, atividade_id: n.atividadeId ?? null, medicao_id: n.medicaoId ?? null,
    categoria: n.categoria, nome: n.arquivo.name, descricao: n.descricao ?? null,
    caminho, tamanho: arq.size, mime: arq.type, visivel_contratada: n.visivelContratada ?? false,
  });
  if (error) {
    await supabase.storage.from("documentos").remove([caminho]);
    throw error;
  }
}

export async function abrirDocumento(caminho: string, baixar = false) {
  const { data, error } = await supabase.storage.from("documentos").createSignedUrl(caminho, 300, baixar ? { download: true } : undefined);
  if (error) throw error;
  window.open(data.signedUrl, "_blank", "noopener");
}

export async function urlTemporaria(caminho: string) {
  const { data } = await supabase.storage.from("documentos").createSignedUrl(caminho, 3600);
  return data?.signedUrl ?? null;
}

export async function excluirDocumento(id: number, caminho: string) {
  // remove o arquivo antes do registro: a permissão de leitura do arquivo depende do registro existir
  const rem = await supabase.storage.from("documentos").remove([caminho]);
  if (rem.error) throw rem.error;
  const { error } = await supabase.from("documentos").delete().eq("id", id);
  if (error) throw error;
}
