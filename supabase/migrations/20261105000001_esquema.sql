-- =====================================================================
-- Gestão de Demandas de Engenharia — esquema principal
-- Regras de negócio validadas com o Gestor em 05/11/2026.
-- =====================================================================

-- ---------- Tipos ----------
create type papel_usuario as enum ('gestor', 'engenheiro', 'consulta', 'contratada');

create type situacao_demanda as enum (
  'nao_iniciada', 'em_andamento', 'aguardando', 'suspensa', 'cancelada', 'concluida'
);

-- Etapas do fluxo. Execução contratada passa por todas; execução interna
-- passa só por: recebida, estudo_projeto, aprovacao, execucao, encerramento, concluida.
create type etapa_demanda as enum (
  'recebida', 'estudo_projeto', 'memorial_descritivo', 'rms_suprimentos',
  'aprovacao', 'ordem_servico', 'execucao', 'encerramento', 'concluida'
);

create type forma_execucao as enum ('interna', 'contratada');

create type situacao_md as enum ('nao_necessario', 'a_elaborar', 'em_elaboracao', 'em_validacao', 'emitido');

create type situacao_rms as enum ('aberta', 'em_cotacao', 'aprovada', 'atendida', 'cancelada');

create type categoria_risco as enum ('SEG', 'EST', 'ELE', 'OPE', 'LEG', 'AMB', 'FIN', 'REC', 'PAT');

create type esforco_nivel as enum ('baixo', 'medio', 'alto');

create type tipo_item as enum ('atividade', 'pendencia', 'entrega');

create type situacao_item as enum ('a_fazer', 'em_andamento', 'concluida', 'cancelada');

create type tipo_historico as enum ('atualizacao', 'decisao', 'sistema');

create type categoria_documento as enum (
  'projeto', 'memorial', 'rdo', 'foto', 'relatorio', 'contrato', 'nota_fiscal', 'orcamento', 'outro'
);

create type status_rdo as enum ('rascunho', 'enviado', 'revisado_ok', 'revisado_ressalvas');

create type origem_rdo as enum ('equipe', 'contratada');

-- ---------- Cadastros de apoio ----------
create table empresas (
  id          bigint generated always as identity primary key,
  nome        text not null unique,
  cnpj        text,
  contato     text,
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);

create table locais (
  id    bigint generated always as identity primary key,
  nome  text not null unique,
  ativo boolean not null default true
);

-- Perfil de quem faz login (1:1 com auth.users)
create table perfis (
  id          uuid primary key references auth.users (id) on delete cascade,
  nome        text not null,
  email       text not null,
  papel       papel_usuario not null default 'consulta',
  empresa_id  bigint references empresas (id),
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now(),
  constraint contratada_tem_empresa check (papel <> 'contratada' or empresa_id is not null)
);

-- Pessoas da equipe que podem ser responsáveis (podem ou não ter login)
create table pessoas (
  id         bigint generated always as identity primary key,
  nome       text not null unique,
  email      text,
  perfil_id  uuid unique references perfis (id) on delete set null,
  ativo      boolean not null default true
);

