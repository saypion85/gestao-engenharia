# Operação do sistema

## Rotina

| O quê | Quem | Quando | Como |
|---|---|---|---|
| Conferir se o backup rodou | Gestor | Semanal | GitHub → Actions → *Backup diário* com ✔ (o GitHub avisa por e-mail se falhar) |
| Copiar os arquivos (fotos/PDFs) | Gestor | Mensal | `scripts/baixar_arquivos.mjs` → guardar a pasta no OneDrive/SharePoint |
| Ver uso de armazenamento | Gestor | Mensal | Painel → *Armazenamento de arquivos* (limite 1 GB) |
| Criar/bloquear usuários | Gestor | Quando precisar | Menu **Usuários** |

## Usuários

- **Criar:** Usuários → *+ Novo usuário*. O sistema gera uma senha provisória; copie a mensagem e envie à pessoa por e-mail/Teams.
- **Esqueceu a senha:** Usuários → *Nova senha* → envie a nova senha provisória. A pessoa troca em **Minha conta**.
- **Saiu da equipe / fim do contrato da empresa:** clique em *Ativo* para mudar para *Bloqueado*. O histórico dela continua preservado.
- **Contratada:** cadastre a empresa em **Cadastros → Empresas**, crie o usuário com perfil *Contratada* e vincule a empresa na demanda (campo *Empresa contratada*). Ela só vê as demandas dessa empresa.

## Backups

**Banco (automático, diário):** GitHub Actions exporta estrutura, dados e usuários todos os dias às 03:23 e guarda por 30 dias.
A consulta diária também mantém o projeto gratuito ativo: o Supabase pausa projetos Free após 7 dias sem uso.

**Arquivos (manual, mensal):** o Supabase Free não faz cópia dos arquivos. Rode no seu computador:

```bash
SUPABASE_URL=https://SEU-PROJETO.supabase.co SUPABASE_SERVICE_ROLE_KEY=chave-service-role node scripts/baixar_arquivos.mjs
```

A pasta gerada contém os arquivos organizados por demanda e um `indice.csv`. Execuções seguintes baixam só o que é novo, se apontadas para a mesma pasta.

### Restaurar um backup do banco (testado)

Use em caso de perda de dados ou para migrar de projeto:

1. Baixe o artefato em Actions → *Backup diário* → execução desejada → *Artifacts*.
2. Crie um projeto Supabase novo e vazio (ou peça ajuda antes de restaurar sobre o projeto atual).
3. Com a connection string do novo projeto (`psql` instalado):

```bash
psql "$NOVA_URL" -f roles.sql
```

```bash
psql "$NOVA_URL" -f schema.sql
```

```bash
psql "$NOVA_URL" -c "SET session_replication_role = replica" -f dados.sql
```

```bash
psql "$NOVA_URL" -f docs/sql/pos_restauracao.sql
```

4. Publique a função de usuários (Actions → *Publicar banco* com os segredos do novo projeto) e atualize as variáveis do Cloudflare.
5. Copie de volta os arquivos do último backup mensal, se necessário.

## Limites do plano gratuito e o que fazer

| Limite | Situação atual | Quando agir |
|---|---|---|
| Banco 500 MB | Os dados importados ocupam menos de 5 MB | Improvável em anos de uso |
| Arquivos 1 GB | Fotos são reduzidas para cerca de 300 KB no envio | Painel acima de 80% → arquivar demandas antigas ou mudar para o Supabase Pro (US$ 25/mês) |
| Pausa após 7 dias sem uso | O backup diário mantém ativo | Se pausar: Supabase → projeto → **Restore** |
| Sem garantia de disponibilidade | — | Se o sistema virar crítico, avaliar o plano pago |

## Atualizações do sistema

Toda alteração no código enviada ao GitHub (branch `main`):
- republica o site automaticamente (Cloudflare);
- aplica mudanças de banco automaticamente, se houver (*Publicar banco*);
- roda as verificações (*Verificar código*).

## Segurança

- O cadastro público está desligado: só o Gestor cria acessos.
- As permissões são aplicadas **no banco de dados** (Row Level Security), não só na tela. Custos ficam numa tabela que só o Gestor consegue ler.
- A chave `service_role` e a senha do banco **nunca** vão para o site. Elas ficam só nos segredos do GitHub e no painel do Supabase.
- Arquivos ficam em área privada. Os links de download são temporários (5 minutos).
