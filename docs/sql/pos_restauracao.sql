-- Rodar DEPOIS de restaurar um backup (schema.sql + dados.sql).
-- Reajusta todos os contadores (sequências) para o maior id existente,
-- evitando erros de "chave duplicada" no login e nos novos cadastros.
do $$
declare r record; v bigint;
begin
  for r in
    select s.relname as seq, n.nspname as esquema, t.relname as tabela, a.attname as coluna
    from pg_class s
    join pg_namespace n on n.oid = s.relnamespace
    join pg_depend d on d.objid = s.oid and d.deptype in ('a', 'i')
    join pg_class t on t.oid = d.refobjid
    join pg_attribute a on a.attrelid = t.oid and a.attnum = d.refobjsubid
    where s.relkind = 'S' and n.nspname in ('public', 'auth', 'storage')
  loop
    execute format('select max(%I) from %I.%I', r.coluna, r.esquema, r.tabela) into v;
    if v is not null then
      perform setval(format('%I.%I', r.esquema, r.seq), v);
    end if;
  end loop;
end $$;
