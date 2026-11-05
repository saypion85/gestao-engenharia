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

## Comentários (aba da demanda)

- Para registrar fatos e informações importantes que toda a equipe deve ver.
- **Escrevem:** Gestor e Engenheiro. **Leem:** toda a equipe interna. A contratada não vê os comentários.
- Autor e data/hora são gravados pelo sistema e não podem ser alterados.
- **Editar ou excluir:** somente o autor ou o Gestor. Toda edição fica marcada com quem editou e quando.
- **Importante:** destaca o comentário e o mostra no Resumo da demanda (os 3 mais recentes).

## Cronograma

- **Na demanda (aba Cronograma):** "Criar cronograma" gera os itens com as etapas do fluxo da forma de execução. As datas já conhecidas entram como realizadas: data de recebimento e início/fim da execução. É possível incluir itens personalizados, como mobilização ou entrega de material.
- Cada item tem **início e fim previstos** e **início e fim realizados**.
- **Realizado automático:** quando a etapa da demanda muda, o sistema preenche o fim realizado da etapa anterior e o início realizado da nova, se ainda estiverem vazios. Ao concluir a demanda, fecha os itens em andamento. Tudo pode ser corrigido manualmente.
- **Situação de cada item:**

| Situação | Critério |
|---|---|
| Concluída no prazo | Tem fim realizado e ele é igual ou anterior ao fim previsto (ou não há fim previsto) |
| Concluída com atraso | Fim realizado depois do fim previsto |
| Em andamento | Tem início realizado, não tem fim, e hoje ainda não passou do fim previsto |
| Atrasada | Tem início realizado, não tem fim, e hoje já passou do fim previsto |
| Início atrasado | Ainda sem realizado, e hoje já passou do início previsto |
| Programada | Sem realizado e com previsão futura |
| Não realizada | Etapa que a demanda já ultrapassou sem registro de realização |
| Sem previsão | Sem datas previstas |

- **Desvio** = dias entre o fim previsto e o fim realizado (ou hoje, se ainda aberta e já vencida).
- O gráfico mostra o previsto (contorno), o realizado (barra cheia; listrada quando ainda em andamento), a linha de hoje e a linha tracejada do prazo de conclusão. Há um aviso quando o término previsto passa do prazo de conclusão.
- **Menu Cronograma:** uma linha por demanda. O previsto vai do primeiro início previsto ao último fim previsto; o realizado, do primeiro início realizado até o último fim, ou até hoje se ainda estiver aberto. Demandas com alguma etapa atrasada ficam em vermelho e aparecem primeiro. A página também lista as demandas que ainda não têm cronograma.
- **Permissões:** Gestor e Engenheiro editam; equipe interna e contratada (só nas demandas da própria empresa) visualizam.

## Indicadores do painel

O painel segue a estrutura do painel publicado no artefato (Visão geral → Pontos de ação → Tendência → Detalhamento), calculado sobre os dados do sistema. São contagens e proporções entre contagens; **não há percentual de avanço físico**. Os filtros do topo (responsável, local, execução, atenção, busca e situação) valem para todos os blocos, exceto "Atividades vencidas". "Ver N demandas na lista" abre exatamente os registros do recorte.

**Carteira ativa** = Em andamento + Aguardando + Não iniciada. As suspensas ficam fora porque estão pausadas, mas continuam no ranking. **Aberta** = qualquer situação diferente de Concluída e Cancelada.

| Indicador | Critério |
|---|---|
| Total de demandas | Todas as do recorte |
| Carteira ativa | Situação Em andamento, Aguardando ou Não iniciada |
| Concluídas | Situação Concluída. Percentual = concluídas ÷ (total − suspensas − canceladas) |
| Suspensas / canceladas | Situação Suspensa ou Cancelada |
| Contratadas sem MD | Ativa, serviço contratado, MD a elaborar / em elaboração / em validação / não informado |
| Contratadas sem RMS | Ativa, serviço contratado, nenhuma RMS não cancelada |
| Paradas +30 dias | Ativa com último registro no histórico há mais de 30 dias, ou sem nenhum registro |
| Prazo vencido | Ativa com prazo de conclusão anterior a hoje |
| Prazo da próxima etapa vencido | Ativa com prazo da próxima etapa anterior a hoje |
| Vencendo em 7 dias | Ativa com prazo de conclusão ou da próxima etapa entre hoje e 7 dias |
| Aguardando aprovação | Ativa na etapa Aprovação |
| Com impedimento | Atividade/pendência aberta marcada como impedimento, ou ocorrência de impedimento em RDO dos últimos 30 dias |
| Sem avaliação de prioridade | Aberta (inclui suspensas) sem probabilidade e severidade |
| Acompanhamento gerencial | Aberta marcada para acompanhamento gerencial |
| Entradas × conclusões | Entrada = mês de recebimento (ou do 1º registro no histórico); conclusão = mês da data de conclusão; saldo = entradas − conclusões acumuladas. Últimos 12 meses |
| Tempo sem movimentação | Faixas de dias desde o último registro no histórico (carteira ativa) |
| Carteira por responsável / local | Ativas por situação; concluídas entre parênteses |
| Prontidão documental | Contratadas ativas: MD (emitido, em elaboração, não informado, não necessário) × RMS (com/sem) |
| Onde está cada demanda | Ativas por etapa, destacando prazo da próxima etapa vencido; e os motivos de "Aguardando o quê/quem" |
| Financeiro (só Gestor) | Somas das demandas do recorte com valor; Save = orçado externo − custo realizado total |
| Armazenamento | Soma do tamanho dos arquivos ÷ 1 GB |

**Pontos de ação** são gerados por regras sobre o recorte: paradas, prazos vencidos, impedimentos, gargalo documental, aprovações, próximas etapas vencidas, concentração (uma pessoa com 50% ou mais das ativas, quando há 6 ou mais ativas), fila maior que a execução e demandas fora do ranking. O Gestor pode ajustar o texto da ação, incluir uma nota, ocultar um ponto ou criar pontos manuais. Esses ajustes ficam salvos no banco e são vistos por toda a equipe interna.

O **tema claro/escuro** é escolhido por cada pessoa no topo da tela e fica salvo no navegador. A impressão sai sempre no tema claro.

Limiares (7 e 30 dias) ficam em `src/lib/dominio.ts`.

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
