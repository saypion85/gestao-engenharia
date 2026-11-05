// Teste ponta a ponta dos fluxos principais no navegador (Supabase LOCAL + vite dev).
// Uso: node tests/e2e/fluxos.mjs [pasta_screenshots]
import { chromium, devices } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";

const BASE = "http://127.0.0.1:5173";
const OUT = process.argv[2] ?? "test-results";
fs.mkdirSync(OUT, { recursive: true });
const SENHA = "Teste@12345";
const erros = [];
const passo = (m) => console.log("✓", m);

const browser = await chromium.launch();

async function sessao(email, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, locale: "pt-BR", ...opts });
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && erros.push(`[${email}] ${m.text()}`));
  page.on("pageerror", (e) => erros.push(`[${email}] ${e.message}`));
  page.on("dialog", (d) => d.accept(d.type() === "prompt" ? "" : undefined));
  await page.goto(BASE);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  return { ctx, page };
}

// ---------- Login inválido ----------
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.getByLabel("E-mail").fill("engenheiro@teste.local");
  await page.getByLabel("Senha").fill("errada123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByText("E-mail ou senha incorretos.").waitFor();
  await page.screenshot({ path: `${OUT}/01-login.png` });
  passo("login com senha errada mostra mensagem clara");
  await ctx.close();
}

// ---------- Engenheiro ----------
const { page: eng } = await sessao("engenheiro@teste.local");
await eng.getByRole("heading", { name: /Painel de Engenharia/ }).waitFor();
await eng.locator(".kpi").first().waitFor();
await eng.waitForTimeout(800);
await eng.screenshot({ path: `${OUT}/02-painel.png`, fullPage: true });
passo("painel carrega");

// indicador do painel → filtra o painel → "Ver N demandas na lista" mostra os mesmos registros
const chip = eng.locator(".chip-alerta", { hasText: "Sem avaliação de prioridade" });
const valorInd = Number(await chip.locator("strong").innerText());
await chip.click();
await eng.locator(".kpi", { hasText: "Total de demandas" }).locator(".kpi-val").filter({ hasText: String(valorInd) }).waitFor();
await eng.getByRole("link", { name: new RegExp(`Ver ${valorInd} demanda`) }).click();
await eng.getByRole("heading", { name: "Demandas" }).waitFor();
await eng.waitForSelector(".tabela tbody tr");
const qtdLinhas = await eng.locator(".tabela tbody tr").count();
assert.equal(qtdLinhas, valorInd, "número do indicador = registros na lista");

// KPI clicável filtra o painel e a contagem bate com a lista
await eng.goto(BASE);
const kpiMD = eng.locator(".kpi", { hasText: "Contratadas sem MD" });
const nMD = Number(await kpiMD.locator(".kpi-val").innerText());
await kpiMD.click();
await eng.getByText(/Recorte ativo — Contratadas sem MD emitido/).waitFor();
await eng.getByRole("link", { name: new RegExp(`Ver ${nMD} demanda`) }).click();
await eng.waitForSelector(".tabela tbody tr");
assert.equal(await eng.locator(".tabela tbody tr").count(), nMD, "KPI sem MD = lista");
passo(`indicadores do painel (sem avaliação ${valorInd}, sem MD ${nMD}) batem com a lista de demandas`);

// busca
await eng.getByRole("link", { name: "Demandas", exact: true }).click();
await eng.waitForURL(`${BASE}/demandas`);
await eng.getByLabel("Buscar").fill("drenagem");
await eng.waitForTimeout(500);
await eng.getByLabel("Situação").selectOption("todas");
try {
  await eng.waitForFunction(() => document.querySelectorAll(".tabela tbody tr").length >= 2 && location.search.includes("situacao=todas"), null, { timeout: 5000 });
} catch (e) {
  console.log("DEBUG", eng.url(), await eng.locator(".tabela tbody tr").count(), await eng.getByLabel("Buscar").inputValue());
  await eng.screenshot({ path: `${OUT}/erro-busca.png` });
  throw e;
}
await eng.screenshot({ path: `${OUT}/03-lista-busca.png` });
passo("busca por texto funciona");

