-- =====================================================================
-- Comentários da demanda e cronograma (previsto × realizado)
-- =====================================================================

-- ---------- Comentários ----------
create table comentarios (
  id                bigint generated always as identity primary key,
  demanda_id        bigint not null references demandas (id) on delete cascade,
  texto             text not null check (length(trim(texto)) > 0),
  importante        boolean not null default false,
  autor_id          uuid references perfis (id) default auth.uid(),
  autor_nome        text,
  criado_em         timestamptz not null default now(),
  editado_em        timestamptz,
  editado_por_nome  text
);
create index on comentarios (demanda_id, criado_em desc);

-- Autor e data vêm do sistema (não podem ser informados nem alterados por quem grava)
create or replace function trg_comentario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.autor_id := auth.uid();
    new.autor_nome := (select nome from perfis where id = auth.uid());
    new.criado_em := now();
    new.editado_em := null;
    new.editado_por_nome := null;
    return new;
  end if;
  if new.autor_id is distinct from old.autor_id or new.demanda_id is distinct from old.demanda_id
     or new.criado_em is distinct from old.criado_em or new.autor_nome is distinct from old.autor_nome then
    raise exception 'Autor, demanda e data do comentário não podem ser alterados.';
  end if;
  if new.texto is distinct from old.texto or new.importante is distinct from old.importante then
    new.editado_em := now();
    new.editado_por_nome := (select nome from perfis where id = auth.uid());
  end if;
  return new;
end $$;
create trigger comentario_regras before insert or update on comentarios
  for each row execute function trg_comentario();

alter table comentarios enable row level security;
create policy coment_ler on comentarios for select to authenticated using (public.e_interno());
create policy coment_inserir on comentarios for insert to authenticated with check (public.pode_editar());
create policy coment_alterar on comentarios for update to authenticated
  using (public.e_gestor() or (autor_id = auth.uid() and public.pode_editar()))
  with check (public.e_gestor() or (autor_id = auth.uid() and public.pode_editar()));
create policy coment_excluir on comentarios for delete to authenticated
  using (public.e_gestor() or (autor_id = auth.uid() and public.pode_editar()));
grant select, insert, update, delete on comentarios to authenticated;

-- ---------- Cronograma ----------
create table cronograma (
  id               bigint generated always as identity primary key,
  demanda_id       bigint not null references demandas (id) on delete cascade,
  etapa            etapa_demanda,          -- etapa do fluxo (null = item personalizado)
  nome             text not null,
  ordem            int not null default 0,
  inicio_previsto  date,
  fim_previsto     date,
  inicio_real      date,
  fim_real         date,
  observacao       text,
  atualizado_em    timestamptz not null default now(),
  constraint previsto_coerente check (inicio_previsto is null or fim_previsto is null or fim_previsto >= inicio_previsto),
  constraint real_coerente check (inicio_real is null or fim_real is null or fim_real >= inicio_real)
);
create index on cronograma (demanda_id, ordem);
create unique index cronograma_etapa_unica on cronograma (demanda_id, etapa) where etapa is not null;

create or replace function trg_cronograma_ts() returns trigger language plpgsql as $$
begin new.atualizado_em := now(); return new; end $$;
create trigger cronograma_ts before update on cronograma for each row execute function trg_cronograma_ts();

alter table cronograma enable row level security;
create policy crono_ler on cronograma for select to authenticated using (public.pode_ver_demanda(demanda_id));
create policy crono_editar on cronograma for all to authenticated
  using (public.pode_editar()) with check (public.pode_editar());
grant select, insert, update, delete on cronograma to authenticated;

-- Realizado automático: ao mudar a etapa da demanda, fecha a etapa anterior e abre a nova (se ainda vazias)
create or replace function trg_cronograma_realizado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.etapa is distinct from old.etapa then
    update cronograma set fim_real = greatest(current_date, coalesce(inicio_real, current_date))
     where demanda_id = new.id and etapa = old.etapa and fim_real is null;
    update cronograma set inicio_real = current_date
     where demanda_id = new.id and etapa = new.etapa and inicio_real is null;
  end if;
  if new.situacao = 'concluida' and old.situacao is distinct from 'concluida' then
    update cronograma set fim_real = greatest(coalesce(new.concluida_em, current_date), inicio_real)
     where demanda_id = new.id and inicio_real is not null and fim_real is null;
  end if;
  return new;
end $$;
create trigger cronograma_realizado after update of etapa, situacao on demandas
  for each row execute function trg_cronograma_realizado();
