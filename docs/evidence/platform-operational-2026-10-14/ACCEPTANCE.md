# Matriz de aceite

| Jornada | Estado atual | Evidência / próxima prova |
| --- | --- | --- |
| Diagnóstico e lead | NOT_VERIFIED nesta execução | Validar contrato e navegador, preservar vínculos. |
| HighLevel/OpenDots novo | LOCAL_VERIFIED / NOT_PUBLISHED | Histórico real fornece IDs; reconciliação 12, handler 29 e PostgreSQL 9 testes passaram. App privado cancelado; corte e nova prova externa pendentes. |
| Pagamento e acesso | LOCAL_VERIFIED parcial / NOT_PUBLISHED | Handler 29, checkout/rota 15, base SQL 13 e Auth 8 testes aprovados. API Asaas de produção acessível; webhook existente sem eventos CHECKOUT_*. Prova real de pagamento/acesso e logs de entrega pendentes. |
| Onboarding | LOCAL_VERIFIED parcial | 9 regressões e TypeScript; publicação/navegador ainda pendentes. |
| Google OAuth | DEFERRED_BY_USER | Usuário pediu seguir sem configurar; deve ficar opcional e desconectado. Não é prova de sync. |
| Base/avaliações | NOT_VERIFIED | Sem contatos/inscrições atuais; testar sem enviar. |
| Painel/admin | NOT_VERIFIED | Verificar isolamento, dados e falhas reais. |
| Operação/rollback | IN_PROGRESS | Recuperação restrita: endpoint 9 testes, worker 4, receptor HTTP 7 e fila 2. Retomada por disponibilidade e falha isolada corrigidas. Configuração anterior Asaas preservada; publicação, cadência real e rollback ainda pendentes. |

Não declarar 100% antes dos gates do escopo atualizado.