// nova demanda
await eng.goto(`${BASE}/demandas/nova`);
await eng.getByPlaceholder("Ex.: Reforma do telhado do Armazém 30").fill("Teste E2E - Recuperação de parede do Armazém 8");
await eng.getByRole("button", { name: "Cadastrar demanda" }).click();
await eng.getByText("Avalie a prioridade").waitFor();
passo("cadastro exige avaliação de prioridade");
await eng.locator("label.campo", { hasText: "Local" }).locator("select").selectOption({ label: "Armazém 8" });
await eng.locator("label.campo", { hasText: "Responsável" }).first().locator("select").selectOption({ label: "Luis Soares" });
await eng.locator("label.campo", { hasText: "Prazo de conclusão" }).locator("input").fill("2026-12-15");
await eng.locator("label.campo", { hasText: "Categoria principal" }).locator("select").selectOption("EST");
await eng.getByRole("button", { name: /4\s*Provável/ }).click();
await eng.getByLabel("Severidade Pessoas").selectOption("5");
await eng.getByText("Pontuação (P × S)").waitFor();
await eng.locator(".prioridade-resultado").getByText("Crítico").waitFor();
await eng.screenshot({ path: `${OUT}/04-nova-demanda.png`, fullPage: true });
await eng.getByRole("button", { name: "Cadastrar demanda" }).click();
await eng.locator(".demanda-cabecalho").getByText("Teste E2E").waitFor();
await eng.locator(".demanda-cabecalho .badge", { hasText: "Crítico" }).waitFor();
const urlDemanda = eng.url();
passo("demanda criada com classe Crítico e ranking");

// registrar andamento dentro do Histórico: aparece logo abaixo
await eng.getByRole("button", { name: "Registrar andamento" }).click();
await eng.getByRole("tab", { name: "Histórico", selected: true }).waitFor();
await eng.getByLabel("Texto do andamento").fill("Vistoria realizada; risco confirmado. Área isolada.");
await eng.locator(".registrar label.campo", { hasText: "Situação" }).locator("select").selectOption("em_andamento");
await eng.locator(".registrar label.campo", { hasText: "Etapa" }).locator("select").selectOption("estudo_projeto");
await eng.getByRole("button", { name: "Registrar", exact: true }).click();
await eng.getByText("Andamento registrado.").waitFor();
await eng.locator(".linha-tempo li", { hasText: "Vistoria realizada" }).waitFor();
await eng.locator(".linha-badges .badge", { hasText: "Em andamento" }).waitFor();
await eng.getByLabel("Texto do andamento").fill("Operação liberou a área somente aos sábados.");
await eng.getByText("Marcar como decisão importante").click();
await eng.getByRole("button", { name: "Registrar", exact: true }).click();
await eng.locator(".linha-tempo li", { hasText: "somente aos sábados" }).getByText("Decisão").waitFor();
await eng.getByLabel("Filtrar histórico").selectOption("todos");
await eng.getByText(/Situação: Não iniciada → Em andamento/).waitFor();
assert.equal(await eng.locator(".linha-tempo li.lt-sistema").getByRole("button", { name: "editar" }).count(), 0, "registro automático não é editável");
passo("registrar andamento no Histórico: aparece logo abaixo, com decisão e mudança automática");

// editar o próprio registro
const reg = eng.locator(".linha-tempo li", { hasText: "somente aos sábados" });
await reg.getByRole("button", { name: "editar" }).click();
await eng.getByLabel("Editar registro").fill("Operação liberou a área somente aos sábados, das 7h às 17h.");
await eng.locator(".linha-tempo li").getByRole("button", { name: "Salvar" }).click();
await eng.locator(".linha-tempo li", { hasText: "das 7h às 17h" }).getByText(/editado em/).waitFor();
await eng.screenshot({ path: `${OUT}/05b-historico.png`, fullPage: true });
await eng.getByRole("tab", { name: "Resumo" }).click();
await eng.locator(".cartao", { hasText: "Últimos andamentos" }).getByText("das 7h às 17h").waitFor();
assert.equal(await eng.getByRole("tab", { name: "Comentários" }).count(), 0, "aba Comentários removida");
await eng.screenshot({ path: `${OUT}/05-demanda-resumo.png`, fullPage: true });
passo("autor edita o próprio registro (marcado como editado) e o Resumo mostra os últimos andamentos");

