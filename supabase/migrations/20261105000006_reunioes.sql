-- =====================================================================
-- Reuniões: pauta por demanda, decisões (a tomar / tomadas), plano de ação e ata
-- =====================================================================

-- ---------- Reuniões ----------
create table reunioes (
  id                  bigint generated always as identity primary key,
  titulo              text not null default 'Reunião de acompanhamento',
  data                date not null default current_date,
  hora                time,
  local               text,
  participantes_ids   bigint[] not null default '{}',   -- pessoas da equipe
  convidados          text,                              -- outras pessoas (texto livre)
  objetivo            text,
  assuntos_gerais     text,                              -- anotações fora das demandas
  status              text not null default 'planejada' check (status in ('planejada', 'realizada')),
  ata                 jsonb,                             -- retrato da reunião no encerramento
  encerrada_em        timestamptz,
  encerrada_por_nome  text,
  criado_por          uuid references perfis (id) default auth.uid(),
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now()
);
create index on reunioes (data desc);

-- Pauta: demandas discutidas na reunião
create table reuniao_itens (
  id          bigint generated always as identity primary key,
  reuniao_id  bigint not null references reunioes (id) on delete cascade,
  demanda_id  bigint not null references demandas (id) on delete cascade,
  ordem       int not null default 0,
  motivos     text[] not null default '{}',   -- por que entrou na pauta (pontos de atenção)
  notas       text,                           -- o que foi discutido (vai para a ata e para o histórico)
  discutido   boolean not null default false,
  unique (reuniao_id, demanda_id)
);
create index on reuniao_itens (demanda_id);

-- Reunião realizada fica travada (só o Gestor reabre)
create or replace function trg_reuniao_trava() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.atualizado_em := now();
    if old.status = 'realizada' and not public.e_gestor() then
      raise exception 'Reunião já encerrada: só o Gestor pode reabrir.';
    end if;
  end if;
  return new;
end $$;
create trigger reuniao_trava before update on reunioes for each row execute function trg_reuniao_trava();

create or replace function trg_reuniao_item_trava() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  select status into v_status from reunioes where id = coalesce(new.reuniao_id, old.reuniao_id);
  if v_status = 'realizada' then
    raise exception 'Reunião já encerrada: a pauta não pode ser alterada.';
  end if;
  return coalesce(new, old);
end $$;
create trigger reuniao_item_trava before insert or update or delete on reuniao_itens
  for each row execute function trg_reuniao_item_trava();

alter table reunioes enable row level security;
alter table reuniao_itens enable row level security;
create policy reun_ler on reunioes for select to authenticated using (public.e_interno());
create policy reun_editar on reunioes for insert to authenticated with check (public.pode_editar());
create policy reun_alterar on reunioes for update to authenticated using (public.pode_editar()) with check (public.pode_editar());
create policy reun_excluir on reunioes for delete to authenticated using (public.e_gestor() or (status = 'planejada' and criado_por = auth.uid()));
create policy reun_itens_ler on reuniao_itens for select to authenticated using (public.e_interno());
create policy reun_itens_editar on reuniao_itens for all to authenticated using (public.pode_editar()) with check (public.pode_editar());
grant select, insert, update, delete on reunioes, reuniao_itens to authenticated;

-- ---------- Decisões: situação a tomar / tomada ----------
alter table historico add column decisao_status text check (decisao_status in ('pendente', 'tomada'));
alter table historico add column decisao_responsavel text;   -- quem decide
alter table historico add column decisao_prazo date;         -- até quando decidir
alter table historico add column decisao_resultado text;     -- o que foi decidido
alter table historico add column decidida_em date;
alter table historico add column decidida_por_nome text;
alter table historico add column reuniao_id bigint references reunioes (id) on delete set null;
create index on historico (decisao_status) where tipo = 'decisao';

-- decisões já registradas eram fatos consumados
update historico set decisao_status = 'tomada', decidida_em = data where tipo = 'decisao';