-- ---------- Demandas ----------
create table demandas (
  id                    bigint generated always as identity primary key,
  codigo                text unique,
  assunto               text not null,
  descricao             text,
  local_id              bigint references locais (id),
  responsavel_id        bigint references pessoas (id),
  solicitante           text,
  recebida_em           date,
  acomp_gerencial       boolean not null default false,
  forma_execucao        forma_execucao not null default 'contratada',
  empresa_id            bigint references empresas (id),
  situacao              situacao_demanda not null default 'nao_iniciada',
  aguardando_o_que      text,
  etapa                 etapa_demanda not null default 'recebida',
  detalhamento          text,
  status_projeto        text,          -- ex.: Estudo preliminar, Layout enviado (vem da planilha)
  prazo_proxima_etapa   date,
  prazo_conclusao       date,
  inicio                date,
  fim                   date,
  concluida_em          date,
  -- MD: um por demanda, revisões em memoriais_revisoes
  md_situacao           situacao_md,
  md_codigo             text,          -- código base sem a revisão
  -- OS: uma por demanda
  os_numero             text,
  -- Avaliação de prioridade (modelo da planilha Prioridade.xlsx)
  categoria_principal   categoria_risco,
  categoria_secundaria  categoria_risco,
  probabilidade         smallint check (probabilidade between 1 and 5),
  sev_pessoas           smallint check (sev_pessoas between 1 and 5),
  sev_operacao          smallint check (sev_operacao between 1 and 5),
  sev_financeiro        smallint check (sev_financeiro between 1 and 5),
  sev_legal             smallint check (sev_legal between 1 and 5),
  risco_queda_eletro    boolean not null default false,
  prazo_legal           boolean not null default false,
  efeito_cadeia         boolean not null default false,
  esforco               esforco_nivel,
  prioridade_legada     text,          -- valor da coluna Prioridade da planilha (referência)
  -- Severidade = maior impacto entre as 4 colunas
  severidade smallint generated always as (
    greatest(coalesce(sev_pessoas, 0), coalesce(sev_operacao, 0),
             coalesce(sev_financeiro, 0), coalesce(sev_legal, 0))
  ) stored,
  importado_linha       int,           -- linha de origem na planilha
  criado_por            uuid references perfis (id) default auth.uid(),
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now()
);

create index on demandas (situacao);
create index on demandas (responsavel_id);
create index on demandas (empresa_id);

-- Custos: tabela separada, visível só para o Gestor
create table demanda_custos (
  demanda_id             bigint primary key references demandas (id) on delete cascade,
  orcado_externo         numeric(14, 2),  -- quanto custaria com mão de obra externa (referência)
  custo_terceirizados    numeric(14, 2),  -- realizado com terceiros
  custo_execucao_propria numeric(14, 2),  -- materiais/serviços quando a execução é própria
  custo_mo_propria       numeric(14, 2),  -- custo da mão de obra própria
  descricao_custo        text,
  efetivo_descricao      text,
  observacao             text,
  atualizado_em          timestamptz not null default now()
);

-- Revisões do Memorial Descritivo
create table memoriais_revisoes (
  id          bigint generated always as identity primary key,
  demanda_id  bigint not null references demandas (id) on delete cascade,
  codigo      text not null,          -- código completo, ex.: MD-INF-043-2025-001
  revisao     int not null default 0,
  data        date,
  observacao  text,
  criado_em   timestamptz not null default now(),
  unique (demanda_id, revisao)
);

-- RMS: várias por demanda
create table rms (
  id          bigint generated always as identity primary key,
  demanda_id  bigint not null references demandas (id) on delete cascade,
  numero      text not null,
  situacao    situacao_rms not null default 'aberta',
  descricao   text,
  criado_em   timestamptz not null default now()
);
create index on rms (demanda_id);

-- Atividades, pendências e entregas
create table atividades (
  id                    bigint generated always as identity primary key,
  demanda_id            bigint not null references demandas (id) on delete cascade,
  tipo                  tipo_item not null default 'atividade',
  titulo                text not null,
  responsavel_id        bigint references pessoas (id),
  prazo                 date,
  situacao              situacao_item not null default 'a_fazer',
  impedimento           boolean not null default false,
  impedimento_descricao text,
  concluida_em          date,
  criado_por            uuid references perfis (id) default auth.uid(),
  criado_em             timestamptz not null default now()
);
create index on atividades (demanda_id);

-- Histórico de andamento
create table historico (
  id          bigint generated always as identity primary key,
  demanda_id  bigint not null references demandas (id) on delete cascade,
  data        date not null default current_date,
  texto       text not null,
  tipo        tipo_historico not null default 'atualizacao',
  autor_id    uuid references perfis (id) default auth.uid(),
  autor_nome  text,
  criado_em   timestamptz not null default now()
);
create index on historico (demanda_id, data desc);