// cronograma: durações, predecessoras e calendário
await eng.getByRole("tab", { name: "Cronograma" }).click();
await eng.getByRole("button", { name: "Criar cronograma" }).click();
await eng.getByRole("heading", { name: "Editar cronograma" }).waitFor();
await eng.getByLabel("Início previsto de Estudo / Projeto").fill("2026-11-09"); // segunda
await eng.getByLabel("Duração de Estudo / Projeto").fill("5");
await eng.getByLabel("Fim previsto de Estudo / Projeto").and(eng.locator('[value="2026-11-13"]')).waitFor(); // sexta
await eng.getByLabel("Adicionar predecessora para Memorial Descritivo").selectOption({ label: "#2 Estudo / Projeto" });
await eng.getByLabel("Duração de Memorial Descritivo").fill("3");
// dias corridos: começa no sábado seguinte
await eng.getByLabel("Fim previsto de Memorial Descritivo").and(eng.locator('[value="2026-11-16"]')).waitFor();
await eng.getByRole("button", { name: /dias úteis/ }).click();
// dias úteis: começa na segunda 16/11 e termina 18/11
await eng.getByLabel("Fim previsto de Memorial Descritivo").and(eng.locator('[value="2026-11-18"]')).waitFor();
await eng.getByLabel("Adicionar predecessora para Execução").selectOption({ label: "#3 Memorial Descritivo" });
await eng.getByLabel("Folga após Memorial Descritivo").fill("2");
await eng.getByLabel("Duração de Execução").fill("10");
await eng.getByLabel("Fim previsto de Execução").and(eng.locator('[value="2026-12-04"]')).waitFor(); // início 23/11 (+2 úteis), 10 dias úteis
// mudar a duração do Estudo empurra a cadeia
await eng.getByLabel("Duração de Estudo / Projeto").fill("6");
await eng.getByLabel("Fim previsto de Execução").and(eng.locator('[value="2026-12-07"]')).waitFor();
await eng.getByRole("button", { name: /Item personalizado/ }).click();
await eng.getByLabel("Nome do item").last().fill("Mobilização da contratada");
await eng.getByRole("button", { name: "Salvar cronograma" }).click();
await eng.getByText("Cronograma salvo.").waitFor();
await eng.locator(".resumo-numeros").getByText("Dias úteis").waitFor();
await eng.locator(".gantt-linha", { hasText: "Execução" }).getByText(/após Memorial Descritivo \+2d úteis/).waitFor();
await eng.locator(".gantt-linha", { hasText: "Mobilização da contratada" }).waitFor();
await eng.locator(".gantt-fds").first().waitFor();
await eng.locator(".gantt-linha", { hasText: "Execução" }).locator(".gantt-data", { hasText: "24/11" }).waitFor(); // início na ponta da barra (após o Estudo passar a 6 dias)
await eng.locator(".gantt-linha", { hasText: "Execução" }).locator(".gantt-data", { hasText: "07/12" }).waitFor();
await eng.locator(".gantt-linha", { hasText: "Mobilização" }).first().waitFor(); // etapa após a OS no modelo
await eng.screenshot({ path: `${OUT}/05c-cronograma.png`, fullPage: true });
await eng.getByRole("link", { name: "Cronograma", exact: true }).click();
await eng.getByRole("heading", { name: "Cronograma", exact: true }).waitFor();
await eng.locator(".gantt-linha", { hasText: "Recuperação de parede do Armazém 8" }).click();
await eng.getByRole("button", { name: "Editar cronograma" }).waitFor();
await eng.goBack();
await eng.screenshot({ path: `${OUT}/05d-cronograma-geral.png`, fullPage: true });
await eng.goto(urlDemanda);
await eng.locator(".demanda-cabecalho").waitFor();
passo("cronograma: predecessoras propagam datas, dias corridos × úteis, folga, item personalizado e visão geral");

