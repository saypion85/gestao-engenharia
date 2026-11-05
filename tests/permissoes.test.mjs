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

test("pontos de ação do painel: só o Gestor grava; contratada não lê", async () => {
  const g = await c.gestor.from("painel_pontos").upsert({ id: "teste-permissao", manual: true, titulo: "T", diagnostico: "D" }).select().single();
  assert.ifError(g.error);
  assert.equal(g.data.atualizado_por_nome, "Gustavo Sipião");
  const e = await c.engenheiro.from("painel_pontos").insert({ id: "x-eng", manual: true, titulo: "x" });
  assert.ok(e.error, "engenheiro não grava");
  const { data: lidos } = await c.engenheiro.from("painel_pontos").select("id").eq("id", "teste-permissao");
  assert.equal(lidos.length, 1, "engenheiro lê");
  const { data: ctd } = await c.contratada.from("painel_pontos").select("id");
  assert.equal(ctd.length, 0, "contratada não lê");
  await c.gestor.from("painel_pontos").delete().eq("id", "teste-permissao");
});

test("comentários: autor e data automáticos; só autor ou Gestor editam; contratada não vê", async () => {
  const { data: com, error } = await c.engenheiro.from("comentarios").insert({ demanda_id: demOutra, texto: "Reunião com a Operação definiu janela de obra.", autor_nome: "Falsário" }).select().single();
  assert.ifError(error);
  assert.equal(com.autor_nome, "Luis Soares", "autor vem do login, não do que foi enviado");
  const cons = await c.consulta.from("comentarios").insert({ demanda_id: demOutra, texto: "x" });
  assert.ok(cons.error, "consulta não comenta");
  const { data: lidoConsulta } = await c.consulta.from("comentarios").select("id").eq("id", com.id);
  assert.equal(lidoConsulta.length, 1, "consulta lê");
  const { data: lidoCtd } = await c.contratada.from("comentarios").select("id");
  assert.equal(lidoCtd.length, 0, "contratada não lê");

  const ed = await c.engenheiro.from("comentarios").update({ texto: "Reunião com a Operação definiu janela: 10 a 14/11." }).eq("id", com.id).select().single();
  assert.ifError(ed.error);
  assert.ok(ed.data.editado_em, "registra edição");
  const troca = await c.engenheiro.from("comentarios").update({ autor_id: null }).eq("id", com.id);
  assert.ok(troca.error, "autor não pode ser trocado");

  // outro engenheiro (gestor rebaixado não; usamos a regra: só autor ou gestor) — gestor edita e marca importante
  const g = await c.gestor.from("comentarios").update({ importante: true }).eq("id", com.id).select().single();
  assert.ifError(g.error);
  assert.equal(g.data.editado_por_nome, "Gustavo Sipião");
  const { data: doGestor } = await c.gestor.from("comentarios").insert({ demanda_id: demOutra, texto: "Comentário do gestor" }).select().single();
  const r = await c.engenheiro.from("comentarios").update({ texto: "alterado" }).eq("id", doGestor.id).select();
  assert.equal(r.data?.length ?? 0, 0, "engenheiro não edita comentário de outra pessoa");
  const del = await c.engenheiro.from("comentarios").delete().eq("id", doGestor.id).select();
  assert.equal(del.data?.length ?? 0, 0, "engenheiro não exclui comentário de outra pessoa");
});

test("cronograma: realizado automático ao mudar etapa; contratada lê e não edita", async () => {
  const hoje = new Date().toISOString().slice(0, 10);
  const { data: dem } = await c.engenheiro.from("demandas").insert({ assunto: "Teste cronograma", forma_execucao: "interna", etapa: "estudo_projeto", situacao: "em_andamento", empresa_id: null }).select().single();
  const ins = await c.engenheiro.from("cronograma").insert([
    { demanda_id: dem.id, etapa: "estudo_projeto", nome: "Estudo / Projeto", ordem: 10, inicio_previsto: "2026-01-01", fim_previsto: "2026-01-10", inicio_real: "2026-01-02" },
    { demanda_id: dem.id, etapa: "aprovacao", nome: "Aprovação", ordem: 20 },
  ]);
  assert.ifError(ins.error);
  await c.engenheiro.from("demandas").update({ etapa: "aprovacao" }).eq("id", dem.id);
  const { data: itens } = await c.engenheiro.from("cronograma").select("etapa, inicio_real, fim_real").eq("demanda_id", dem.id).order("ordem");
  assert.equal(itens[0].fim_real, hoje, "fecha a etapa anterior");
  assert.equal(itens[1].inicio_real, hoje, "abre a nova etapa");
  const ruim = await c.engenheiro.from("cronograma").insert({ demanda_id: dem.id, nome: "x", inicio_previsto: "2026-02-10", fim_previsto: "2026-02-01" });
  assert.ok(ruim.error, "fim antes do início é recusado");
  const { data: lidosCtd } = await c.contratada.from("cronograma").select("id").eq("demanda_id", demContratada);
  assert.ok(Array.isArray(lidosCtd));
  const ctdIns = await c.contratada.from("cronograma").insert({ demanda_id: demContratada, nome: "x" });
  assert.ok(ctdIns.error, "contratada não edita cronograma");
  await c.gestor.from("demandas").delete().eq("id", dem.id);
});

