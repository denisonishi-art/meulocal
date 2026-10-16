# Rollback antes da aplicação externa

Esta versão ainda não foi aplicada em produção. Preservar docs/evidence/highlevel-opendots-bridge-2026-10-14 e snapshots privados anteriores.

Ordem de aplicação depois da âncora validada: snapshot privado da VPS e dados/identidade, verificar schema remoto e aplicar migration aditiva, atualizar somente comercial-server/engine/receipts na VPS preservando bootstrap/dot/credenciais/data, validar health e permissions, deploy do checkout isolado, atualizar/publicar contrato do workflow depois da validação controlada.

Se recuar: restaurar configuração do workflow e deployment anterior dpl_8btmugFJKXmV3kxpVcsN1EWrjoAF (main 9b51872685688a4cffc282dacc96181ce5a66f0a); restaurar os arquivos da VPS do snapshot, sem apagar workspace ou decisões. Remover apenas os dois triggers desta migration para suspender a observação de estados. Preservar a tabela/fila/recibos e os registros de ghl_events, outreach e alterações legítimas dos clientes. Não apagar ou reenviar decisões. Nunca fazer rollback de pagamento ou ativação para desfazer observação.

SQL reversível de desativação dos hooks:

```sql
begin;
drop trigger if exists opendots_account_lifecycle on public.customer_accounts;
drop trigger if exists opendots_checkout_lifecycle on public.payment_checkouts;
commit;
```

Não remover objetos ou snapshots antigos nem usar reset. Os recibos antigos do OpenDots não possuem fingerprint completo; não podem ser adotados como equivalentes sem prova de payload. Eventos antigos já concluídos em ghl_events permanecem concluídos; eventual legado incompleto exige reconciliação específica, não repetição cega do modelo.