// reunião: pauta, decisões, plano de ação e ata
await eng.getByRole("link", { name: "Reuniões", exact: true }).click();
await eng.getByRole("heading", { name: "Reuniões", exact: true }).waitFor();
await eng.getByRole("button", { name: "+ Nova reunião" }).click();
await eng.getByText("Sugestões de pauta").waitFor();
await eng.getByPlaceholder("Digite código, assunto ou local…").fill("Recuperação de parede");
await eng.locator(".resultados-busca").getByRole("button", { name: /Recuperação de parede/ }).click();
const card = eng.locator(".item-pauta", { hasText: "Recuperação de parede" });
await card.waitFor();
await card.getByLabel(/Anotações sobre/).fill("Operação confirmou janela aos sábados; escoramento mantido.");
await card.getByText("✓ salvo").waitFor({ timeout: 8000 });
await card.getByRole("button", { name: "+ Decisão a tomar" }).click();
await card.getByLabel("Texto da decisão").fill("Demolir e reconstruir a parede?");
await card.getByLabel("Quem decide").fill("Gerência");
await card.getByRole("button", { name: "Incluir" }).click();
await card.locator(".bloco-pauta", { hasText: "Decisões a tomar" }).getByText("Demolir e reconstruir a parede?").waitFor();
await card.getByRole("button", { name: "registrar decisão" }).click();
await card.getByLabel("O que foi decidido").fill("Sim, reconstruir em alvenaria estrutural");
await card.getByRole("button", { name: "Salvar decisão" }).click();
await card.locator(".bloco-pauta", { hasText: "Decidido nesta reunião" }).getByText(/alvenaria estrutural/).waitFor();
await card.getByRole("button", { name: "+ Ação" }).click();
await card.getByLabel("Descrição da ação").fill("Contratar projeto estrutural da parede");
await card.getByLabel("Responsável pela ação").selectOption({ label: "Luis Soares" });
await card.getByLabel("Prazo da ação").fill("2026-11-20");
await card.getByRole("button", { name: "Incluir" }).click();
await card.locator(".acoes-hoje").getByText("Contratar projeto estrutural da parede").waitFor();
await eng.getByLabel("Assuntos gerais").fill("Escala de férias de dezembro.");
await eng.locator(".cartao", { hasText: "Assuntos gerais" }).getByText("✓ salvo").waitFor({ timeout: 8000 });
await eng.screenshot({ path: `${OUT}/05e-reuniao.png`, fullPage: true });
await eng.getByRole("button", { name: "Encerrar e gerar ata" }).first().click();
await eng.getByRole("heading", { name: "Ata de reunião" }).waitFor();
const doc = eng.locator(".ata-doc");
await doc.locator("table", { hasText: "Contratar projeto estrutural da parede" }).getByText("Luis Soares").waitFor();
await doc.getByText("20/11/2026").first().waitFor();
await doc.getByText(/Demolir e reconstruir a parede\?/).waitFor();
await doc.getByText(/janela aos sábados/).waitFor();
await doc.getByText("Escala de férias de dezembro.").waitFor();
await eng.screenshot({ path: `${OUT}/05f-ata.png`, fullPage: true });
await eng.pdf({ path: `${OUT}/05g-ata.pdf`, format: "A4", printBackground: true });
// ficou registrado na demanda e nos painéis da seção
await eng.goto(urlDemanda + "?aba=historico");
await eng.locator(".linha-tempo li", { hasText: "Reunião de" }).getByText(/janela aos sábados/).waitFor();
await eng.locator(".linha-tempo li", { hasText: "Demolir e reconstruir" }).getByText("Decisão tomada").waitFor();
await eng.goto(`${BASE}/reunioes?aba=acoes`);
await eng.getByRole("cell", { name: "Contratar projeto estrutural da parede" }).waitFor();
await eng.goto(`${BASE}/reunioes`);
await eng.locator(".reuniao-linha").first().getByText("Realizada · ata gerada").waitFor();
await eng.goto(urlDemanda);
await eng.locator(".demanda-cabecalho").waitFor();
passo("reunião: pauta, notas salvas sozinhas, decisão a tomar → tomada, plano de ação, ata (PDF) e registro na demanda");

