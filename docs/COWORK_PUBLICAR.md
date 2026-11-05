# Instruções para o Cowork: publicar o sistema Gestão de Engenharia

Você (Cowork) vai publicar um sistema web que **já está pronto**. Não é preciso escrever código nem criar tabelas manualmente.

## O que já existe

- **Código completo do site e do banco:** repositório GitHub privado <https://github.com/saypion85/gestao-engenharia> (branch `main`). O usuário já está logado no GitHub no navegador.
- **Criação das tabelas:** não use SQL para isso. O próprio repositório tem o workflow **"Publicar banco"** (`.github/workflows/publicar-banco.yml`), que cria todas as tabelas, regras de acesso e a função de usuários (`supabase/migrations/` e `supabase/functions/`). Ele só precisa dos 4 segredos da Etapa 3.
- **Dados da planilha:** arquivo `importacao.sql` anexado pelo usuário. Ele **só insere dados**, por isso deve ser executado **depois** do workflow "Publicar banco" ter terminado com sucesso.
- **Contas:** o usuário já tem contas no Supabase e no Cloudflare (login pelo GitHub).

## Regras

- Use somente planos **gratuitos**. Nunca cadastre cartão nem aceite upgrade.
- Antes de qualquer ação que gere custo ou apague dados, **pare e pergunte** ao usuário.
- Assim que gerar a **senha do banco**, mostre-a ao usuário para ele guardar.
- Não publique tokens ou senhas em lugar nenhum além dos campos indicados.
- No final, informe o **endereço do site** e o resultado da conferência.

Guarde, ao longo do caminho, estes valores: **A** senha do banco · **B** Project URL · **C** chave pública · **D** connection string do Session pooler · **E** project ref · **F** token de acesso.

---

## Etapa 1 — Criar o projeto no Supabase

1. Abra <https://supabase.com/dashboard> → **New project** (se pedir organização, use a existente, plano Free).
2. *Name*: `gestao-engenharia`.
3. *Database Password*: **Generate a password**, copie e guarde como **A**. **Mostre ao usuário.**
4. *Region*: **South America (São Paulo)**.
5. **Create new project** e aguarde ficar pronto (~2 min).

## Etapa 2 — Configurar o Supabase e coletar dados

1. **Authentication → Sign In / Providers**: desmarque **Allow new users to sign up** → **Save**. O provedor **Email** deve continuar habilitado.
2. Botão **Connect**, no topo do projeto:
   - **Project URL** → guarde como **B** (ex.: `https://abcd1234.supabase.co`).
   - **Chave pública**, *publishable* ou *anon* → guarde como **C**. Em *Project Settings → API Keys*, se não aparecer no Connect.
   - **Session pooler** → copie a URI `postgresql://…`, troque `[YOUR-PASSWORD]` por **A** e guarde como **D**.
3. O **project ref** é o código no endereço do navegador depois de `/project/` → guarde como **E**.
4. Abra <https://supabase.com/dashboard/account/tokens> → **Generate new token** → nome `github` → copie e guarde como **F**.

## Etapa 3 — Segredos no GitHub e criação do banco

1. Abra <https://github.com/saypion85/gestao-engenharia/settings/secrets/actions> → **New repository secret**. Crie os 4:

   | Name | Valor |
   |---|---|
   | `SUPABASE_ACCESS_TOKEN` | F |
   | `SUPABASE_PROJECT_REF` | E |
   | `SUPABASE_DB_PASSWORD` | A |
   | `SUPABASE_DB_URL` | D |

2. Abra <https://github.com/saypion85/gestao-engenharia/actions/workflows/publicar-banco.yml> → **Run workflow** → **Run workflow**. Aguarde o ✔ verde.
   Se falhar (❌), abra a execução, copie as últimas linhas do erro e mostre ao usuário. Não prossiga.
3. Abra <https://github.com/saypion85/gestao-engenharia/actions/workflows/backup.yml> → **Run workflow**. Aguarde o ✔ verde.

## Etapa 4 — Importar os dados e criar o Gestor

1. Supabase → **SQL Editor** → **New query** → cole **todo** o conteúdo do `importacao.sql` anexado → **Run**. Deve terminar sem erro.
   Se o editor recusar pelo tamanho, divida o arquivo em partes, mantendo `begin;` no início da primeira e `commit;` no fim da última, ou avise o usuário.
2. **Authentication → Users → Add user → Create new user**:
   - E-mail: `gustavo.sipiao@triunfologistica.com.br`
   - Senha: **peça ao usuário** para digitar a senha que ele quer usar.
   - Marque **Auto Confirm User** → **Create user**.
3. **SQL Editor → New query**, cole e execute:

```sql
update perfis set papel = 'gestor', nome = 'Gustavo Sipião'
 where email = 'gustavo.sipiao@triunfologistica.com.br';
update pessoas set perfil_id = (select id from perfis where email = 'gustavo.sipiao@triunfologistica.com.br'),
       email = 'gustavo.sipiao@triunfologistica.com.br'
 where nome = 'Gustavo Sipião';
select nome, email, papel from perfis;
select count(*) as demandas from demandas;
```

   Resultado esperado: o perfil com papel `gestor` e `demandas` = 149.

## Etapa 5 — Publicar o site no Cloudflare Pages

1. Abra <https://dash.cloudflare.com> → **Workers & Pages** → **Create** → aba **Pages** → **Connect to Git** (pode aparecer como *Import an existing Git repository*).
2. Autorize o GitHub, se pedir, e escolha **saypion85/gestao-engenharia**.
3. Configuração:
   - *Production branch*: `main`
   - *Framework preset*: **None** (ou Vite)
   - *Build command*: `npm run build`
   - *Build output directory*: `dist`
   - *Environment variables*: `VITE_SUPABASE_URL` = **B** e `VITE_SUPABASE_ANON_KEY` = **C**
4. **Save and Deploy** e aguarde o fim. Anote o endereço do site (ex.: `https://gestao-engenharia.pages.dev`).
5. De volta ao Supabase → **Authentication → URL Configuration** → *Site URL* = endereço do site → **Save**.

## Conferência final (relate ao usuário)

- [ ] O site abre e mostra a tela de login da Triunfo.
- [ ] Login com `gustavo.sipiao@triunfologistica.com.br` funciona e o menu mostra **Usuários** e **Cadastros**.
- [ ] O Painel mostra **74 demandas abertas**, e o menu Demandas → *Todas as situações* mostra 149.
- [ ] GitHub Actions: *Publicar banco* e *Backup diário* com ✔.

Informe ao usuário: endereço do site, senha do banco (A, para guardar) e qualquer etapa que tenha falhado.
