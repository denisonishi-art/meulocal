# Diagnóstico gratuito sem assinatura — régua V1 (Draft, sem envios)

Implementação **isolada** do motor de decisão em `lib/retention/diagnostic-nurture.ts`.
Sem endpoint, cron, integração de transporte, escrita no HighLevel, migrations, flags ou deploy.
A função apenas retorna **review_required**, nunca transmite mensagens.

## Etapas

- D0: email de entrega/convite, somente após **comprovante de entrega do diagnóstico**.
- D+1: email contextual com problema principal.
- D+3: WhatsApp, somente se consentimento e permissão de canal forem confirmados.
- D+5: email para explicar o serviço.
- D+7: email de último convite, sem pressão enganosa.

## Gates obrigatórios antes de instalar workflow

1. Definir *fonte factual* de `diagnosticDelivered`: a rota atual de diagnóstico mostra o resultado na tela, mas **não produz recibo de entrega de email**. Sem prova, pausa.
2. Fazer join inequívoco de `leadId` + `businessId`, identidade HighLevel/ownership e pagamento na base principal; ausência/ambiguidade = bloqueio.
3. Garantir checagem imediatamente antes de cada envio de pagamento ativo, pendência financeira, resposta humana, STOP/opt-out e DND do canal.
4. Usar diário durável com chave única por lead/negócio/etapa, reserva atômica, confirmação do provedor e estados incertos. Não reenviar após timeout sem reconciliação.
5. Proteger o processamento contra múltiplos cadastros, mudanças de email e falhas do webhook Asaas.
6. Definir consentimento específico do canal, data/origem e opção de descadastro, seguindo LGPD e regras do provedor.
7. Testar D0-D7, compra em cada estágio, STOP, resposta, erro de entrega, execução concorrente e contas múltiplas com fixtures, depois smoke integrado controlado.

## Limitações conhecidas

O endpoint `/api/leads/submit` salva lead, mas não apresenta evidência de envio do diagnóstico por email.
O login pode criar usuário sem assinatura: nunca usar usuário Supabase criado como gatilho comercial suficiente.
A cadência legada `/api/cron/acquisition-outreach` é outra operação, está bloqueada por flag e **não deve ser reutilizada ou ligada** sem análise do isolamento.
O checkout dos planos Essencial/Inteligência segue indisponível.

## Critério de pronto para integração

Somente após ledger, recibos, fontes fidedignas e checks de elegibilidade com testes integrados.
Aprovação comercial separada antes de habilitar qualquer workflow ou envio.