// atividades
await eng.getByRole("tab", { name: "Atividades" }).click();
await eng.getByRole("button", { name: "+ Novo item" }).click();
await eng.locator(".modal").getByRole("button", { name: "Pendência" }).click();
await eng.locator(".modal label.campo", { hasText: "Descrição" }).locator("input").fill("Liberação da área pela Operação");
await eng.locator(".modal label.campo", { hasText: "Prazo" }).locator("input").fill("2026-11-04");
await eng.locator(".modal").getByText("Está impedindo o andamento").click();
await eng.locator(".modal").getByPlaceholder("Ex.: área não liberada pela Operação").fill("Operação sem janela");
await eng.locator(".modal").getByRole("button", { name: "Salvar" }).click();
await eng.locator(".item", { hasText: "Liberação da área" }).getByText("Impedimento").waitFor();
await eng.screenshot({ path: `${OUT}/06-atividades.png` });
passo("pendência com impedimento e prazo vencido");

// documento
await eng.getByRole("tab", { name: "Documentos" }).click();
fs.writeFileSync(`${OUT}/laudo.txt`, "Laudo de vistoria");
await eng.locator(".area-envio input[type=file]").setInputFiles(`${OUT}/laudo.txt`);
await eng.getByText("Arquivo enviado.").waitFor();
await eng.locator(".docs").getByText("laudo.txt").waitFor();
passo("upload de documento");

// medição: OC com planilha, medição por quantidade, aprovação, pagamento e boletim
await eng.getByRole("tab", { name: "Medição" }).click();
await eng.getByRole("button", { name: "+ Ordem de Compra" }).click();
await eng.locator(".modal label.campo", { hasText: "Número da OC" }).locator("input").fill("4500987");
await eng.getByLabel("Nome do fornecedor").fill("Construtora Alfa");
await eng.locator(".modal").getByRole("button", { name: "Salvar" }).click();
await eng.locator(".oc", { hasText: "OC 4500987" }).waitFor();
await eng.getByRole("button", { name: /Planilha \(0 itens\)/ }).click();
await eng.getByRole("button", { name: "+ Item" }).click();
await eng.getByLabel("Descrição do item").fill("Demolição de parede");
await eng.getByLabel("Unidade").fill("m²");
await eng.getByLabel("Quantidade contratada").fill("40");
await eng.getByLabel("Preço unitário").fill("85,50");
await eng.getByRole("button", { name: "+ Item" }).click();
await eng.getByLabel("Descrição do item").nth(1).fill("Alvenaria estrutural");
await eng.getByLabel("Unidade").nth(1).fill("m²");
await eng.getByLabel("Quantidade contratada").nth(1).fill("40");
await eng.getByLabel("Preço unitário").nth(1).fill("210");
await eng.getByRole("button", { name: "Salvar planilha" }).click();
await eng.locator(".oc").getByText("R$ 11.820,00").first().waitFor(); // 40×85,50 + 40×210
await eng.getByRole("button", { name: "+ Nova medição" }).click();
await eng.getByRole("heading", { name: /Medição nº 1/ }).waitFor();
await eng.getByLabel("Quantidade medida de Demolição de parede").fill("40");
await eng.getByLabel("Quantidade medida de Alvenaria estrutural").fill("45");
await eng.getByRole("button", { name: "Salvar", exact: true }).click();
await eng.getByText(/só restam 40/).waitFor();
await eng.getByLabel("Quantidade medida de Alvenaria estrutural").fill("10");
await eng.locator(".modal .resumo-numeros").getByText("R$ 5.520,00").waitFor(); // 3.420 + 2.100
await eng.getByRole("button", { name: "Aprovar medição" }).click();
await eng.getByText("Medição aprovada.").waitFor();
await eng.locator(".oc tbody tr").first().getByRole("button", { name: "Abrir" }).click();
await eng.getByPlaceholder("Nº da NF").fill("NF 7781");
await eng.getByRole("button", { name: "Registrar pagamento" }).click();
await eng.getByText("Pagamento registrado.").waitFor();
await eng.locator(".oc tbody tr").first().getByText("Paga").waitFor();
await eng.locator(".resumo-numeros").first().getByText("R$ 6.300,00").waitFor(); // saldo a medir
await eng.screenshot({ path: `${OUT}/06b-medicao.png`, fullPage: true });
await eng.locator(".oc tbody tr").first().getByRole("button", { name: "Abrir" }).click();
const [boletim] = await Promise.all([eng.context().waitForEvent("page"), eng.getByRole("link", { name: "Boletim de medição (PDF)" }).click()]);
await boletim.getByRole("heading", { name: "Boletim de Medição nº 1" }).waitFor();
await boletim.locator(".totais-boletim .destaque-linha").getByText("R$ 5.520,00").waitFor();
await boletim.screenshot({ path: `${OUT}/06c-boletim.png`, fullPage: true });
await boletim.pdf({ path: `${OUT}/06d-boletim.pdf`, format: "A4", landscape: true, printBackground: true });
await boletim.close();
await eng.keyboard.press("Escape");
passo("medição: OC com planilha, limite por item, aprovação, pagamento com NF, saldo e boletim em PDF");

