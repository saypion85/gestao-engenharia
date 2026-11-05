-- =====================================================================
-- Medição financeira (Ordem de Compra → medições → pagamento) e ajustes no RDO
-- Valores visíveis apenas para Gestor e Engenheiro.
-- =====================================================================

-- ---------- RDO: AST ----------
alter table rdos add column ast_realizada boolean;

-- ---------- Ordem de Compra ----------
create table ordens_compra (
  id            bigint generated always as identity primary key,
  demanda_id    bigint not null references demandas (id) on delete cascade,
  numero        text not null,
  empresa_id    bigint references empresas (id),
  fornecedor    text,                                   -- quando o fornecedor não está no cadastro de empresas
  data_emissao  date,
  valor_total   numeric(14, 2) not null default 0 check (valor_total >= 0),
  objeto        text,
  situacao      text not null default 'vigente' check (situacao in ('vigente', 'encerrada', 'cancelada')),
  criado_por    uuid references perfis (id) default auth.uid(),
  criado_em     timestamptz not null default now(),
  unique (demanda_id, numero)
);
create index on ordens_compra (demanda_id);

-- Planilha da OC (opcional): sem itens, a medição é feita por valor
create table oc_itens (
  id              bigint generated always as identity primary key,
  oc_id           bigint not null references ordens_compra (id) on delete cascade,
  ordem           int not null default 0,
  descricao       text not null,
  unidade         text,
  quantidade      numeric(14, 3) not null check (quantidade > 0),
  valor_unitario  numeric(14, 2) not null check (valor_unitario >= 0),
  valor_total     numeric(16, 2) generated always as (round(quantidade * valor_unitario, 2)) stored
);
create index on oc_itens (oc_id);

-- ---------- Medições ----------
create table medicoes (
  id                  bigint generated always as identity primary key,
  oc_id               bigint not null references ordens_compra (id) on delete cascade,
  numero              int not null,
  periodo_inicio      date,
  periodo_fim         date,
  data_medicao        date not null default current_date,
  descricao           text,                                   -- entregas realizadas no período
  valor_informado     numeric(14, 2) check (valor_informado is null or valor_informado >= 0),  -- usado quando a OC não tem itens
  status              text not null default 'em_elaboracao' check (status in ('em_elaboracao', 'aprovada', 'paga', 'cancelada')),
  nota_fiscal         text,
  data_pagamento      date,
  observacao          text,
  aprovada_por_nome   text,
  aprovada_em         timestamptz,
  pagamento_por_nome  text,
  criado_por          uuid references perfis (id) default auth.uid(),
  criado_em           timestamptz not null default now(),
  unique (oc_id, numero),
  constraint periodo_coerente check (periodo_inicio is null or periodo_fim is null or periodo_fim >= periodo_inicio)
);
create index on medicoes (oc_id);

create table medicao_itens (
  medicao_id  bigint not null references medicoes (id) on delete cascade,
  oc_item_id  bigint not null references oc_itens (id) on delete restrict,
  quantidade  numeric(14, 3) not null check (quantidade >= 0),
  primary key (medicao_id, oc_item_id)
);

-- Documentos ligados a uma medição (NF, boletim assinado)
alter table documentos add column medicao_id bigint references medicoes (id) on delete set null;

-- ---------- Regras ----------
-- Número sequencial por OC
create or replace function trg_medicao_numero() returns trigger language plpgsql as $$
begin
  if new.numero is null then
    new.numero := coalesce((select max(numero) from medicoes where oc_id = new.oc_id), 0) + 1;
  end if;
  return new;
end $$;
create trigger medicao_numero before insert on medicoes for each row execute function trg_medicao_numero();

-- Valor de uma medição: soma dos itens medidos, ou o valor informado quando a OC não tem itens
create or replace function public.valor_medicao(p_id bigint) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select sum(round(mi.quantidade * oi.valor_unitario, 2)) from medicao_itens mi join oc_itens oi on oi.id = mi.oc_item_id where mi.medicao_id = p_id),
    (select valor_informado from medicoes where id = p_id), 0)
$$;

-- Status: aprovar e pagar registram quem/quando; medição aprovada ou paga não muda conteúdo;
-- valor medido acumulado não pode passar o valor da OC
create or replace function trg_medicao_regras() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_nome text := (select nome from perfis where id = auth.uid()); v_total numeric; v_medido numeric;
begin
  if tg_op = 'UPDATE' then
    if old.status in ('aprovada', 'paga') and (
         new.periodo_inicio is distinct from old.periodo_inicio or new.periodo_fim is distinct from old.periodo_fim
      or new.valor_informado is distinct from old.valor_informado or new.oc_id is distinct from old.oc_id or new.numero is distinct from old.numero) then
      raise exception 'Medição já aprovada: o conteúdo não pode ser alterado. Volte para "em elaboração" se precisar corrigir.';
    end if;
    if new.status = 'aprovada' and old.status is distinct from 'aprovada' then
      new.aprovada_por_nome := v_nome; new.aprovada_em := now();
    end if;
    if new.status = 'paga' and old.status is distinct from 'paga' then
      if new.data_pagamento is null then new.data_pagamento := current_date; end if;
      new.pagamento_por_nome := v_nome;
    end if;
    -- reativar uma medição cancelada não pode estourar o contratado de nenhum item
    if old.status = 'cancelada' and new.status <> 'cancelada' and exists (
      select 1 from medicao_itens mi join oc_itens oi on oi.id = mi.oc_item_id
      where mi.medicao_id = new.id and (
        select coalesce(sum(x.quantidade), 0) from medicao_itens x join medicoes mm on mm.id = x.medicao_id
        where x.oc_item_id = mi.oc_item_id and mm.status <> 'cancelada' and mm.id <> new.id) + mi.quantidade > oi.quantidade + 0.0005) then
      raise exception 'Não é possível reativar: algum item passaria a quantidade contratada.';
    end if;
    if new.status = 'em_elaboracao' then
      new.aprovada_por_nome := null; new.aprovada_em := null; new.pagamento_por_nome := null; new.data_pagamento := null;
    end if;
  end if;
  if new.status <> 'cancelada' and new.valor_informado is not null then
    select valor_total into v_total from ordens_compra where id = new.oc_id;
    select coalesce(sum(public.valor_medicao(m.id)), 0) into v_medido from medicoes m
      where m.oc_id = new.oc_id and m.status <> 'cancelada' and m.id is distinct from new.id;
    if v_medido + new.valor_informado > v_total + 0.005 then
      raise exception 'O valor medido acumulado (R$ %) passaria o valor da OC (R$ %).', to_char(v_medido + new.valor_informado, 'FM999G999G990D00'), to_char(v_total, 'FM999G999G990D00');
    end if;
  end if;
  return new;
