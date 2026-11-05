#!/usr/bin/env bash
# Recria o banco LOCAL do zero, importa a planilha, cria usuários de teste e roda os testes de permissão.
# Requer: supabase start e supabase functions serve rodando; planilha em dados/planilha_origem.xlsx
set -euo pipefail
cd "$(dirname "$0")/.."
npx supabase db reset >/dev/null 2>&1
python3 -I scripts/importar_planilha.py dados/planilha_origem.xlsx dados >/dev/null
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -q -v ON_ERROR_STOP=1 -f dados/importacao.sql >/dev/null
node scripts/usuarios_teste.mjs >/dev/null
node --test tests/permissoes.test.mjs
