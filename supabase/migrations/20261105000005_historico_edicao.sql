-- =====================================================================
-- Histórico: edição pelo autor ou Gestor (com rastro) e incorporação dos comentários
-- =====================================================================

alter table historico add column editado_em timestamptz;
alter table historico add column editado_por_nome text;

-- Regras de alteração: autor, demanda e data de criação não mudam; registros automáticos não são editados;
-- toda edição registra quem editou e quando.
create or replace function trg_historico_edicao() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.autor_id is distinct from old.autor_id or new.demanda_id is distinct from old.demanda_id
     or new.criado_em is distinct from old.criado_em or new.autor_nome is distinct from old.autor_nome then
    raise exception 'Autor, demanda e data de registro não podem ser alterados.';
  end if;
  if old.tipo = 'sistema' or new.tipo = 'sistema' then
    raise exception 'Registros automáticos do histórico não podem ser editados.';
  end if;
  if new.texto is distinct from old.texto or new.data is distinct from old.data or new.tipo is distinct from old.tipo then
    new.editado_em := now();
    new.editado_por_nome := (select nome from perfis where id = auth.uid());
  end if;
  return new;
end $$;
create trigger historico_edicao before update on historico
  for each row execute function trg_historico_edicao();

-- Na inclusão, o autor é sempre quem está logado (não pode ser informado por quem grava)
create or replace function trg_historico_autor() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.autor_id := auth.uid();
    new.autor_nome := (select nome from perfis where id = auth.uid());
  elsif new.autor_nome is null then
    new.autor_nome := (select nome from perfis where id = new.autor_id);
  end if;
  new.editado_em := null;
  new.editado_por_nome := null;
  return new;
end $$;

-- Edição: autor (Engenheiro/Gestor) ou Gestor
drop policy if exists hist_alterar on historico;
create policy hist_alterar on historico for update to authenticated
  using (public.e_gestor() or (autor_id = auth.uid() and public.pode_editar()))
  with check (public.e_gestor() or (autor_id = auth.uid() and public.pode_editar()));

-- Os comentários (aba removida) passam a fazer parte do histórico, preservando autor e data.
-- A tabela "comentarios" é mantida sem uso; nada é apagado.
insert into historico (demanda_id, data, texto, tipo, autor_id, autor_nome, criado_em)
select c.demanda_id, (c.criado_em at time zone 'America/Sao_Paulo')::date, c.texto,
       case when c.importante then 'decisao'::tipo_historico else 'atualizacao'::tipo_historico end,
       c.autor_id, c.autor_nome, c.criado_em
from comentarios c;
