// Testes de integração das regras de acesso e de negócio no banco (Supabase LOCAL).
// Pré-requisito: supabase start + importação + node scripts/usuarios_teste.mjs
// Uso: node --test tests/
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL = "http://127.0.0.1:54321";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SENHA = "Teste@12345";
const c = {};

async function entrar(nome) {
  const cli = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await cli.auth.signInWithPassword({ email: `${nome}@teste.local`, password: SENHA });
  if (error) throw error;
  return cli;
}

let demContratada, demOutra;
before(async () => {
  for (const n of ["gestor", "engenheiro", "consulta", "contratada"]) c[n] = await entrar(n);
  const { data } = await c.gestor.from("demandas").select("id, empresa_id").not("empresa_id", "is", null).order("id");
  demContratada = data[0].id;
  const { data: outra } = await c.gestor.from("demandas").select("id").is("empresa_id", null).neq("situacao", "concluida").limit(1).single();
  demOutra = outra.id;
});

test("anônimo não lê nada", async () => {
  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data } = await anon.from("demandas").select("id");
  assert.equal((data ?? []).length, 0);
});

test("equipe interna vê todas as demandas; contratada só as da sua empresa", async () => {
  const { count: total } = await c.consulta.from("demandas").select("id", { count: "exact", head: true });
  assert.equal(total, 149);
  const { data } = await c.contratada.from("v_demandas").select("id, empresa_id");
  assert.equal(data.length, 2);
  assert.ok(data.every((d) => d.empresa_id !== null));
});

test("custos: só o Gestor lê e grava", async () => {
  const { data: g } = await c.gestor.from("v_custos").select("demanda_id");
  assert.ok(g.length > 30, "gestor vê custos importados");
  for (const p of ["engenheiro", "consulta", "contratada"]) {
    const { data } = await c[p].from("demanda_custos").select("demanda_id");
    assert.equal(data.length, 0, `${p} não pode ver custos`);
  }
  const { error } = await c.engenheiro.from("demanda_custos").insert({ demanda_id: demOutra, orcado_externo: 1 });
  assert.ok(error, "engenheiro não grava custo");
});

test("Save = orçado externo − custo realizado total", async () => {
  await c.gestor.from("demanda_custos").upsert({ demanda_id: demOutra, orcado_externo: 10000, custo_terceirizados: 1000, custo_execucao_propria: 2000, custo_mo_propria: 500 });
  const { data } = await c.gestor.from("v_custos").select("save, custo_realizado_total").eq("demanda_id", demOutra).single();
  assert.equal(Number(data.custo_realizado_total), 3500);
  assert.equal(Number(data.save), 6500);
});

test("consulta não altera; engenheiro altera e o histórico registra automaticamente", async () => {
  const r1 = await c.consulta.from("demandas").update({ detalhamento: "x" }).eq("id", demOutra).select();
  assert.equal(r1.data?.length ?? 0, 0, "consulta não atualiza");
  const { data: antes } = await c.engenheiro.from("demandas").select("situacao").eq("id", demOutra).single();
  const nova = antes.situacao === "em_andamento" ? "aguardando" : "em_andamento";
  const r2 = await c.engenheiro.from("demandas").update({ situacao: nova }).eq("id", demOutra).select();
  assert.equal(r2.data.length, 1);
  const { data: h } = await c.engenheiro.from("historico").select("texto, tipo, autor_nome").eq("demanda_id", demOutra).eq("tipo", "sistema").order("id", { ascending: false }).limit(1).single();
  assert.match(h.texto, /Situação:/);
  assert.equal(h.autor_nome, "Luis Soares");
  const { error } = await c.consulta.from("historico").insert({ demanda_id: demOutra, texto: "teste" });
  assert.ok(error, "consulta não escreve histórico");
});

test("contratada não vê histórico interno nem RMS e não altera demanda", async () => {
  const { data: h } = await c.contratada.from("historico").select("id").eq("demanda_id", demContratada);
  assert.equal(h.length, 0);
  const { data: r } = await c.contratada.from("rms").select("id");
  assert.equal(r.length, 0);
  const up = await c.contratada.from("demandas").update({ detalhamento: "hack" }).eq("id", demContratada).select();
  assert.equal(up.data?.length ?? 0, 0);
});