test("cronograma: predecessoras na mesma demanda, sem ciclo; calendário por demanda", async () => {
  const { data: d1 } = await c.engenheiro.from("demandas").insert({ assunto: "Teste dependências", forma_execucao: "interna" }).select().single();
  const { data: d2 } = await c.engenheiro.from("demandas").insert({ assunto: "Outra demanda", forma_execucao: "interna" }).select().single();
  const { data: its } = await c.engenheiro.from("cronograma").insert([
    { demanda_id: d1.id, nome: "A", ordem: 1, duracao_dias: 3 }, { demanda_id: d1.id, nome: "B", ordem: 2, duracao_dias: 2 },
    { demanda_id: d1.id, nome: "C", ordem: 3 }, { demanda_id: d2.id, nome: "X", ordem: 1 },
  ]).select("id, nome");
  const id = (n) => its.find((i) => i.nome === n).id;
  assert.ifError((await c.engenheiro.from("cronograma_dependencias").insert({ item_id: id("B"), predecessora_id: id("A"), folga_dias: 2 })).error);
  assert.ifError((await c.engenheiro.from("cronograma_dependencias").insert({ item_id: id("C"), predecessora_id: id("B") })).error);
  const ciclo = await c.engenheiro.from("cronograma_dependencias").insert({ item_id: id("A"), predecessora_id: id("C") });
  assert.match(ciclo.error?.message ?? "", /circular/i, "ciclo A→B→C→A recusado");
  const outra = await c.engenheiro.from("cronograma_dependencias").insert({ item_id: id("A"), predecessora_id: id("X") });
  assert.match(outra.error?.message ?? "", /mesma demanda/i);
  const propria = await c.engenheiro.from("cronograma_dependencias").insert({ item_id: id("A"), predecessora_id: id("A") });
  assert.ok(propria.error, "item não depende de si mesmo");
  assert.ifError((await c.engenheiro.from("cronograma_config").upsert({ demanda_id: d1.id, dias_uteis: true })).error);
  const cons = await c.consulta.from("cronograma_dependencias").insert({ item_id: id("C"), predecessora_id: id("A") });
  assert.ok(cons.error, "consulta não edita");
  const { data: lidas } = await c.consulta.from("cronograma_dependencias").select("*").in("item_id", [id("B"), id("C")]);
  assert.equal(lidas.length, 2, "consulta lê");
  await c.gestor.from("demandas").delete().in("id", [d1.id, d2.id]);
  const { data: sobras } = await c.gestor.from("cronograma_dependencias").select("*").in("item_id", [id("B"), id("C")]);
  assert.equal(sobras.length, 0, "dependências removidas junto com a demanda");
});

test("histórico: autor automático; edição só pelo autor ou Gestor; automáticos bloqueados", async () => {
  const { data: meu, error } = await c.engenheiro.from("historico").insert({ demanda_id: demOutra, texto: "Medição enviada.", autor_nome: "Falsário" }).select().single();
  assert.ifError(error);
  assert.equal(meu.autor_nome, "Luis Soares", "autor vem do login");
  const ed = await c.engenheiro.from("historico").update({ texto: "Medição enviada ao fiscal." }).eq("id", meu.id).select().single();
  assert.ifError(ed.error);
  assert.ok(ed.data.editado_em);
  assert.equal(ed.data.editado_por_nome, "Luis Soares");
  const troca = await c.engenheiro.from("historico").update({ autor_id: null }).eq("id", meu.id);
  assert.ok(troca.error, "autor não pode ser trocado");

  const { data: doGestor } = await c.gestor.from("historico").insert({ demanda_id: demOutra, texto: "Decisão do gestor", tipo: "decisao" }).select().single();
  const alheio = await c.engenheiro.from("historico").update({ texto: "alterado" }).eq("id", doGestor.id).select();
  assert.equal(alheio.data?.length ?? 0, 0, "engenheiro não edita registro de outra pessoa");
  const delAlheio = await c.engenheiro.from("historico").delete().eq("id", doGestor.id).select();
  assert.equal(delAlheio.data?.length ?? 0, 0, "engenheiro não exclui registro de outra pessoa");
  const g = await c.gestor.from("historico").update({ texto: "Medição enviada ao fiscal (revisado)." }).eq("id", meu.id).select().single();
  assert.ifError(g.error);
  assert.equal(g.data.editado_por_nome, "Gustavo Sipião", "gestor edita e fica registrado");

  const { data: auto } = await c.engenheiro.from("historico").select("id").eq("demanda_id", demOutra).eq("tipo", "sistema").limit(1).single();
  const editAuto = await c.gestor.from("historico").update({ texto: "x" }).eq("id", auto.id);
  assert.match(editAuto.error?.message ?? "", /automáticos/, "registro automático não é editável");
  const virarAuto = await c.engenheiro.from("historico").update({ tipo: "sistema" }).eq("id", meu.id);
  assert.ok(virarAuto.error, "não transforma registro em automático");
});