// RDO equipe
await eng.getByRole("tab", { name: "RDO" }).click();
await eng.getByRole("button", { name: "+ Novo RDO" }).click();
await eng.getByRole("heading", { name: "RDO — Relatório Diário de Obra" }).waitFor();
await eng.getByRole("button", { name: "+ Adicionar pessoa" }).click();
await eng.getByLabel("Nome", { exact: true }).fill("José da Silva");
await eng.getByLabel("Função").fill("Pedreiro");
await eng.getByRole("button", { name: "+ Adicionar pessoa" }).click();
await eng.getByLabel("Nome", { exact: true }).nth(1).fill("Carlos Souza");
await eng.getByLabel("Função").nth(1).fill("Ajudante");
await eng.getByText("Próprio: 2").waitFor();
await eng.locator(".campo", { hasText: "AST realizada?" }).getByRole("button", { name: "Sim" }).click();
await eng.getByLabel("Atividades executadas").fill("Escoramento provisório da parede.");
await eng.getByRole("button", { name: "+ Adicionar ocorrência" }).click();
await eng.getByLabel("Ocorrência").fill("Chuva forte às 14h");
await eng.getByRole("button", { name: "Finalizar RDO" }).click();
await eng.getByText("RDO finalizado.").waitFor();
await eng.screenshot({ path: `${OUT}/07-rdo-equipe.png`, fullPage: true });
passo("RDO da equipe criado e finalizado");

// Atividades globais
await eng.getByRole("link", { name: "Atividades" }).click();
await eng.getByRole("heading", { name: "Atividades em aberto" }).waitFor();
await eng.getByText("Liberação da área pela Operação").waitFor();
passo("página de atividades mostra itens da equipe");

// ---------- Contratada ----------
const { page: ctd } = await sessao("contratada@teste.local");
await ctd.getByRole("heading", { name: "Minhas demandas" }).waitFor();
await ctd.waitForSelector(".tabela tbody tr");
const nCtd = await ctd.locator(".tabela tbody tr").count();
assert.equal(nCtd, 2, "contratada vê só 2 demandas");
assert.equal(await ctd.getByRole("link", { name: "Painel" }).count(), 0);
await ctd.screenshot({ path: `${OUT}/08-contratada-lista.png` });
await ctd.locator(".tabela tbody tr a").first().click();
await ctd.locator(".demanda-cabecalho").waitFor();
assert.equal(await ctd.getByRole("tab", { name: "Histórico" }).count(), 0, "contratada sem aba Histórico");
assert.equal(await ctd.getByRole("tab", { name: "Custos" }).count(), 0, "contratada sem aba Custos");
assert.equal(await ctd.getByRole("tab", { name: "Medição" }).count(), 0, "contratada sem aba Medição");
await ctd.getByRole("tab", { name: "RDO" }).click();
await ctd.getByRole("button", { name: "+ Novo RDO" }).click();
await ctd.getByText("Preenchido pela contratada").waitFor();
await ctd.getByRole("button", { name: "+ Adicionar pessoa" }).click();
await ctd.getByLabel("Nome", { exact: true }).fill("Pedro Lima");
await ctd.getByLabel("Função").fill("Ajudante");
await ctd.getByLabel("Atividades executadas").fill("Escavação da vala, 12 m.");
await ctd.getByRole("button", { name: "+ Adicionar ocorrência" }).click();
await ctd.getByLabel("Ocorrência").fill("Área não liberada pela Operação até 10h");
await ctd.locator(".ocorrencia").getByText("Impedimento").click();
await ctd.locator("label.area-envio input[type=file]").setInputFiles(`${OUT}/laudo.txt`);
await ctd.waitForTimeout(1200);
await ctd.getByRole("button", { name: "Enviar para a Triunfo" }).click();
await ctd.getByText("RDO enviado para a Triunfo.").waitFor();
assert.equal(await ctd.getByLabel("Apontamentos da Contratante").count(), 0, "contratada não edita apontamentos");
const urlRdo = ctd.url();
await ctd.screenshot({ path: `${OUT}/09-rdo-contratada.png`, fullPage: true });
passo("contratada preenche e envia RDO; não vê histórico/custos nem edita apontamentos");