test("RDO da contratada: preenche, não aponta, Triunfo revisa e trava", async () => {
  const { data: rdo, error } = await c.contratada.from("rdos").insert({ demanda_id: demContratada, atividades_executadas: "Escavação", apontamentos_contratante: "tentativa" }).select().single();
  assert.ifError(error);
  assert.equal(rdo.origem, "contratada");
  assert.equal(rdo.apontamentos_contratante, null, "apontamento da contratada é descartado");
  assert.ok(rdo.empresa_id);

  const fora = await c.contratada.from("rdos").insert({ demanda_id: demOutra });
  assert.ok(fora.error, "não cria RDO em demanda de outra empresa");

  const tenta = await c.contratada.from("rdos").update({ apontamentos_contratante: "x" }).eq("id", rdo.id);
  assert.ok(tenta.error, "contratada não altera apontamentos");
  const enviar = await c.contratada.from("rdos").update({ status: "enviado" }).eq("id", rdo.id);
  assert.ifError(enviar.error);
  const autoRevisa = await c.contratada.from("rdos").update({ status: "revisado_ok" }).eq("id", rdo.id);
  assert.ok(autoRevisa.error, "contratada não revisa");

  const ap = await c.engenheiro.from("rdos").update({ apontamentos_contratante: "Faltou sinalização", status: "revisado_ressalvas" }).eq("id", rdo.id).select().single();
  assert.ifError(ap.error);
  assert.equal(ap.data.apontado_por_nome, "Luis Soares");
  assert.equal(ap.data.revisado_por_nome, "Luis Soares");

  const depois = await c.contratada.from("rdos").update({ observacoes_contratada: "mudança" }).eq("id", rdo.id);
  assert.ok(depois.error, "RDO revisado fica travado");
  const eng = await c.engenheiro.from("rdos").update({ incidentes: "x" }).eq("id", rdo.id);
  assert.ok(eng.error, "travado também para engenheiro");
  const reabre = await c.gestor.from("rdos").update({ status: "enviado" }).eq("id", rdo.id);
  assert.ifError(reabre.error, "gestor pode reabrir");
});

test("documentos: contratada não vê arquivo interno, só os liberados", async () => {
  const blob = new Blob(["conteudo"], { type: "text/plain" });
  const caminho = `${demContratada}/${crypto.randomUUID()}-teste-interno.txt`;
  const up = await c.engenheiro.storage.from("documentos").upload(caminho, blob);
  assert.ifError(up.error);
  const { data: doc, error } = await c.engenheiro.from("documentos").insert({ demanda_id: demContratada, nome: "orcamento.txt", caminho, categoria: "orcamento" }).select().single();
  assert.ifError(error);
  const { data: lista } = await c.contratada.from("documentos").select("id").eq("id", doc.id);
  assert.equal(lista.length, 0);
  const baixa = await c.contratada.storage.from("documentos").download(caminho);
  assert.ok(baixa.error, "contratada não baixa arquivo interno");

  await c.engenheiro.from("documentos").update({ visivel_contratada: true }).eq("id", doc.id);
  const baixa2 = await c.contratada.storage.from("documentos").download(caminho);
  assert.ifError(baixa2.error);

  const outra = await c.contratada.storage.from("documentos").upload(`${demOutra}/${crypto.randomUUID()}.txt`, blob);
  assert.ok(outra.error, "contratada não envia para demanda de outra empresa");
  const propria = await c.contratada.storage.from("documentos").upload(`${demContratada}/${crypto.randomUUID()}.txt`, blob);
  assert.ifError(propria.error, "contratada envia para a própria demanda");
});

test("ranking: classe, desempate, suspensa mantém e concluída sai", async () => {
  // três demandas abertas avaliadas
  const { data: abertas } = await c.gestor.from("demandas").select("id").in("situacao", ["aguardando", "em_andamento"]).order("id").limit(4);
  const [a, b, d, e] = abertas.map((x) => x.id);
  await c.engenheiro.from("demandas").update({ probabilidade: 2, sev_operacao: 3 }).eq("id", a); // 6 Médio
  await c.engenheiro.from("demandas").update({ probabilidade: 1, sev_pessoas: 5 }).eq("id", b); // 5, corte -> Crítico
  await c.engenheiro.from("demandas").update({ probabilidade: 4, sev_operacao: 3, situacao: "suspensa" }).eq("id", d); // 12 Alto
  await c.engenheiro.from("demandas").update({ probabilidade: 5, sev_operacao: 5, situacao: "concluida" }).eq("id", e);
  const { data } = await c.consulta.from("v_demandas").select("id, classe, ranking, pontuacao").in("id", [a, b, d, e]);
  const m = Object.fromEntries(data.map((x) => [x.id, x]));
  assert.equal(m[b].classe, "critico");
  assert.equal(m[d].classe, "alto");
  assert.equal(m[a].classe, "medio");
  assert.ok(m[b].ranking < m[d].ranking && m[d].ranking < m[a].ranking, "ordem Crítico < Alto < Médio");
  assert.ok(m[d].ranking, "suspensa mantém número");
  assert.equal(m[e].ranking, null, "concluída sai do ranking");
  const { data: hist } = await c.engenheiro.from("demandas").select("concluida_em, etapa").eq("id", e).single();
  assert.ok(hist.concluida_em, "data de conclusão automática");
});

test("gestão de usuários: só o Gestor usa a função", async () => {
  const r = await c.engenheiro.functions.invoke("admin-usuarios", { body: { acao: "criar", nome: "X", email: "x@teste.local", senha: "Teste@12345", papel: "gestor" } });
  assert.ok(r.error);
  const { data: alvo } = await c.gestor.from("perfis").select("id").eq("email", "consulta@teste.local").single();
  const bloq = await c.gestor.functions.invoke("admin-usuarios", { body: { acao: "atualizar", id: alvo.id, ativo: false } });
  assert.ifError(bloq.error);
  const cli = createClient(URL, ANON, { auth: { persistSession: false } });
  const login = await cli.auth.signInWithPassword({ email: "consulta@teste.local", password: SENHA });
  assert.ok(login.error, "usuário bloqueado não entra");
  await c.gestor.functions.invoke("admin-usuarios", { body: { acao: "atualizar", id: alvo.id, ativo: true } });
});
