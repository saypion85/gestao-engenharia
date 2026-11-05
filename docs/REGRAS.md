# Regras de negócio, campos e indicadores

As regras abaixo foram validadas com o Gestor em 05/11/2026. Cada item indica a origem: ✅ **confirmado** ou 💡 **sugestão implementada (pode ser ajustada)**.

## Fluxo da demanda

| Forma de execução | Etapas | Origem |
|---|---|---|
| Serviço contratado | Recebida → Estudo/Projeto → Memorial Descritivo → RMS/Suprimentos → Aprovação → Ordem de Serviço → Execução → Encerramento → Concluída | ✅ |
| Execução interna | Recebida → Estudo/Projeto → Aprovação → Execução → Encerramento → Concluída | ✅ |

**Situação** (separada da etapa, ✅): Não iniciada, Em andamento, Aguardando (com o campo *aguardando o quê/quem*), Suspensa, Cancelada, Concluída.

- 💡 Ao marcar *Concluída*, a data de conclusão é preenchida e a etapa vai para *Concluída*.
- 💡 Mudanças de situação, etapa, responsável e prazo de conclusão entram no histórico automaticamente, com nome e data.

## Contratação

- ✅ **MD:** um por demanda, com revisões numeradas (000, 001, 002…). Cada revisão fica registrada; a mais recente é a vigente.
- ✅ **RMS:** várias por demanda, cada uma com situação (Aberta, Em cotação, Aprovada, Atendida, Cancelada).
- ✅ **OS:** uma por demanda.

## Custos (✅ visíveis só para o Gestor)

- **Orçado externo:** quanto custaria com mão de obra externa (referência).
- **Save (economia)** = Orçado externo − (custo com terceiros + custo da execução própria + custo da mão de obra própria).
  - 💡 Na planilha a fórmula do Save variava de linha para linha. O sistema usa uma regra única; as duas diferenças encontradas estão no relatório de importação.
  - **A confirmar:** se "Custo da execução própria" (coluna *Custo Realizado com m.o. própria*) já inclui a mão de obra, ela não deve ser somada duas vezes. A regra fica num único ponto do banco (`v_custos`) e é fácil de ajustar.

## Prioridade (✅ modelo da planilha Prioridade.xlsx)

1. Categoria principal e, se houver, secundária: SEG, EST, ELE, OPE, LEG, AMB, FIN, REC, PAT.
2. **Probabilidade (P)** de 1 a 5.
3. **Severidade (S)**: nota de 1 a 5 em Pessoas, Operação, Financeiro e Legal. Vale a **maior**.
4. **Pontuação = P × S.** Classe: 15–25 Crítico · 10–14 Alto · 5–9 Médio · 1–4 Baixo.
5. **Regra de corte:** severidade 5, ou risco de queda/eletrocussão com P ≥ 3 → Crítico.
6. **Ranking (1, 2, 3…)** das demandas abertas, nesta ordem: classe → pontuação → severidade para pessoas → prazo legal/contratual → efeito em cadeia → menor esforço (✅ campo Baixo/Médio/Alto) → mais antiga.
7. ✅ Concluídas e canceladas saem do ranking. ✅ Suspensas mantêm o número.
8. ✅ A avaliação é obrigatória ao cadastrar uma demanda nova. As importadas abertas entram como *Sem avaliação* e aparecem no painel para a equipe classificar.

## Perfis (✅)

| Perfil | Pode |
|---|---|
| Gestor | Tudo, inclusive custos, usuários e cadastros |
| Engenheiro | Cadastrar/editar demandas, atividades, MD/RMS/OS, documentos e RDOs; apontar e revisar RDO de contratada |
| Consulta | Ler tudo, menos custos |
| Contratada | Ver só as demandas da própria empresa (dados gerais, atividades, documentos liberados); criar/enviar RDO; enviar documentos. Não vê custos, histórico interno, RMS nem documentos internos |

## RDO (✅ modelo aprovado)