-- RDO — Relatório Diário de Obra
create table rdos (
  id                        bigint generated always as identity primary key,
  demanda_id                bigint not null references demandas (id) on delete cascade,
  data                      date not null default current_date,
  origem                    origem_rdo not null default 'equipe',
  empresa_id                bigint references empresas (id),
  horario_inicio            time,
  horario_fim               time,
  clima_manha               text check (clima_manha in ('bom', 'chuvoso', 'impraticavel')),
  clima_tarde               text check (clima_tarde in ('bom', 'chuvoso', 'impraticavel')),
  area_praticavel           boolean,
  efetivo                   jsonb not null default '[]',   -- [{funcao, quantidade, tipo: proprio|terceiro}]
  equipamentos              jsonb not null default '[]',   -- [{descricao, quantidade}]
  atividades_executadas     text,
  atividades_ids            bigint[] not null default '{}',
  ocorrencias               jsonb not null default '[]',   -- [{descricao, impedimento: bool}]
  dds_realizado             boolean,
  pt_emitida                boolean,
  incidentes                text,
  materiais_recebidos       text,
  observacoes_contratada    text,
  apontamentos_contratante  text,
  apontado_por              uuid references perfis (id),
  apontado_por_nome         text,
  apontado_em               timestamptz,
  status                    status_rdo not null default 'rascunho',
  revisado_por              uuid references perfis (id),
  revisado_por_nome         text,
  revisado_em               timestamptz,
  criado_por                uuid references perfis (id) default auth.uid(),
  criado_em                 timestamptz not null default now(),
  atualizado_em             timestamptz not null default now()
);
create index on rdos (demanda_id, data desc);

-- Documentos (metadados; arquivo fica no Storage, bucket "documentos")
create table documentos (
  id            bigint generated always as identity primary key,
  demanda_id    bigint not null references demandas (id) on delete cascade,
  atividade_id  bigint references atividades (id) on delete set null,
  rdo_id        bigint references rdos (id) on delete cascade,
  categoria     categoria_documento not null default 'outro',
  nome          text not null,
  descricao     text,
  caminho       text not null unique,
  tamanho       bigint,
  mime          text,
  visivel_contratada boolean not null default false,
  enviado_por   uuid references perfis (id) default auth.uid(),
  enviado_por_nome text,
  empresa_envio bigint references empresas (id),
  criado_em     timestamptz not null default now()
);
create index on documentos (demanda_id);
create index on documentos (rdo_id);

-- =====================================================================
-- Funções auxiliares de permissão
-- =====================================================================
create or replace function public.meu_papel() returns papel_usuario
language sql stable security definer set search_path = public as $$
  select papel from perfis where id = auth.uid() and ativo
$$;

create or replace function public.minha_empresa() returns bigint
language sql stable security definer set search_path = public as $$
  select empresa_id from perfis where id = auth.uid() and ativo
$$;

create or replace function public.e_gestor() returns boolean
language sql stable as $$ select coalesce(public.meu_papel() = 'gestor', false) $$;

create or replace function public.e_interno() returns boolean
language sql stable as $$ select coalesce(public.meu_papel() in ('gestor', 'engenheiro', 'consulta'), false) $$;

create or replace function public.pode_editar() returns boolean
language sql stable as $$ select coalesce(public.meu_papel() in ('gestor', 'engenheiro'), false) $$;

