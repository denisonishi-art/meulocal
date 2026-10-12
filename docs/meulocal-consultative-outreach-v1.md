# MeuLocal - abordagem comercial consultiva (fase 1)

## Problema
Cerca de 70 contatos iniciais sem resposta segundo relato operacional. Isto nao confirma falha de entrega nem ausencia de interesse; investigar status GHL.

## Mudanca criada
- `lib/agents/consultative-approach.ts`: rascunhos de email e WhatsApp ancorados em observacoes, sem envio.
- `POST /api/agents/prospect/approach-draft`: preview privado com autenticacao administrativa.
- `lib/agents/prospect-intelligence.ts`: qualificacao auxiliar por evidencias para potencial OpenDots.

## Fronteiras
MeuLocal continua descobrindo empresas via Google Places e calculando score; GHL continua como CRM/canal; Resultado com IA continua cuidando da conversa e follow-up. Nenhum segundo agente de outreach deve ser ativado.

## Atenção antes do rollout
1. Examinar GHL: email em `enqueueGhlProspect` apenas cria/atualiza contato com tag `meulocal:prospectar`, nao comprova envio. Descobrir se workflow do GHL envia o primeiro email, qual template usa e respectivos estados entregue/bounce/resposta.
2. `approve/route.ts` chama envio WhatsApp ao aprovar quando nao encontra email; `dispatch-pending/route.ts` tambem pode enviar WhatsApp. Sao pontos distintos que devem convergir para uma politica unica de aprovação/idempotencia.
3. `acquisition-outreach/route.ts` contem copias antigas para D+3/D+7, nao substituir silenciosamente. Auditar e pausar campanha antiga antes do A/B test.
4. Nao afirmar consentimento baseado somente no fato de contato publico. Respeitar LGPD, opt-out, regras de envio e supressoes.
5. A data de observacao e URL submetidas por um integrador devem ser comprovadas por fonte real, nao apenas preencher campos.
6. Executar testes, build e smoke em staging; nenhum deploy nesta fase.

## Piloto seguro proposto
- 10 a 20 empresas elegiveis de aluguel de geradores em Sao Paulo.
- Mensagens personalizadas revisadas e aprovadas individualmente.
- Uma unica mensagem inicial por lead, email se valido, caso contrario WhatsApp se elegivel.
- Nao encaminhar link do diagnostico sem interesse; oferecer envio apos resposta positiva.
- Medir destinatarios validos, entrega, resposta positiva, resposta negativa, opt-out e conversao.
- Apenas apos o piloto ajustar sequencia D+3/D+7.

## OpenDots
O conector real do OpenDots e a coleta automatica de evidencias ainda nao foram instalados. O novo endpoint permite testar a geracao de mensagens diretamente na plataforma sem depender deles.