// ---------- Engenheiro revisa ----------
await eng.goto(urlRdo);
await eng.getByLabel("Apontamentos da Contratante").fill("Instalar sinalização na vala antes de continuar.");
await eng.getByRole("button", { name: "Revisar com ressalvas" }).click();
await eng.getByText("Revisão registrada").waitFor();
await eng.getByText(/Revisado por Luis Soares/).waitFor();
passo("engenheiro aponta e revisa; RDO travado");
await eng.goto(BASE);
await eng.locator(".chip-alerta", { hasText: "Com impedimento" }).waitFor();
assert.ok(Number(await eng.locator(".chip-alerta", { hasText: "Com impedimento" }).locator("strong").innerText()) >= 2);
await eng.locator(".ponto", { hasText: "Impedimentos registrados" }).waitFor();
passo("impedimentos de atividade e de RDO aparecem no painel");

await ctd.goto(urlRdo);
await ctd.getByText("Instalar sinalização na vala").waitFor();
await ctd.getByText("não pode mais ser alterado").waitFor();
passo("contratada vê o apontamento e o RDO travado");

// ---------- Consulta ----------
const { page: con } = await sessao("consulta@teste.local");
await con.getByRole("heading", { name: /Painel de Engenharia/ }).waitFor();
await con.goto(urlDemanda);
await con.locator(".demanda-cabecalho").waitFor();
assert.equal(await con.getByRole("button", { name: "Editar" }).count(), 0);
assert.equal(await con.getByRole("button", { name: "Registrar andamento" }).count(), 0);
await con.getByRole("tab", { name: "Histórico" }).click();
await con.locator(".linha-tempo li").first().waitFor();
assert.equal(await con.getByLabel("Texto do andamento").count(), 0, "consulta não registra");
assert.equal(await con.getByRole("button", { name: "editar" }).count(), 0, "consulta não edita");
assert.equal(await con.getByRole("tab", { name: "Custos" }).count(), 0);
assert.equal(await con.getByRole("tab", { name: "Medição" }).count(), 0, "consulta não vê medição");
passo("consulta: só leitura, sem custos");