-- coerência: decisão sempre tem situação; outros tipos nunca
create or replace function trg_historico_decisao() returns trigger language plpgsql as $$
begin
  if new.tipo = 'decisao' then
    new.decisao_status := coalesce(new.decisao_status, 'tomada');
    if new.decisao_status = 'tomada' and new.decidida_em is null then new.decidida_em := new.data; end if;
  else
    new.decisao_status := null; new.decisao_responsavel := null; new.decisao_prazo := null;
    new.decisao_resultado := null; new.decidida_em := null; new.decidida_por_nome := null;
  end if;
  return new;
end $$;
create trigger historico_decisao before insert or update on historico
  for each row execute function trg_historico_decisao();

-- Registrar que uma decisão pendente foi tomada (qualquer Engenheiro/Gestor, inclusive em reunião)
create or replace function public.resolver_decisao(p_id bigint, p_resultado text, p_reuniao bigint default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.pode_editar() then raise exception 'Sem permissão para registrar decisões.'; end if;
  if coalesce(trim(p_resultado), '') = '' then raise exception 'Informe o que foi decidido.'; end if;
  update historico
     set decisao_status = 'tomada', decisao_resultado = trim(p_resultado), decidida_em = current_date,
         decidida_por_nome = (select nome from perfis where id = auth.uid()),
         reuniao_id = coalesce(p_reuniao, reuniao_id)
   where id = p_id and tipo = 'decisao' and decisao_status = 'pendente';
  if not found then raise exception 'Decisão não encontrada ou já tomada.'; end if;
end $$;
grant execute on function public.resolver_decisao(bigint, text, bigint) to authenticated;

-- ---------- Plano de ação = atividades do tipo "ação", vinculadas à reunião ----------
alter type tipo_item add value if not exists 'acao';
alter table atividades add column reuniao_id bigint references reunioes (id) on delete set null;
alter table atividades alter column demanda_id drop not null;
alter table atividades add constraint atividade_tem_vinculo check (demanda_id is not null or reuniao_id is not null);
create index on atividades (reuniao_id);

-- ações de assuntos gerais (sem demanda) são visíveis à equipe interna
drop policy if exists ativ_ler on atividades;
create policy ativ_ler on atividades for select to authenticated
  using ((demanda_id is not null and public.pode_ver_demanda(demanda_id)) or (demanda_id is null and public.e_interno()));

-- ---------- Encerrar a reunião (atômico) ----------
-- Grava o retrato da ata, leva as anotações de cada demanda para o histórico dela e trava a reunião.
create or replace function public.encerrar_reuniao(p_id bigint, p_ata jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare r record; v_data date; v_nome text;
begin
  if not public.pode_editar() then raise exception 'Sem permissão para encerrar a reunião.'; end if;
  select data into v_data from reunioes where id = p_id and status = 'planejada';
  if not found then raise exception 'Reunião não encontrada ou já encerrada.'; end if;
  v_nome := (select nome from perfis where id = auth.uid());
  -- se a reunião foi reaberta e é encerrada de novo, substitui as anotações levadas antes (sem duplicar)
  delete from historico where reuniao_id = p_id and tipo = 'atualizacao' and texto like 'Reunião de %';
  for r in select demanda_id, notas from reuniao_itens where reuniao_id = p_id and coalesce(trim(notas), '') <> '' loop
    insert into historico (demanda_id, data, texto, tipo, reuniao_id)
    values (r.demanda_id, v_data, 'Reunião de ' || to_char(v_data, 'DD/MM/YYYY') || ': ' || trim(r.notas), 'atualizacao', p_id);
  end loop;
  update reunioes set status = 'realizada', ata = p_ata, encerrada_em = now(), encerrada_por_nome = v_nome where id = p_id;
end $$;
grant execute on function public.encerrar_reuniao(bigint, jsonb) to authenticated;

-- Reabrir (somente Gestor): volta para "planejada" e descarta o retrato da ata
create or replace function public.reabrir_reuniao(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.e_gestor() then raise exception 'Só o Gestor pode reabrir a reunião.'; end if;
  update reunioes set status = 'planejada', ata = null, encerrada_em = null, encerrada_por_nome = null where id = p_id;
end $$;
grant execute on function public.reabrir_reuniao(bigint) to authenticated;
