# Rollback — preparação, ainda não ensaiada

Reusar o [baseline preservado do bridge](../highlevel-opendots-bridge-2026-10-14/ROLLBACK.md) e a [reversão do lifecycle](../highlevel-recovery-lifecycle-2026-10-15/ROLLBACK.md). IDs de deployment nesses arquivos são históricos: conferir o deployment realmente servido antes de usar qualquer comando. Este documento não comprova ensaio ou execução de rollback.

Antes da publicação, preservar de forma privada: deployment/commit servidos pela equipe denisonishi-8130s-projects e projeto prj_tTEcf7eWDIAPt7Q1vZ3Qmawu8QSp; configuração completa do workflow; arquivos/identidade/mounts/dados da VPS; configuração do webhook Asaas e segredos separadamente; configurações da régua por negócio e recibos/leases pendentes. Não incluir segredos em evidências públicas.

## Avaliações

1. Na versão nova, manter MEULOCAL_REVIEW_OUTREACH_ENABLED ausente/false. Isso bloqueia cron e recuperação antes de qualquer transporte; não altera o estado financeiro nem apaga a fila.
2. Se voltar a uma versão anterior que ignora essa flag, primeiro pausar as réguas afetadas, por IDs conferidos no snapshot, e conferir que nenhuma nova reserva/solicitação é emitida. O cron antigo ignora o novo journal; apenas desligar a flag não o protege.
3. Uma tentativa dispatching/ambiguous precisa de conferência do provedor. Expiração de lease não prova cancelamento. Não reenviar, liberar cota como se nada tivesse acontecido ou marcar como enviada sem ID/recibo verificáveis.
4. Restaurar somente aplicação/configuração/arquivos necessários, preservando as tabelas, eventos, orientações e recibos novos. Migrations são aditivas; não fazer DROP de journal/fila ou reset para voltar o aplicativo.
5. Antes de retomar, conferir código realmente servido, permissões, flags, pausas e pendências por negócio. Mudança de estado exige recibo e alvo exato; não editar pagamentos para produzir uma aparência de acesso válido.

## Gates ainda obrigatórios

Ensaiar com fixtures a reversão de configuração e a compatibilidade com a versão anterior, incluindo retenção de recibos e ausência de novo transporte. Conferir também o ingresso Asaas na reversão: não voltar a um handler financeiro antigo com falhas conhecidas enquanto continuar recebendo pagamentos. A estratégia concreta precisa ser validada no gate de publicação, preservando eventos genuínos e a política de retentativa do provedor. Nenhuma alteração externa de rollback foi executada neste checkpoint.