-- Pode ver a demanda: equipe interna vê todas; contratada vê só as da sua empresa
create or replace function public.pode_ver_demanda(p_demanda bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when public.e_interno() then true
    when public.meu_papel() = 'contratada' then exists (
      select 1 from demandas d where d.id = p_demanda and d.empresa_id = public.minha_empresa())
    else false end
$$;

-- =====================================================================
-- Gatilhos
-- =====================================================================

-- Código legível da demanda (DEM-0001)
create or replace function trg_demanda_codigo() returns trigger language plpgsql as $$
begin
  if new.codigo is null then
    new.codigo := 'DEM-' || lpad(new.id::text, 4, '0');
  end if;
  return new;
end $$;
create trigger demanda_codigo before insert on demandas
  for each row execute function trg_demanda_codigo();

-- Ajustes automáticos + registro no histórico de mudanças de situação/etapa
create or replace function trg_demanda_atualizacao() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_autor text := (select nome from perfis where id = auth.uid());
  v_msg   text := '';
begin
  new.atualizado_em := now();
  if new.situacao = 'concluida' and new.concluida_em is null then
    new.concluida_em := current_date;
  end if;
  if new.situacao <> 'concluida' then
    new.concluida_em := null;
  end if;
  if new.situacao <> 'aguardando' then
    new.aguardando_o_que := null;
  end if;

  if tg_op = 'UPDATE' then
    if new.situacao is distinct from old.situacao then
      v_msg := v_msg || 'Situação: ' || rotulo_situacao(old.situacao) || ' → ' || rotulo_situacao(new.situacao) || '. ';
    end if;
    if new.etapa is distinct from old.etapa then
      v_msg := v_msg || 'Etapa: ' || rotulo_etapa(old.etapa) || ' → ' || rotulo_etapa(new.etapa) || '. ';
    end if;
    if new.responsavel_id is distinct from old.responsavel_id then
      v_msg := v_msg || 'Responsável: ' || coalesce((select nome from pessoas where id = old.responsavel_id), '—')
               || ' → ' || coalesce((select nome from pessoas where id = new.responsavel_id), '—') || '. ';
    end if;
    if new.prazo_conclusao is distinct from old.prazo_conclusao then
      v_msg := v_msg || 'Prazo de conclusão: ' || coalesce(to_char(old.prazo_conclusao, 'DD/MM/YYYY'), '—')
               || ' → ' || coalesce(to_char(new.prazo_conclusao, 'DD/MM/YYYY'), '—') || '. ';
    end if;
    if v_msg <> '' then
      insert into historico (demanda_id, texto, tipo, autor_id, autor_nome)
      values (new.id, trim(v_msg), 'sistema', auth.uid(), v_autor);
    end if;
  end if;
  return new;
end $$;

create or replace function rotulo_situacao(s situacao_demanda) returns text language sql immutable as $$
  select case s
    when 'nao_iniciada' then 'Não iniciada' when 'em_andamento' then 'Em andamento'
    when 'aguardando' then 'Aguardando' when 'suspensa' then 'Suspensa'
    when 'cancelada' then 'Cancelada' when 'concluida' then 'Concluída' end
$$;

create or replace function rotulo_etapa(e etapa_demanda) returns text language sql immutable as $$
  select case e
    when 'recebida' then 'Recebida' when 'estudo_projeto' then 'Estudo / Projeto'
    when 'memorial_descritivo' then 'Memorial Descritivo' when 'rms_suprimentos' then 'RMS / Suprimentos'
    when 'aprovacao' then 'Aprovação' when 'ordem_servico' then 'Ordem de Serviço'
    when 'execucao' then 'Execução' when 'encerramento' then 'Encerramento' when 'concluida' then 'Concluída' end
$$;

create trigger demanda_atualizacao before insert or update on demandas
  for each row execute function trg_demanda_atualizacao();

-- Nome do autor no histórico
create or replace function trg_historico_autor() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.autor_nome is null then
    new.autor_nome := (select nome from perfis where id = new.autor_id);
  end if;
  return new;
end $$;
create trigger historico_autor before insert on historico
  for each row execute function trg_historico_autor();

-- Atividade: data de conclusão automática
create or replace function trg_atividade() returns trigger language plpgsql as $$
begin
  if new.situacao = 'concluida' and new.concluida_em is null then new.concluida_em := current_date; end if;
  if new.situacao <> 'concluida' then new.concluida_em := null; end if;
  if not new.impedimento then new.impedimento_descricao := null; end if;
  return new;
end $$;
create trigger atividade_ajustes before insert or update on atividades
  for each row execute function trg_atividade();

-- RDO: regras de quem pode alterar o quê
create or replace function trg_rdo_regras() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_papel papel_usuario := public.meu_papel();
begin
  new.atualizado_em := now();

  if tg_op = 'INSERT' then
    if v_papel = 'contratada' then
      new.origem := 'contratada';
      new.empresa_id := public.minha_empresa();
      new.apontamentos_contratante := null;
      if new.status not in ('rascunho', 'enviado') then new.status := 'rascunho'; end if;
    end if;
    return new;
  end if;

  -- RDO revisado fica travado (só o Gestor pode reabrir, voltando para "enviado")
  if old.status in ('revisado_ok', 'revisado_ressalvas') then
    if v_papel = 'gestor' and new.status in ('rascunho', 'enviado') then
      return new;
    end if;
    raise exception 'RDO já revisado: não pode ser alterado.';
  end if;

  if v_papel = 'contratada' then
    -- contratada não altera apontamentos nem revisa
    if new.apontamentos_contratante is distinct from old.apontamentos_contratante then
      raise exception 'Apontamentos da Contratante só podem ser preenchidos pela Triunfo.';
    end if;
    if new.status not in ('rascunho', 'enviado') then
      raise exception 'Somente a Triunfo pode revisar o RDO.';
    end if;
    new.origem := old.origem;
    new.empresa_id := old.empresa_id;
  end if;

  if new.apontamentos_contratante is distinct from old.apontamentos_contratante then
    new.apontado_por := auth.uid();
    new.apontado_por_nome := (select nome from perfis where id = auth.uid());
    new.apontado_em := now();
  end if;

  if new.status in ('revisado_ok', 'revisado_ressalvas') and old.status is distinct from new.status then
    new.revisado_por := auth.uid();
    new.revisado_por_nome := (select nome from perfis where id = auth.uid());
    new.revisado_em := now();
  end if;
  return new;
end $$;
create trigger rdo_regras before insert or update on rdos
  for each row execute function trg_rdo_regras();

-- Documento: autor e empresa de quem enviou
create or replace function trg_documento() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.enviado_por := coalesce(new.enviado_por, auth.uid());
  new.enviado_por_nome := (select nome from perfis where id = new.enviado_por);
  new.empresa_envio := (select empresa_id from perfis where id = new.enviado_por);
  if new.empresa_envio is not null then new.visivel_contratada := true; end if;
  return new;
end $$;
create trigger documento_autor before insert on documentos
  for each row execute function trg_documento();

create or replace function trg_custos_ts() returns trigger language plpgsql as $$
begin new.atualizado_em := now(); return new; end $$;
create trigger custos_ts before update on demanda_custos
  for each row execute function trg_custos_ts();

-- Novo usuário no Auth → cria perfil (dados vêm de raw_user_meta_data)
create or replace function public.trg_novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into perfis (id, nome, email, papel, empresa_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', split_part(new.email, '@', 1)),
    new.email,
    coalesce((new.raw_user_meta_data ->> 'papel')::papel_usuario, 'consulta'),
    nullif(new.raw_user_meta_data ->> 'empresa_id', '')::bigint
  );
  return new;
end $$;
create trigger novo_usuario after insert on auth.users
  for each row execute function public.trg_novo_usuario();

-- =====================================================================
-- Visões (respeitam RLS de quem consulta)
-- =====================================================================

-- Classe e ranking de prioridade
create or replace view v_demandas with (security_invoker = true) as
with base as (
  select d.*,
    case when d.probabilidade is not null and d.severidade > 0
         then d.probabilidade * d.severidade end as pontuacao,
    l.nome as local_nome,
    p.nome as responsavel_nome,
    e.nome as empresa_nome,
    (select max(h.data) from historico h where h.demanda_id = d.id) as ultima_atualizacao,
    (select string_agg(r.numero, ' ') from rms r where r.demanda_id = d.id) as rms_numeros
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

-- Custos com Save calculado (só Gestor enxerga, pela RLS de demanda_custos)
-- Save = Orçado externo − custo realizado total (terceiros + execução própria + m.o. própria)
create or replace view v_custos with (security_invoker = true) as
select c.*,
  coalesce(c.custo_terceirizados, 0) + coalesce(c.custo_execucao_propria, 0) + coalesce(c.custo_mo_propria, 0) as custo_realizado_total,
  case when c.orcado_externo is not null then
    c.orcado_externo - (coalesce(c.custo_terceirizados, 0) + coalesce(c.custo_execucao_propria, 0) + coalesce(c.custo_mo_propria, 0))
  end as save
from demanda_custos c;

-- Impedimentos abertos (atividades + ocorrências de RDO dos últimos 30 dias)
create or replace view v_impedimentos with (security_invoker = true) as
select 'atividade' as origem, a.id as origem_id, a.demanda_id, a.titulo as descricao,
       coalesce(a.impedimento_descricao, '') as detalhe, a.criado_em::date as data
from atividades a
where a.impedimento and a.situacao not in ('concluida', 'cancelada')
union all
select 'rdo', r.id, r.demanda_id, o ->> 'descricao', '', r.data
from rdos r, jsonb_array_elements(r.ocorrencias) o
where coalesce((o ->> 'impedimento')::boolean, false) and r.data >= current_date - 30;

-- =====================================================================
-- RLS
-- =====================================================================
alter table empresas enable row level security;
alter table locais enable row level security;
alter table perfis enable row level security;
alter table pessoas enable row level security;
alter table demandas enable row level security;
alter table demanda_custos enable row level security;
alter table memoriais_revisoes enable row level security;
alter table rms enable row level security;
alter table atividades enable row level security;
alter table historico enable row level security;
alter table rdos enable row level security;
alter table documentos enable row level security;

-- Empresas
create policy empresas_ler on empresas for select to authenticated
  using (public.e_interno() or id = public.minha_empresa());
create policy empresas_gestor on empresas for all to authenticated
  using (public.e_gestor()) with check (public.e_gestor());

-- Locais
create policy locais_ler on locais for select to authenticated using (true);
create policy locais_editar on locais for insert to authenticated with check (public.pode_editar());
create policy locais_gestor on locais for update to authenticated using (public.e_gestor());
create policy locais_excluir on locais for delete to authenticated using (public.e_gestor());

-- Perfis
create policy perfis_ler on perfis for select to authenticated
  using (id = auth.uid() or public.e_interno());
create policy perfis_gestor on perfis for update to authenticated
  using (public.e_gestor()) with check (public.e_gestor());

-- Pessoas (responsáveis)
create policy pessoas_ler on pessoas for select to authenticated using (true);
create policy pessoas_gestor on pessoas for all to authenticated
  using (public.e_gestor()) with check (public.e_gestor());

-- Demandas
create policy demandas_ler on demandas for select to authenticated
  using (public.pode_ver_demanda(id));
create policy demandas_inserir on demandas for insert to authenticated
  with check (public.pode_editar());
create policy demandas_atualizar on demandas for update to authenticated
  using (public.pode_editar()) with check (public.pode_editar());
create policy demandas_excluir on demandas for delete to authenticated
  using (public.e_gestor());

-- Custos: só Gestor
create policy custos_gestor on demanda_custos for all to authenticated
  using (public.e_gestor()) with check (public.e_gestor());

-- MD, RMS, atividades: ler conforme a demanda; editar equipe Triunfo
create policy md_ler on memoriais_revisoes for select to authenticated using (public.pode_ver_demanda(demanda_id));
create policy md_editar on memoriais_revisoes for all to authenticated
  using (public.pode_editar()) with check (public.pode_editar());

create policy rms_ler on rms for select to authenticated using (public.e_interno());
create policy rms_editar on rms for all to authenticated
  using (public.pode_editar()) with check (public.pode_editar());

create policy ativ_ler on atividades for select to authenticated using (public.pode_ver_demanda(demanda_id));
create policy ativ_editar on atividades for all to authenticated
  using (public.pode_editar()) with check (public.pode_editar());

-- Histórico: ler conforme a demanda; incluir equipe Triunfo; corrigir/excluir só o próprio autor ou Gestor
create policy hist_ler on historico for select to authenticated using (public.e_interno());
create policy hist_inserir on historico for insert to authenticated
  with check (public.pode_editar() and tipo <> 'sistema');
create policy hist_alterar on historico for update to authenticated
  using (public.e_gestor() or (autor_id = auth.uid() and public.pode_editar()));
create policy hist_excluir on historico for delete to authenticated
  using (public.e_gestor() or (autor_id = auth.uid() and public.pode_editar() and tipo <> 'sistema'));

-- RDO
create policy rdo_ler on rdos for select to authenticated using (public.pode_ver_demanda(demanda_id));
create policy rdo_inserir on rdos for insert to authenticated
  with check (public.pode_editar()
              or (public.meu_papel() = 'contratada' and public.pode_ver_demanda(demanda_id)));
create policy rdo_atualizar on rdos for update to authenticated
  using (public.pode_editar()
         or (public.meu_papel() = 'contratada' and empresa_id = public.minha_empresa()))
  with check (public.pode_editar()
         or (public.meu_papel() = 'contratada' and empresa_id = public.minha_empresa()));
create policy rdo_excluir on rdos for delete to authenticated
  using (status = 'rascunho' and (public.pode_editar() or (public.meu_papel() = 'contratada' and criado_por = auth.uid())));

-- Documentos
create policy doc_ler on documentos for select to authenticated using (
  public.e_interno()
  or (public.meu_papel() = 'contratada' and public.pode_ver_demanda(demanda_id)
      and (visivel_contratada or empresa_envio = public.minha_empresa())));
create policy doc_inserir on documentos for insert to authenticated
  with check (public.pode_editar()
              or (public.meu_papel() = 'contratada' and public.pode_ver_demanda(demanda_id)));
create policy doc_alterar on documentos for update to authenticated
  using (public.pode_editar() or enviado_por = auth.uid());
create policy doc_excluir on documentos for delete to authenticated
  using (public.e_gestor() or enviado_por = auth.uid());

-- Concessões
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke all on all tables in schema public from anon;

-- =====================================================================
-- Storage: bucket privado "documentos"; caminho = <demanda_id>/<arquivo>
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('documentos', 'documentos', false, 15728640)  -- 15 MB por arquivo
on conflict (id) do nothing;

-- só lê o arquivo quem enxerga o registro em "documentos" (RLS da tabela se aplica na subconsulta)
create policy "docs ler" on storage.objects for select to authenticated
  using (bucket_id = 'documentos'
         and exists (select 1 from public.documentos d where d.caminho = storage.objects.name));
create policy "docs enviar" on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos'
              and (public.pode_editar()
                   or (public.meu_papel() = 'contratada'
                       and public.pode_ver_demanda(nullif(split_part(name, '/', 1), '')::bigint))));
create policy "docs excluir" on storage.objects for delete to authenticated
  using (bucket_id = 'documentos' and (public.e_gestor() or owner = auth.uid()));

-- Uso de armazenamento (para o painel acompanhar o limite do plano gratuito)
create or replace function public.uso_armazenamento() returns table (bytes bigint, arquivos bigint)
language sql stable security definer set search_path = public, storage as $$
  select coalesce(sum((metadata ->> 'size')::bigint), 0), count(*)
  from storage.objects where bucket_id = 'documentos' and public.e_interno()
$$;
