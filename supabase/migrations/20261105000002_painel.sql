-- =====================================================================
-- Painel gerencial v2: pontos de ação ajustáveis pelo Gestor e novos campos na visão
-- =====================================================================

-- Pontos de ação: ajustes do Gestor sobre os pontos automáticos (id = regra) e pontos manuais
create table painel_pontos (
  id                   text primary key,
  manual               boolean not null default false,
  titulo               text,
  diagnostico          text,
  acao                 text,
  nota                 text,
  critico              boolean not null default false,
  oculto               boolean not null default false,
  atualizado_por_nome  text,
  atualizado_em        timestamptz not null default now()
);
alter table painel_pontos enable row level security;
create policy pontos_ler on painel_pontos for select to authenticated using (public.e_interno());
create policy pontos_gestor on painel_pontos for all to authenticated
  using (public.e_gestor()) with check (public.e_gestor());
grant select, insert, update, delete on painel_pontos to authenticated;

create or replace function trg_pontos_autor() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.atualizado_em := now();
  new.atualizado_por_nome := (select nome from perfis where id = auth.uid());
  return new;
end $$;
create trigger pontos_autor before insert or update on painel_pontos
  for each row execute function trg_pontos_autor();

-- Visão de demandas: + primeiro registro do histórico e quantidade de RMS válidas (não canceladas)
drop view if exists v_demandas;
create or replace view v_demandas with (security_invoker = true) as
with base as (
  select d.*,
    case when d.probabilidade is not null and d.severidade > 0
         then d.probabilidade * d.severidade end as pontuacao,
    l.nome as local_nome,
    p.nome as responsavel_nome,
    e.nome as empresa_nome,
    (select max(h.data) from historico h where h.demanda_id = d.id) as ultima_atualizacao,
    (select string_agg(r.numero, ' ') from rms r where r.demanda_id = d.id) as rms_numeros,
    (select min(h.data) from historico h where h.demanda_id = d.id) as primeira_atualizacao,
    (select count(*) from rms r where r.demanda_id = d.id and r.situacao <> 'cancelada')::int as rms_validas
  from demandas d
  left join locais l on l.id = d.local_id
  left join pessoas p on p.id = d.responsavel_id
  left join empresas e on e.id = d.empresa_id
), classe as (
  select b.*,
    case
      when b.pontuacao is null then null
      when b.severidade = 5 or (b.risco_queda_eletro and b.probabilidade >= 3) then 'critico'
      when b.pontuacao >= 15 then 'critico'
      when b.pontuacao >= 10 then 'alto'
      when b.pontuacao >= 5 then 'medio'
      else 'baixo' end as classe
  from base b
)
select c.*,
  case when c.situacao in ('concluida', 'cancelada') or c.pontuacao is null then null
       else row_number() over (
         partition by (c.situacao in ('concluida', 'cancelada') or c.pontuacao is null)
         order by
           case c.classe when 'critico' then 1 when 'alto' then 2 when 'medio' then 3 else 4 end,
           c.pontuacao desc,
           c.sev_pessoas desc nulls last,
           c.prazo_legal desc,
           c.efeito_cadeia desc,
           case c.esforco when 'baixo' then 1 when 'medio' then 2 when 'alto' then 3 else 4 end,
           c.recebida_em nulls last,
           c.id)
  end as ranking,
  (c.situacao not in ('concluida', 'cancelada') and c.prazo_conclusao < current_date) as atrasada,
  (current_date - coalesce(c.ultima_atualizacao, c.atualizado_em::date)) as dias_sem_atualizacao
from classe c;

grant select on v_demandas to authenticated;
