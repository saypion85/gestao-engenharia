# Gestão de Engenharia — Infraestrutura · Triunfo Logística

Sistema web para centralizar as demandas e os projetos de Engenharia: cadastro, prioridade, atividades, contratação (MD, RMS, OS), custos, histórico, documentos, RDO e painel gerencial.

- **Uso:** pelo navegador, no computador ou no celular. O acesso é com e-mail e senha criados pelo Gestor.
- **Infraestrutura (custo zero):** Supabase Free (banco PostgreSQL, login e arquivos, região São Paulo) + Cloudflare Pages Free (site) + GitHub (código, publicação e backup diário).

## Documentos

| Documento | Conteúdo |
|---|---|
| [docs/PUBLICACAO.md](docs/PUBLICACAO.md) | Passo a passo para colocar no ar |
| [docs/OPERACAO.md](docs/OPERACAO.md) | Rotina, usuários, backups e restauração, limites |
| [docs/REGRAS.md](docs/REGRAS.md) | Regras de negócio, perfis, critérios dos indicadores, de-para da planilha |
| [docs/AUTOMACOES.md](docs/AUTOMACOES.md) | Proposta de automações (a validar) |

## Estrutura do código

```
src/                      Aplicação web (React + TypeScript + Vite)
  lib/dominio.ts          Rótulos, fluxo e cálculo da prioridade
  lib/filtros.ts          Critérios únicos dos indicadores e filtros
  pages/                  Painel, Demandas, Ficha, RDO, Atividades, Usuários, Cadastros
  components/demanda/     Abas da ficha da demanda
supabase/migrations/      Banco: tabelas, regras de acesso (RLS), gatilhos e visões
supabase/functions/       Função de gestão de usuários (somente Gestor)
scripts/importar_planilha.py  Importação da planilha com relatório de correções
scripts/baixar_arquivos.mjs   Cópia de segurança dos arquivos
tests/                    Testes de permissão (banco) e de fluxos (navegador)
.github/workflows/        Verificação, publicação do banco e backup diário
```

## Desenvolvimento local

Requer Node 22, Docker e Python 3 com `openpyxl`.

```bash
npm ci
```

```bash
npx supabase start
```

```bash
npx supabase functions serve
```

```bash
cp .env.example .env.local
```

Preencha o `.env.local` com a URL `http://127.0.0.1:54321` e a chave *anon* mostrada pelo `supabase start`. Depois:

```bash
npm run dev
```

### Testes

```bash
npm test
```

Testes de permissão. Recriam o banco local, importam a planilha de `dados/planilha_origem.xlsx` e criam usuários de teste:

```bash
npm run test:integracao
```

Fluxos no navegador (com `npm run dev` rodando, logo após o teste de integração):

```bash
node tests/e2e/fluxos.mjs
```

### Importação

```bash
python3 -I scripts/importar_planilha.py caminho/planilha.xlsx dados
```

Gera `dados/importacao.sql` e `dados/relatorio_importacao.xlsx`. A pasta `dados/` não vai para o repositório porque contém dados da empresa.
