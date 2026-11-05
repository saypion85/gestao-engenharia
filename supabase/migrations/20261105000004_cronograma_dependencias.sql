-- =====================================================================
-- Cronograma: duração, predecessoras (término → início com folga) e calendário (corridos/úteis)
-- =====================================================================

alter table cronograma add column duracao_dias int check (duracao_dias is null or duracao_dias between 1 and 3650);

-- Calendário do cronograma por demanda (sem linha = dias corridos)
create table cronograma_config (
  demanda_id  bigint primary key references demandas (id) on delete cascade,
  dias_uteis  boolean not null default false,   -- true = não conta sábados e domingos
  atualizado_em timestamptz not null default now()
);
alter table cronograma_config enable row level security;
create policy crono_cfg_ler on cronograma_config for select to authenticated using (public.pode_ver_demanda(demanda_id));
create policy crono_cfg_editar on cronograma_config for all to authenticated
  using (public.pode_editar()) with check (public.pode_editar());
grant select, insert, update, delete on cronograma_config to authenticated;

-- Predecessoras: o item só começa depois do término da predecessora (+ folga em dias)
create table cronograma_dependencias (
  item_id         bigint not null references cronograma (id) on delete cascade,
  predecessora_id bigint not null references cronograma (id) on delete cascade,
  folga_dias      int not null default 0 check (folga_dias between -365 and 365),
  primary key (item_id, predecessora_id),
  constraint dep_nao_propria check (item_id <> predecessora_id)
);
create index on cronograma_dependencias (predecessora_id);

-- Mesma demanda e sem ciclos (A depende de B que depende de A)
create or replace function trg_dependencia_valida() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  d1 bigint; d2 bigint; ciclo boolean;
begin
  select demanda_id into d1 from cronograma where id = new.item_id;
  select demanda_id into d2 from cronograma where id = new.predecessora_id;
  if d1 is distinct from d2 then
    raise exception 'A predecessora precisa ser da mesma demanda.';
  end if;
  with recursive cadeia(id) as (
    select predecessora_id from cronograma_dependencias where item_id = new.predecessora_id
    union
    select dep.predecessora_id from cronograma_dependencias dep join cadeia c on dep.item_id = c.id
  )
  select exists (select 1 from cadeia where id = new.item_id) or new.predecessora_id = new.item_id into ciclo;
  if ciclo then
    raise exception 'Dependência circular: este item já é predecessor (direto ou indireto) da etapa escolhida.';
  end if;
  return new;
end $$;
create trigger dependencia_valida before insert or update on cronograma_dependencias
  for each row execute function trg_dependencia_valida();

alter table cronograma_dependencias enable row level security;
create policy dep_ler on cronograma_dependencias for select to authenticated
  using (exists (select 1 from cronograma c where c.id = item_id and public.pode_ver_demanda(c.demanda_id)));
create policy dep_editar on cronograma_dependencias for all to authenticated
  using (public.pode_editar()) with check (public.pode_editar());
grant select, insert, update, delete on cronograma_dependencias to authenticated;
