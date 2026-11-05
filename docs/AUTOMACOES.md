# Automações — proposta para validação

Nada disto está implementado ainda. As propostas usam só recursos gratuitos e **dependem de você escolher o canal**.

## Canais possíveis (custo zero)

| Canal | O que precisa | Observação |
|---|---|---|
| **Teams** (recomendado) | Um canal da equipe no Teams com o fluxo *Workflows → "Postar em um canal quando uma solicitação de webhook for recebida"*. Gera um endereço que eu guardo como segredo no GitHub | Não exige conta nova nem configuração de e-mail. Confirmar com a TI se o app Workflows está liberado |
| E-mail via serviço gratuito (Resend/Brevo) | Conta no serviço + configurar o domínio `triunfologistica.com.br` no DNS (TI) | Mais burocrático: depende da TI para o DNS |
| E-mail via caixa do Microsoft 365 | Caixa com "SMTP autenticado" liberado (TI) | Muitas empresas deixam isso desligado por segurança |

Quem dispara as automações: um agendamento gratuito do GitHub Actions, que lê o banco e envia a mensagem. Não precisa de servidor.

## Automações propostas

| # | Automação | Objetivo | Gatilho | Destinatários | Frequência | Canal |
|---|---|---|---|---|---|---|
| 1 | **Resumo diário de prazos** | Ninguém perder prazo | Agendado, dias úteis 7h30 | Canal da equipe; uma seção por responsável | Diária | Teams |
| 2 | **Alerta de atraso e impedimento** | Agir cedo no que travou | Agendado: demandas que ficaram atrasadas ou ganharam impedimento desde a véspera | Canal da equipe + menção ao responsável | Diária | Teams |
| 3 | **Pedido de atualização** | Manter o histórico vivo | Demandas abertas sem registro há mais de 15 dias | Responsável de cada demanda | Semanal, segunda-feira | Teams |
| 4 | **RDO aguardando revisão** | Revisar o RDO da contratada em tempo | RDO de contratada com situação "Enviado" há mais de 2 dias | Responsável da demanda | Diária | Teams |
| 5 | **Resumo gerencial semanal** | Visão da semana para o Gestor | Agendado, sexta-feira 16h | Gestor | Semanal | Teams (chat ou canal) |
| 6 | **Demanda nova sem avaliação** | Garantir que tudo entra no ranking | Demandas abertas sem avaliação de prioridade | Gestor | Semanal | Junto do resumo semanal |

### Conteúdo sugerido do resumo semanal (#5)

Abertas por situação · novas na semana · concluídas na semana · atrasadas · impedimentos · top 5 do ranking · demandas sem atualização · links diretos para cada item no sistema.

## Para eu implementar, preciso que você

1. Escolha o canal (sugiro **Teams**) e quais automações quer começar a usar (sugiro 1, 2 e 5).
2. Se for Teams: crie o fluxo de webhook no canal desejado e me envie o endereço. Eu explico os cliques.
3. Confirme os horários.
