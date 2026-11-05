# Publicação — passo a passo (custo zero)

Tempo estimado: 40 a 60 minutos. Nenhum passo pede cartão de crédito.
Use, de preferência, o **e-mail corporativo** para criar as contas: assim o sistema não fica preso a uma pessoa.

> ⚠️ **Antes de começar:** confirme com a TI se a empresa permite guardar estes dados (projetos, custos, fotos, nome e e-mail dos usuários) em serviço de nuvem externo ao Microsoft 365. Os dados ficam no Supabase, região São Paulo.

| Serviço | Para quê | Plano |
|---|---|---|
| GitHub | Guardar o código, publicar o banco automaticamente e fazer o backup diário | Free (repositório privado) |
| Supabase | Banco de dados, login e arquivos | Free (500 MB de banco, 1 GB de arquivos) |
| Cloudflare Pages | Publicar o site na internet | Free |

---

## Passo 1 — GitHub (repositório do código)

1. Crie uma conta em <https://github.com/signup> (se ainda não tiver).
2. Crie um repositório **privado** vazio chamado `gestao-engenharia`: <https://github.com/new> → *Private* → **Create repository** (não marque README).
3. Me informe o endereço (ex.: `github.com/sua-conta/gestao-engenharia`). Eu envio o código para lá.

## Passo 2 — Supabase (banco, login e arquivos)

1. Crie a conta em <https://supabase.com/dashboard/sign-up> (pode entrar com o GitHub).
2. **New project**:
   - *Name*: `gestao-engenharia`
   - *Database Password*: clique em **Generate a password** e **guarde a senha** em local seguro (vai ser usada no passo 4).
   - *Region*: **South America (São Paulo)**
   - Plano **Free**.
3. Desligue o cadastro público (só o Gestor cria usuários):
   **Authentication → Sign In / Providers** → desmarque **Allow new users to sign up** → *Save*.
   Confira que **Email** continua habilitado como forma de login.
4. Anote três informações (vamos usar nos passos 4 e 5):
   - **Project URL** e **chave pública** (*publishable* ou *anon*): botão **Connect** no topo do projeto, ou *Project Settings → API Keys*.
   - **Project ref**: o código que aparece no endereço do painel (`supabase.com/dashboard/project/`**`abcdxyz…`**).
   - **Connection string do Session pooler**: botão **Connect** → *Session pooler* → copie a URI e troque `[YOUR-PASSWORD]` pela senha do banco.
5. Crie um **token de acesso** para o GitHub publicar o banco: <https://supabase.com/dashboard/account/tokens> → *Generate new token* → nome `github-publicacao` → copie.

## Passo 3 — Cloudflare Pages (site)

1. Crie a conta em <https://dash.cloudflare.com/sign-up>.
2. **Workers & Pages → Create → Pages → Connect to Git** → autorize o GitHub → escolha `gestao-engenharia`.
3. Configuração do build:
   - *Framework preset*: **None** (ou Vite)
   - *Build command*: `npm run build`
   - *Build output directory*: `dist`
   - *Environment variables*:
     - `VITE_SUPABASE_URL` = Project URL do passo 2
     - `VITE_SUPABASE_ANON_KEY` = chave pública do passo 2
4. **Save and Deploy**. Ao final aparece o endereço do site, algo como `https://gestao-engenharia.pages.dev`.
5. Volte ao Supabase → **Authentication → URL Configuration** → *Site URL* = endereço do site → *Save*.

A cada alteração enviada ao GitHub, o Cloudflare publica a nova versão sozinho.

## Passo 4 — Segredos no GitHub (publicação do banco e backup)

No repositório: **Settings → Secrets and variables → Actions → New repository secret**. Crie:

| Nome | Valor |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | token do passo 2.5 |
| `SUPABASE_PROJECT_REF` | project ref do passo 2.4 |
| `SUPABASE_DB_PASSWORD` | senha do banco do passo 2.2 |
| `SUPABASE_DB_URL` | connection string do *Session pooler* (passo 2.4) |

Depois: **Actions → Publicar banco → Run workflow**. Em cerca de 2 minutos as tabelas, regras de acesso e a função de usuários estarão criadas.
Rode também **Actions → Backup diário → Run workflow** uma vez para confirmar que o backup funciona.

## Passo 5 — Importar a planilha

1. Revise o arquivo `relatorio_importacao.xlsx` (aba **Para conferir**) que enviei.
2. No Supabase: **SQL Editor → New query** → cole todo o conteúdo de `importacao.sql` → **Run**.
   A importação se recusa a rodar duas vezes (proteção contra duplicar dados).
   *Se o editor reclamar do tamanho*, me avise que divido o arquivo em partes.

## Passo 6 — Primeiro Gestor

1. Supabase → **Authentication → Users → Add user → Create new user** → seu e-mail e uma senha → marque **Auto Confirm User** → *Create*.
2. **SQL Editor** → cole o conteúdo de [`docs/sql/primeiro_gestor.sql`](sql/primeiro_gestor.sql) (ajuste o e-mail se for outro) → **Run**.
3. Abra o site, entre com seu e-mail e senha. A partir daqui, crie os demais usuários pelo menu **Usuários**, sem voltar ao Supabase.

## Passo 7 — Conferência final

- [ ] Login funciona pelo celular e pelo computador (fora da rede da empresa também).
- [ ] Painel mostra as 149 demandas importadas.
- [ ] Criar um usuário Engenheiro de teste, entrar com ele e registrar um andamento.
- [ ] Enviar uma foto em uma demanda.
- [ ] Em **Actions**, o *Backup diário* aparece com ✔.