Seções: identificação · clima e condição da área · efetivo (próprio/terceiro) · equipamentos · atividades executadas · ocorrências (com marcação de impedimento) · segurança (DDS, PT, incidentes) · materiais recebidos · fotos · observações · **apontamentos da Contratante** (só em RDO de contratada, preenchido pela Triunfo).

Ciclo: Rascunho → Enviado → Revisado (sem/com ressalvas). Revisado = travado (só o Gestor reabre). Imprime ou salva em PDF com campos de assinatura.

## Indicadores do painel

Todos são contagens de registros reais; **não há percentual de avanço**. Cada número abre a lista exata de demandas que o compõem.

| Indicador | Critério |
|---|---|
| Abertas | Situação diferente de Concluída e Cancelada |
| Em andamento / Aguardando / Suspensas / Concluídas | Situação igual à do indicador |
| Atrasadas | Aberta e prazo de conclusão anterior a hoje |
| Vencendo em 7 dias | Aberta e prazo de conclusão **ou** da próxima etapa entre hoje e 7 dias |
| Sem atualização há +15 dias | Aberta e último registro no histórico há mais de 15 dias |
| Sem avaliação de prioridade | Aberta sem probabilidade e severidade |
| Com impedimento | Atividade/pendência aberta marcada como impedimento, ou ocorrência de impedimento em RDO dos últimos 30 dias |
| Acompanhamento gerencial | Aberta e marcada para acompanhamento gerencial |
| Por classe / etapa / responsável / forma | Contagem das abertas em cada grupo |
| Save (só Gestor) | Soma do Save das demandas com orçado externo |
| Armazenamento | Soma do tamanho dos arquivos enviados ÷ 1 GB |

Limiares (7 dias, 15 dias, 30 dias) ficam em `src/lib/dominio.ts` e podem ser ajustados.

## De-para: planilha → sistema

| Coluna da planilha (aba Dados) | No sistema | Tratamento na importação |
|---|---|---|
| Prioridade | *Prioridade na planilha antiga* (referência) | Substituída pela matriz P × S |
| Acomp. Gerencial | Acompanhamento gerencial (sim/não) | "Sim"/"sim" → sim |
| Demanda Recebida em | Recebida em | — |
| Solicitante | Solicitante | Vazia em todas as linhas |
| Assunto | Assunto | Espaços extras removidos |
| Local | Local (lista padronizada) | 56 grafias → 49 locais |
| Responsável | Responsável (lista de pessoas) | "Cesar"/"cesar"/"César" → César Campelo |
| Memorial Descritivo | Situação do MD + código base + revisões | Códigos padronizados para MD-INF-NNN-AAAA-REV; "Criar/Montar MD" → *A elaborar* + pendência |
| RMS | Lista de RMS com situação | Células com vários números separadas; "cancelada" reconhecida; "Abrir RMS" → pendência |
| Status Projeto | Situação do projeto | — |
| Detalhamento do Status | Detalhamento | "-", datas soltas e nomes descartados |
| Ordem de Serviço | OS | "N/A" → vazio |
| Etapa com | Aguardando o quê/quem | Nomes padronizados; registrado no histórico quando não está aguardando |
| Prazo da Próxima etapa / Prazo de Conclusão | Mesmos campos | — |
| DeadLine / Deadline / Dias s/ Atualização / Tempo Decorrido | Calculados pelo sistema | Não importados (eram fórmulas) |
| Status | Situação | "Em execução" → Em andamento; "Outros" → Não iniciada (conferir) |
| Atualizado em | Data do histórico sem data | `=TODAY()` descartado |
| Histórico | Registros de histórico (um por data) | Separado pelas datas dd/mm/aaaa |
| Inicio / FIm | Início / fim da execução | "N/A"/"GESTÃO ANTIGA" → vazio |
| Custos (Z, AA, AD, AF), descrições | Custos (só Gestor) | Fórmula repetida em 18 linhas descartada; textos → observação |
| Save | Calculado | Não importado; diferenças listadas |
| — (novo) | Forma de execução, Etapa, Empresa contratada, avaliação de prioridade, atividades, RDO, documentos | Forma e etapa deduzidas na importação (conferir) |
