# Matriz de aceite

| Jornada | Estado atual | Evidência / próxima prova |
| --- | --- | --- |
| Diagnóstico e lead | LOCAL_VERIFIED parcial / NOT_PUBLISHED | Preparação sem contato: 14 testes rota/SQL, concorrência e rollback, vínculos/tokens preservados; ação no admin com links e retry. Busca/análise reais e navegador pendentes. |
| HighLevel/OpenDots novo | LOCAL_VERIFIED / NOT_PUBLISHED | Histórico real fornece IDs; reconciliação 12, handler/bridge 30 e PostgreSQL 9 testes passaram. App privado cancelado; corte e nova prova externa pendentes. |
| Pagamento e acesso | LOCAL_VERIFIED parcial / BLOCKED_EXTERNAL na prova de pagamento | Handler 29, checkout/rota 15, base SQL 13, Auth 8 e vínculo 12 testes aprovados. API Asaas de produção acessível; webhook existente sem eventos CHECKOUT_*. Usuário confirmou ausência de pagamento anterior; não houve nova cobrança. Prova externa depende de sandbox autorizado ou pagamento genuíno futuro. |
| Onboarding | LOCAL_VERIFIED parcial | 9 regressões e TypeScript; publicação/navegador ainda pendentes. |
| Google OAuth | DEFERRED_BY_USER | Usuário pediu seguir sem configurar; deve ficar opcional e desconectado. Não é prova de sync. |
| Base/avaliações | LOCAL_VERIFIED parcial / NOT_PUBLISHED | Importação/confirmação: 14 casos, concorrência e 10.000 linhas. Ativação: 10 casos, serialização, recibo humano e capacidade de agenda. Journal 19, processador/HTTP/SQL 14 e webhook/SQL 9 testes; cron/recuperação ligados localmente, envio desligado por padrão. Ingresso real de clientes, transporte e publicação ainda não comprovados. |
| Painel/admin | LOCAL_VERIFIED parcial / NOT_PUBLISHED | Painel: 6 regressões da API e 7 de React, incluindo escopo antes do limite e confirmação preservada. Admin supervisionado: 11 testes API/React; remoção de disparo ao abrir; orientação salva/consultável com revisão humana. Ambiguidades de avaliações/pagamentos, navegador e publicação pendentes. |
| Operação/rollback | IN_PROGRESS | Recuperação restrita: endpoint 10 testes, worker 5, receptor HTTP 9 e fila 3. Retomada por disponibilidade e falha isolada corrigidas. Configuração anterior Asaas preservada; publicação, cadência real e rollback ainda pendentes. |

Não declarar 100% antes dos gates do escopo atualizado.
