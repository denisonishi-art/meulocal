# Pipecat voice — on-demand only

O MeuLocal usa voz apenas como continuação de uma conversa já iniciada por e-mail/WhatsApp.

## Regra de produto

- Nunca usar voz para cold call.
- Nunca iniciar chamada porque o lead abriu e-mail, clicou ou ficou sem responder.
- Só criar chamada quando uma mensagem inbound contiver pedido explícito de ligação.
- Opt-out sempre tem precedência.
- O recurso fica desativado por padrão.

## Arquitetura

MeuLocal/Vercel não hospeda o runtime de áudio em tempo real.

Fluxo:

1. HighLevel recebe a resposta do prospect.
2. O webhook do MeuLocal registra o inbound.
3. `isExplicitVoiceRequest()` valida se existe pedido explícito.
4. O MeuLocal registra `voice_call_requests`.
5. Se `PIPECAT_VOICE_ENABLED=true`, o adaptador chama o serviço externo Pipecat.
6. O serviço Pipecat executa telefonia/voz e devolve um identificador da chamada.

## Variáveis

```
PIPECAT_VOICE_ENABLED=false
PIPECAT_VOICE_BASE_URL=
PIPECAT_VOICE_TOKEN=
```

## Contrato esperado do serviço Pipecat

`POST {PIPECAT_VOICE_BASE_URL}/start`

Headers: Authorization Bearer + Content-Type application/json.

O payload inclui `phone_number` e `body` com `source=meulocal`, `lead_id`, `prospect_diagnostic_id`, `business_name`, `customer_requested_voice=true` e `requested_text`.

A resposta pode devolver `call_id`, `call_sid` ou `call_control_id`.