test("reuniões: pauta, decisões, plano de ação, encerramento com ata e trava", async () => {
  const { data: reu, error } = await c.engenheiro.from("reunioes").insert({ titulo: "Semanal teste", data: "2026-11-05" }).select().single();
  assert.ifError(error);
  assert.ifError((await c.engenheiro.from("reuniao_itens").insert({ reuniao_id: reu.id, demanda_id: demOutra, notas: "Aguardar janela da Operação." })).error);
  // decisão a tomar e decisão resolvida na reunião
  const { data: dec } = await c.engenheiro.from("historico").insert({ demanda_id: demOutra, texto: "Locar guindaste?", tipo: "decisao", decisao_status: "pendente", decisao_responsavel: "Gerência", decisao_prazo: "2026-11-10" }).select().single();
  assert.equal(dec.decisao_status, "pendente");
  const cons = await c.consulta.rpc("resolver_decisao", { p_id: dec.id, p_resultado: "Sim" });
  assert.ok(cons.error, "consulta não registra decisão");
  assert.ifError((await c.gestor.rpc("resolver_decisao", { p_id: dec.id, p_resultado: "Sim, 2 diárias", p_reuniao: reu.id })).error);
  const { data: dec2 } = await c.gestor.from("historico").select("decisao_status, decisao_resultado, decidida_por_nome, reuniao_id").eq("id", dec.id).single();
  assert.deepEqual(dec2, { decisao_status: "tomada", decisao_resultado: "Sim, 2 diárias", decidida_por_nome: "Gustavo Sipião", reuniao_id: reu.id });
  // ações: com demanda e sem demanda (assuntos gerais)
  assert.ifError((await c.engenheiro.from("atividades").insert({ demanda_id: demOutra, reuniao_id: reu.id, tipo: "acao", titulo: "Cotar guindaste", prazo: "2026-11-08" })).error);
  const { data: geral, error: eg } = await c.engenheiro.from("atividades").insert({ demanda_id: null, reuniao_id: reu.id, tipo: "acao", titulo: "Revisar procedimento de PT" }).select().single();
  assert.ifError(eg);
  const semVinculo = await c.engenheiro.from("atividades").insert({ demanda_id: null, tipo: "acao", titulo: "solta" });
  assert.ok(semVinculo.error, "ação precisa de demanda ou reunião");
  const { data: lidaCons } = await c.consulta.from("atividades").select("id").eq("id", geral.id);
  assert.equal(lidaCons.length, 1, "equipe interna vê ação de assuntos gerais");
  const { data: lidaCtd } = await c.contratada.from("atividades").select("id").eq("id", geral.id);
  assert.equal(lidaCtd.length, 0, "contratada não vê ação de assuntos gerais");
  const { data: reuCtd } = await c.contratada.from("reunioes").select("id");
  assert.equal(reuCtd.length, 0, "contratada não vê reuniões");
  // encerrar: notas vão para o histórico, ata gravada, reunião travada
  assert.ifError((await c.engenheiro.rpc("encerrar_reuniao", { p_id: reu.id, p_ata: { teste: true } })).error);
  const { data: hs } = await c.engenheiro.from("historico").select("texto, autor_nome").eq("reuniao_id", reu.id).eq("tipo", "atualizacao");
  assert.equal(hs.length, 1);
  assert.match(hs[0].texto, /^Reunião de 05\/11\/2026: Aguardar janela/);
  assert.equal(hs[0].autor_nome, "Luis Soares");
  const travada = await c.engenheiro.from("reunioes").update({ titulo: "x" }).eq("id", reu.id);
  assert.match(travada.error?.message ?? "", /encerrada/);
  const itemDepois = await c.engenheiro.from("reuniao_itens").update({ notas: "x" }).eq("reuniao_id", reu.id);
  assert.match(itemDepois.error?.message ?? "", /encerrada/);
  const reabreEng = await c.engenheiro.rpc("reabrir_reuniao", { p_id: reu.id });
  assert.ok(reabreEng.error, "só o Gestor reabre");
  assert.ifError((await c.gestor.rpc("reabrir_reuniao", { p_id: reu.id })).error);
  assert.ifError((await c.engenheiro.rpc("encerrar_reuniao", { p_id: reu.id, p_ata: { teste: 2 } })).error);
  const { data: hs2 } = await c.engenheiro.from("historico").select("id").eq("reuniao_id", reu.id).eq("tipo", "atualizacao");
  assert.equal(hs2.length, 1, "reencerrar não duplica as anotações no histórico");
  const { data: final } = await c.engenheiro.from("reunioes").select("status, ata, encerrada_por_nome").eq("id", reu.id).single();
  assert.deepEqual(final, { status: "realizada", ata: { teste: 2 }, encerrada_por_nome: "Luis Soares" });
});
