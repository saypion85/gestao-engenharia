-- =====================================================================
-- Medição: aprovação obrigatória do Gestor, com registro de quem elaborou e quem aprovou
-- Fluxo: em_elaboracao → aguardando_aprovacao (envio) → aprovada (somente Gestor) → paga
--        o Gestor pode devolver para ajuste (volta para em_elaboracao com motivo)
-- =====================================================================

alter table medicoes drop constraint if exists medicoes_status_check;
alter table medicoes add constraint medicoes_status_check
  check (status in ('em_elaboracao', 'aguardando_aprovacao', 'aprovada', 'paga', 'cancelada'));

alter table medicoes add column elaborada_por uuid references perfis (id);
alter table medicoes add column elaborada_por_nome text;
alter table medicoes add column elaborada_por_email text;
alter table medicoes add column enviada_em timestamptz;
alter table medicoes add column aprovada_por uuid references perfis (id);
alter table medicoes add column aprovada_por_email text;
alter table medicoes add column devolucao_motivo text;
alter table medicoes add column devolvida_por_nome text;
alter table medicoes add column devolvida_em timestamptz;

create or replace function trg_medicao_regras() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_nome text := (select nome from perfis where id = auth.uid());
  v_email text := (select email from perfis where id = auth.uid());
  v_total numeric; v_medido numeric;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'em_elaboracao' then new.status := 'em_elaboracao'; end if;
  end if;

  if tg_op = 'UPDATE' then
    -- conteúdo só muda em elaboração
    if old.status <> 'em_elaboracao' and (
         new.periodo_inicio is distinct from old.periodo_inicio or new.periodo_fim is distinct from old.periodo_fim
      or new.valor_informado is distinct from old.valor_informado or new.oc_id is distinct from old.oc_id
      or new.numero is distinct from old.numero or new.descricao is distinct from old.descricao) then
      raise exception 'Medição enviada ou aprovada: o conteúdo não pode ser alterado. Volte para "em elaboração" se precisar corrigir.';
    end if;

    if new.status is distinct from old.status then
      -- transições permitidas
      if not (
           (old.status = 'em_elaboracao'        and new.status in ('aguardando_aprovacao', 'cancelada'))
        or (old.status = 'aguardando_aprovacao' and new.status in ('aprovada', 'em_elaboracao', 'cancelada'))
        or (old.status = 'aprovada'             and new.status in ('paga', 'em_elaboracao', 'cancelada'))
        or (old.status = 'paga'                 and new.status = 'aprovada')
        or (old.status = 'cancelada'            and new.status = 'em_elaboracao')
      ) then
        raise exception 'Mudança de situação não permitida (% → %).', old.status, new.status;
      end if;

      if new.status = 'aguardando_aprovacao' then
        new.elaborada_por := v_uid; new.elaborada_por_nome := v_nome; new.elaborada_por_email := v_email;
        new.enviada_em := now();
        new.devolucao_motivo := null; new.devolvida_por_nome := null; new.devolvida_em := null;
      end if;

      if new.status = 'aprovada' and old.status = 'aguardando_aprovacao' then
        if not public.e_gestor() then raise exception 'Somente o Gestor pode aprovar a medição.'; end if;
        new.aprovada_por := v_uid; new.aprovada_por_nome := v_nome; new.aprovada_por_email := v_email; new.aprovada_em := now();
      end if;

      if new.status = 'em_elaboracao' and old.status = 'aguardando_aprovacao' then
        -- devolução pelo Gestor (com motivo) ou retirada por quem enviou
        if public.e_gestor() and v_uid is distinct from old.elaborada_por then
          if coalesce(trim(new.devolucao_motivo), '') = '' then raise exception 'Informe o motivo da devolução.'; end if;
          new.devolvida_por_nome := v_nome; new.devolvida_em := now();
        elsif v_uid is distinct from old.elaborada_por then
          raise exception 'Só quem enviou a medição ou o Gestor pode tirá-la da aprovação.';
        end if;
      end if;

      if new.status = 'em_elaboracao' and old.status in ('aprovada', 'cancelada') then
        if old.status = 'aprovada' and not public.e_gestor() then raise exception 'Somente o Gestor pode reabrir uma medição aprovada.'; end if;
      end if;

      if new.status = 'em_elaboracao' then
        new.aprovada_por := null; new.aprovada_por_nome := null; new.aprovada_por_email := null; new.aprovada_em := null;
        new.pagamento_por_nome := null; new.data_pagamento := null;
      end if;

      if new.status = 'paga' then
        if new.data_pagamento is null then new.data_pagamento := current_date; end if;
        new.pagamento_por_nome := v_nome;
      end if;
      if new.status = 'aprovada' and old.status = 'paga' then
        if not public.e_gestor() then raise exception 'Somente o Gestor pode desfazer o pagamento.'; end if;
        new.pagamento_por_nome := null; new.data_pagamento := null;
      end if;

      -- reativar uma medição cancelada não pode estourar o contratado de nenhum item
      if old.status = 'cancelada' and exists (
        select 1 from medicao_itens mi join oc_itens oi on oi.id = mi.oc_item_id
        where mi.medicao_id = new.id and (
          select coalesce(sum(x.quantidade), 0) from medicao_itens x join medicoes mm on mm.id = x.medicao_id
          where x.oc_item_id = mi.oc_item_id and mm.status <> 'cancelada' and mm.id <> new.id) + mi.quantidade > oi.quantidade + 0.0005) then
        raise exception 'Não é possível reativar: algum item passaria a quantidade contratada.';
      end if;
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

-- v_medicoes / v_ordens_compra usam m.*: recriar para incluir as colunas novas
drop view if exists v_medicoes;
create view v_medicoes with (security_invoker = true) as
select m.*, public.valor_medicao(m.id) as valor, o.demanda_id, o.numero as oc_numero
from medicoes m join ordens_compra o on o.id = m.oc_id;
grant select on v_medicoes to authenticated;
