# Reversão segura da publicação controlada

Manter os quatro gates de outreach false. Não reativar automaticamente as 71 inscrições pausadas. Preservar pagamento, opt-out, agenda, ghl_events, outbox, recibos e SQLite; nenhuma migration deve ser revertida ou repetida.

Aplicação: preferir redeploy do commit seguro 66d52a280cf0b098ac55a58172cf8f94bf96ec32 no projeto prj_tTEcf7eWDIAPt7Q1vZ3Qmawu8QSp/equipe denisonishi-8130s-projects. Não usar o antigo main/handler financeiro/cron como rollback. As versões intermediárias preservam segurança, mas têm falhas administrativas conhecidas; não são fallback preferencial.

Worker: se a recuperação causar problema, parar meulocal-opendots, preservá-lo com nome de falha único e restaurar o nome meulocal-opendots no container parado meulocal-opendots-pre-release-6f31976; iniciar esse container e executar docker exec meulocal-opendots-router nginx -s reload. O container preservado usa os arquivos seguros atuais e não contém MEULOCAL_RECOVERY_URL. Conferir health/dispatch=false. Não iniciar os dois workers simultaneamente. Não restaurar o tar de dados por cima dos dados atuais.

Backup remoto privado: /opt/meulocal-opendots/backups/release-20261015-6f31976 (configuração, worker anterior, secrets, proxy, snapshot consistente dos dados). Exportações privadas de schema/ledger/dados e configurações anteriores em /private/tmp/meulocal-release-*; valores não publicados no Git.

Workflow: manter POST controlled_reconcile=1 e cursor durável. Configuração anterior completa da ação e árvore preservadas privadamente; apenas URL mudou, confirmado após reload. Evitar voltar a payload sem ID no handler padrão. Asaas: se necessário remover somente os quatro CHECKOUT_* adicionados usando a lista anterior; preservar token, URL, modo e demais eventos. Não apagar/reverter pagamentos nem simular eventos financeiros.

Ensaios: versão segura off/on local preservou snapshots e não enviou; em produção, restart do runtime e replay do mesmo payload recuperaram recibo inalterado, sem nova decisão ou envio. Reversão para binário legado NÃO validada/não permitida neste pacote.
