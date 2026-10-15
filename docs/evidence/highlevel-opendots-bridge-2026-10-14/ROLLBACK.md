# Rollback preservado — não executado

Deployment anterior: dpl_2M9Xdr3uJmGe3wHYyuQLyAt9PqZS, fonte 730aaa0d86481ebfdc0899c74319a24e2532ef14. Restaurar esse deployment pela CLI autenticada na equipe denisonishi-8130s-projects, vinculando o Project ID prj_tTEcf7eWDIAPt7Q1vZ3Qmawu8QSp. Conferir o domínio e a prontidão após a operação.

Workflow: a única mudança foi a URL da ação. Restaurar https://resultado-com-ia-app.vercel.app/api/channels/ghl/bridge, método POST, headers X-Bridge-Secret (mesmo valor anterior) e Content-Type application/json; customData locationId fixo uNh3KsM7WFuLeTN8Q583, contactId={{contact.id}}, body={{message.body}}, direction=inbound; trigger Customer Replied/WhatsApp/tag controlled-contact. Settings mantidos: reentry=true, multiple opportunities=true, stop on response=false, time window=false, mark as read=false; Publish=true. Salvar, recarregar e conferir. Snapshots completos de acessibilidade com o segredo permanecem privados fora do Git.

GHL_WEBHOOK_SECRET era ausente e foi a única variável adicionada. OPENDOTS_COMMERCIAL_URL e OPENDOTS_COMMERCIAL_SECRET não foram alterados. Se necessário voltar à configuração anterior, remover somente a variável recém-adicionada antes do redeploy anterior; não rotacionar ou remover credenciais OpenDots.

Preservar os eventos, decisões e last_reply_at do teste como histórico real. Nenhuma reversão ou exclusão automática de dados foi executada. Não repetir o inbound já salvo.