end $$;
create trigger medicao_regras before insert or update on medicoes for each row execute function trg_medicao_regras();

-- Itens medidos: só em medição em elaboração; quantidade acumulada não passa a contratada
create or replace function trg_medicao_item_regras() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_status text; v_contratada numeric; v_acum numeric; v_desc text; v_med bigint := coalesce(new.medicao_id, old.medicao_id);
begin
  select status into v_status from medicoes where id = v_med;
  if v_status <> 'em_elaboracao' then
    raise exception 'Só é possível alterar itens de uma medição em elaboração.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  select quantidade, descricao into v_contratada, v_desc from oc_itens where id = new.oc_item_id;
  select coalesce(sum(mi.quantidade), 0) into v_acum from medicao_itens mi join medicoes m on m.id = mi.medicao_id
    where mi.oc_item_id = new.oc_item_id and m.status <> 'cancelada' and mi.medicao_id <> new.medicao_id;
  if v_acum + new.quantidade > v_contratada + 0.0005 then
    raise exception 'Item "%": quantidade acumulada (%) passaria a contratada (%).', v_desc, v_acum + new.quantidade, v_contratada;
  end if;
  return new;
end $$;
create trigger medicao_item_regras before insert or update or delete on medicao_itens for each row execute function trg_medicao_item_regras();

-- Com planilha de itens, o valor da OC é a soma dos itens
create or replace function trg_oc_total() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_oc bigint := coalesce(new.oc_id, old.oc_id);
begin
  update ordens_compra set valor_total = coalesce((select sum(valor_total) from oc_itens where oc_id = v_oc), 0) where id = v_oc;
  return null;
end $$;
create trigger oc_total after insert or update or delete on oc_itens for each row execute function trg_oc_total();

-- ---------- Visões de resumo ----------
create or replace view v_medicoes with (security_invoker = true) as
select m.*, public.valor_medicao(m.id) as valor, o.demanda_id, o.numero as oc_numero
from medicoes m join ordens_compra o on o.id = m.oc_id;

create or replace view v_ordens_compra with (security_invoker = true) as
select o.*,
  coalesce(e.nome, o.fornecedor) as fornecedor_nome,
  (select count(*) from oc_itens i where i.oc_id = o.id)::int as qtd_itens,
  coalesce((select sum(public.valor_medicao(m.id)) from medicoes m where m.oc_id = o.id and m.status <> 'cancelada'), 0) as medido,
  coalesce((select sum(public.valor_medicao(m.id)) from medicoes m where m.oc_id = o.id and m.status in ('aprovada', 'paga')), 0) as aprovado,
  coalesce((select sum(public.valor_medicao(m.id)) from medicoes m where m.oc_id = o.id and m.status = 'paga'), 0) as pago
from ordens_compra o left join empresas e on e.id = o.empresa_id;

-- ---------- Permissões: só Gestor e Engenheiro ----------
alter table ordens_compra enable row level security;
alter table oc_itens enable row level security;
alter table medicoes enable row level security;
alter table medicao_itens enable row level security;
create policy oc_valores on ordens_compra for all to authenticated using (public.pode_editar()) with check (public.pode_editar());
create policy oci_valores on oc_itens for all to authenticated using (public.pode_editar()) with check (public.pode_editar());
create policy med_valores on medicoes for all to authenticated using (public.pode_editar()) with check (public.pode_editar());
create policy medi_valores on medicao_itens for all to authenticated using (public.pode_editar()) with check (public.pode_editar());
grant select, insert, update, delete on ordens_compra, oc_itens, medicoes, medicao_itens to authenticated;
grant select on v_medicoes, v_ordens_compra to authenticated;
grant execute on function public.valor_medicao(bigint) to authenticated;

-- documentos de medição: só quem vê valores
drop policy if exists doc_ler on documentos;
create policy doc_ler on documentos for select to authenticated using (
  (medicao_id is null or public.pode_editar())
  and (
    public.e_interno()
    or (public.meu_papel() = 'contratada' and public.pode_ver_demanda(demanda_id)
        and (visivel_contratada or empresa_envio = public.minha_empresa()))
  ));
