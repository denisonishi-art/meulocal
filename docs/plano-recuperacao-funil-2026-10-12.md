# Plano de recuperação MeuLocal - 2026-10-12

## Objetivo
Demonstrar funil comercial rastreável da busca ao cliente convertido, evitando novos disparos sem reconciliação. O GHL segue fonte de verdade para conversas e entregas. Resultado com IA segue responsável pelo atendimento.

## Fase 0 - Contenção (implementação em branch)
- [x] Colocar gate explícito no cron de aquisição: MEULOCAL_ACQUISITION_OUTREACH_ENABLED=true.
- [x] Retirar disparo automático ao abrir /admin.
- [ ] Adicionar proteção equivalente e idempotência aos endpoints approve e dispatch-pending antes de publicar.
- [ ] Reconciliar os 61 follow-ups atrasados e a fila histórica sem disparar.

## Fase 1 - Observabilidade (implementação em branch)
- [x] Endpoint admin /api/admin/funil, leitura somente.
- [x] Dashboard /admin/funil: diagnósticos, fila, enviados com ID, aberturas, respostas internas, conversões e backlog.
- [x] Link do dashboard no Admin.
- [ ] Verificar schema/compilação, login admin e números no preview.
- [ ] Adicionar estados reais delivered/failed/replied a partir de eventos do GHL, sem assumir que queued ou ID do provedor significa entrega.

## Fase 2 - Consertar envio
- [ ] Validar workflow GHL que consome tag meulocal:prospectar. Upsert de contato não significa mensagem enviada.
- [ ] Centralizar um único disparador com chave idempotente por lead e campanha.
- [ ] Falha de reconciliação de resposta deve impedir follow-up (fail closed).
- [ ] Registrar supressão e base legal separadamente de canal escolhido.
- [ ] Exigir prova de envio/entrega antes de avançar estágio.

## Fase 3 - Teste comercial
- [ ] Inserir mensagens consultivas com dado verificado e prévia para revisão.
- [ ] Piloto autorizado de até 10-20 prospects elegíveis, e-mail primeiro, senão WhatsApp elegível.
- [ ] Medir entregue -> respondeu -> qualificado -> convertido.
- [ ] Comparar resultados e liberar escala apenas após revisão.

## Critérios de aceitação
- Nenhum envio ao navegar pelo Admin.
- Nenhum disparo se gate do cron estiver ausente/desligado.
- Nenhum duplicado por contato/campanha.
- Nenhum follow-up se status de resposta for desconhecido.
- Dashboard nunca converte queued em delivered nem registra ausência de dados como zero de entrega real.
- Produção só muda após build/testes e smoke end-to-end.

## Estado atual
Alterações salvas apenas na branch feat/opendots-prospeccao-meulocal. Não há validação de build, testes em runtime nem publicação em produção. Acesso OAuth do plugin HighLevel não autorizou consultas de conversas/workflows.