// ---------- Gestor ----------
const { page: ges } = await sessao("gestor@teste.local");
await ges.getByRole("heading", { name: /Painel de Engenharia/ }).waitFor();
await ges.getByText("Financeiro informado").waitFor();
// ponto de ação: Gestor ajusta a ação e cria um ponto manual
const pontoParado = ges.locator(".ponto", { hasText: "Carteira sem movimentação" });
await pontoParado.getByRole("button", { name: "Ajustar" }).click();
await pontoParado.getByLabel("Nota do Gestor (opcional)").fill("Revisar na reunião de segunda.");
await pontoParado.getByRole("button", { name: "Salvar" }).click();
await ges.getByText("Revisar na reunião de segunda.").waitFor();
await ges.getByRole("button", { name: "+ Ponto manual" }).click();
await ges.getByLabel("Título").fill("Contrato de manutenção predial");
await ges.getByLabel("Diagnóstico").fill("Renovação vence em dezembro.");
await ges.locator(".ponto", { hasText: "Novo ponto manual" }).getByRole("button", { name: "Salvar" }).click();
await ges.locator(".ponto", { hasText: "Contrato de manutenção predial" }).waitFor();
// tema escuro
await ges.getByRole("button", { name: /Escuro/ }).click();
assert.equal(await ges.evaluate(() => document.documentElement.dataset.theme), "dark");
await ges.reload();
await ges.locator(".kpi").first().waitFor();
assert.equal(await ges.evaluate(() => document.documentElement.dataset.theme), "dark", "tema fica salvo");
await ges.screenshot({ path: `${OUT}/10b-painel-escuro.png` });
await ges.getByRole("button", { name: /Claro/ }).click();
passo("gestor ajusta ponto de ação, cria ponto manual e alterna o tema (salvo no navegador)");
await ges.goto(`${BASE}/demandas?situacao=todas&q=central%20de%20residuos`);
await ges.waitForSelector(".tabela tbody tr");
await ges.locator(".tabela tbody tr a").first().click();
await ges.getByRole("tab", { name: "Custos" }).click();
await ges.getByText("visível só para o Gestor").waitFor();
await ges.screenshot({ path: `${OUT}/10-custos-gestor.png`, fullPage: true });
await ges.getByRole("link", { name: "Usuários" }).click();
await ges.getByText("consulta@teste.local").waitFor();
await ges.screenshot({ path: `${OUT}/11-usuarios.png` });
passo("gestor vê custos, Save e gestão de usuários");

// ---------- Celular ----------
const cel = await browser.newContext({ ...devices["iPhone 13"], locale: "pt-BR" });
const m = await cel.newPage();
m.on("pageerror", (e) => erros.push(`[celular] ${e.message}`));
await m.goto(BASE);
await m.getByLabel("E-mail").fill("engenheiro@teste.local");
await m.getByLabel("Senha").fill(SENHA);
await m.getByRole("button", { name: "Entrar" }).click();
await m.getByRole("heading", { name: /Painel de Engenharia/ }).waitFor();
await m.waitForTimeout(600);
const largura = await m.evaluate(() => [document.documentElement.scrollWidth, screen.width]);
assert.ok(largura[0] <= largura[1] + 1, `sem rolagem horizontal no celular (${largura})`);
await m.screenshot({ path: `${OUT}/12-celular-painel.png` });
await m.getByRole("button", { name: "Abrir menu" }).click();
await m.getByRole("link", { name: "Demandas", exact: true }).click();
await m.waitForSelector(".cartao-demanda");
await m.screenshot({ path: `${OUT}/13-celular-lista.png` });
await m.goto(urlDemanda);
await m.locator(".demanda-cabecalho").waitFor();
const largura2 = await m.evaluate(() => [document.documentElement.scrollWidth, screen.width]);
assert.ok(largura2[0] <= largura2[1] + 1, `ficha sem rolagem horizontal (${largura2})`);
await m.screenshot({ path: `${OUT}/14-celular-demanda.png`, fullPage: true });
await m.goto(urlRdo);
await m.getByRole("heading", { name: "RDO — Relatório Diário de Obra" }).waitFor();
await m.screenshot({ path: `${OUT}/15-celular-rdo.png`, fullPage: true });
passo("celular: painel, lista, ficha e RDO sem rolagem horizontal");

// PDF do RDO
await eng.goto(urlRdo);
await eng.getByRole("heading", { name: "RDO — Relatório Diário de Obra" }).waitFor();
await eng.waitForTimeout(500);
await eng.pdf({ path: `${OUT}/16-rdo.pdf`, format: "A4", printBackground: true });
passo("RDO exporta para PDF");

await browser.close();
const relevantes = erros.filter((e) => !/favicon|Failed to load resource.*(400|404)/.test(e));
if (relevantes.length) {
  console.log("\nErros no console:\n" + relevantes.join("\n"));
  process.exit(1);
}
console.log("\nTodos os fluxos passaram, sem erros no console.");
