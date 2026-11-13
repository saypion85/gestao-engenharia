-- RDO: condição "nublado" no clima e registro estruturado de paralisações (motivo + horário),
-- usado pelo Resumo do período.
alter table rdos drop constraint if exists rdos_clima_manha_check;
alter table rdos drop constraint if exists rdos_clima_tarde_check;
alter table rdos add constraint rdos_clima_manha_check check (clima_manha in ('bom', 'nublado', 'chuvoso', 'impraticavel'));
alter table rdos add constraint rdos_clima_tarde_check check (clima_tarde in ('bom', 'nublado', 'chuvoso', 'impraticavel'));

-- [{motivo, inicio: 'HH:MM', fim: 'HH:MM', descricao}]
alter table rdos add column if not exists paralisacoes jsonb not null default '[]';
alter table rdos add constraint rdos_paralisacoes_lista check (jsonb_typeof(paralisacoes) = 'array');
