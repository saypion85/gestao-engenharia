Você (Cowork) vai renovar a chave que o GitHub usa para atualizar o banco do sistema Gestão de Engenharia, usando o Chrome, e depois publicar a atualização pendente do banco. Já estou logado no Supabase e no GitHub no navegador.

Contexto: o workflow "Publicar banco" do GitHub está falhando com a mensagem "Invalid access token", porque a chave do Supabase guardada no segredo SUPABASE_ACCESS_TOKEN deixou de valer.

REGRAS
- Não cadastre cartão, não aceite upgrade e não altere nenhuma configuração além das descritas aqui.
- Não apague tokens antigos nem outros segredos do GitHub.
- A chave nova só pode ser colada no campo do segredo do GitHub. Não a escreva em nenhum outro lugar, nem na resposta para mim.
- Se aparecer qualquer erro, pare, copie a mensagem e me mostre.

PASSO 1 — Gerar a chave nova no Supabase
1. Abra https://supabase.com/dashboard/account/tokens
2. Clique em "Generate new token".
3. Nome: github-gestao-engenharia. Se pedir validade (expiration), escolha a maior disponível ou "Never".
4. Clique para gerar e copie a chave (começa com "sbp_"). Ela só aparece uma vez.

PASSO 2 — Atualizar o segredo no GitHub
1. Abra https://github.com/saypion85/gestao-engenharia/settings/secrets/actions
2. Na linha SUPABASE_ACCESS_TOKEN, clique no ícone de lápis (Update).
3. Cole a chave do Passo 1 e clique em "Update secret".

PASSO 3 — Publicar o banco
1. Abra https://github.com/saypion85/gestao-engenharia/actions/workflows/publicar-banco.yml
2. Clique em "Run workflow" e, na janela que abrir, em "Run workflow" (branch main).
3. Atualize a página até a execução nova terminar (1 a 3 minutos).
4. Se ficar com ✔ verde: siga para o Passo 4.
5. Se ficar com ❌: abra a execução, clique no passo que falhou, copie as últimas 15 linhas e me mostre.
   - Só se o erro NÃO for de chave ou senha, faça o plano B: no Supabase, abra o projeto "gestao-engenharia" → SQL Editor → New query, cole o SQL abaixo e clique em Run. Ele só acrescenta campos e pode rodar mais de uma vez.

alter table rdos drop constraint if exists rdos_clima_manha_check;
alter table rdos drop constraint if exists rdos_clima_tarde_check;
alter table rdos add constraint rdos_clima_manha_check check (clima_manha in ('bom', 'nublado', 'chuvoso', 'impraticavel'));
alter table rdos add constraint rdos_clima_tarde_check check (clima_tarde in ('bom', 'nublado', 'chuvoso', 'impraticavel'));
alter table rdos add column if not exists paralisacoes jsonb not null default '[]';
alter table rdos drop constraint if exists rdos_paralisacoes_lista;
alter table rdos add constraint rdos_paralisacoes_lista check (jsonb_typeof(paralisacoes) = 'array');
notify pgrst, 'reload schema';

PASSO 4 — Conferir no sistema
1. Abra o site do sistema (Gestão de Engenharia) e recarregue a página (Ctrl+F5).
2. Abra qualquer demanda → aba RDO → abra um RDO que esteja em rascunho ou crie um novo com "+ Novo RDO".
3. Confira: no campo "Manhã" deve existir a opção "Nublado", e na seção 6 deve aparecer "+ Adicionar paralisação".
4. Se você criou um RDO só para conferir, apague-o com "Excluir rascunho".

RELATÓRIO
Me informe: se o segredo foi atualizado, o resultado do workflow "Publicar banco" (✔ ou ❌, com o erro se houver), se precisou do plano B e o resultado da conferência do Passo 4. Não mostre a chave.
