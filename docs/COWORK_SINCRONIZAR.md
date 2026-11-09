Você (Cowork) vai preencher o sistema Gestão de Engenharia com os dados da planilha, usando o Chrome. O arquivo **sincronizacao.sql** está anexado a esta conversa. O usuário já está logado no Supabase no navegador.

## Regras
- Execute **somente** o SQL deste roteiro e o conteúdo do `sincronizacao.sql`, exatamente como está. Não altere, não resuma e não divida o arquivo: ele precisa rodar inteiro de uma só vez.
- Não apague nada, não mude configurações do projeto, não aceite upgrade nem cadastre cartão.
- Se aparecer qualquer erro, pare, copie a mensagem de erro e mostre ao usuário. Não tente corrigir por conta própria.

## Passo 1 — Abrir o projeto
1. Abra https://supabase.com/dashboard e entre no projeto **gestao-engenharia**.
2. No menu da esquerda, abra **SQL Editor** e clique em **New query**.

## Passo 2 — Conferência antes (só leitura)
Cole e execute (**Run**):

```sql
select count(*) as demandas_total,
       count(*) filter (where importado_linha is not null) as demandas_da_planilha
from demandas;
```

Anote os dois números para o relatório final.

## Passo 3 — Rodar a sincronização
1. Abra uma nova aba de consulta (**New query**).
2. Cole **todo** o conteúdo do arquivo anexado `sincronizacao.sql` (cerca de 164 KB). Confira que o texto colado começa com os comentários do script e termina com um `select` após o `commit;`.
3. Clique em **Run**. Se o Supabase perguntar sobre "destructive operations" ou "run this query", confirme: o script só insere dados e preenche campos vazios. Ele não apaga dados da equipe (as únicas tabelas removidas são as temporárias do próprio script).
4. Se não for possível colar o arquivo inteiro, **pare** e peça ao usuário para abrir o `sincronizacao.sql` no Bloco de Notas, apertar Ctrl+A e Ctrl+C. Depois, clique no editor do Supabase e cole com Ctrl+V.

## Passo 4 — Conferência depois
Em uma nova consulta, execute de novo o SQL do Passo 2.

## Relatório ao usuário
Informe:
- Os números de antes e depois do Passo 2. O esperado é que `demandas_da_planilha` termine em **149**.
- A tabela de resumo exibida no fim do Passo 3 (colunas "o que foi feito", "quantidade" e "demandas").
- Qualquer erro, com a mensagem completa.
