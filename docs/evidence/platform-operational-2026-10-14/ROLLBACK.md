# Rollback — ensaio local concluído, produção não executada

Estratégia aprovada tecnicamente: desligar transporte e recuperação na versão segura deste pacote, preservando todos os dados. Não retornar automaticamente ao deployment histórico: handlers legados têm falhas conhecidas e podem ignorar flags.

1. Preservar snapshot privado de configuração/versão realmente servida, workflow, webhook financeiro, VPS e filas/recibos. Conferir alvo e propriedade. Pausar o recovery existente removendo somente `MEULOCAL_RECOVERY_URL`; manter ingressos financeiros legítimos na versão segura.
2. Manter os quatro gates de outreach `false`. Conferir que nenhum transporte novo acontece. Tentativas dispatching/ambiguous continuam pendentes, sem liberar cota ou autorizar reenvio por expiração de lease.
3. Reverter somente arquivo/configuração defeituosos para uma versão segura comprovadamente compatível. Não restaurar banco, apagar journals, eventos, pagamentos, opt-out, onboarding ou recibos. Preservar o segredo do receipt store e o diretório commercial-decisions. Não recriar runtime/CRM/checkout.
4. Se o workflow estiver afetado, preservar sua configuração e despublicar/pausar a ação pelo editor autorizado durante a correção; não redirecionar para handler legado inseguro. Não afirmar remoção de enrollment HighLevel a partir de tag, leitura ou HTTP 200.
5. Conferir pagamento, opt-out, contagens e recibos antes/depois. Só restaurar recovery com app/RPCs/runtime compatíveis e permissões conferidas. Envio segue sujeito à nova autorização e recibo; nunca usar botão comercial para testar rollback.

## Ensaio executado

`scripts/check-platform-rollback.cjs`: envia somente ao transporte sintético, grava recibo, registra tentativa ambígua e STOP, mantém fixture de pagamento ativo e checkout pago; desliga/restaura os gates na mesma versão segura e compara snapshots integrais. Zero novo envio, pagamento/opt-out/recibos/journal preservados. A jornada do navegador reinicia o receptor real HTTP e reconcilia um recibo já salvo após falha parcial sem repetir inferência.

Evidências: `/private/tmp/meulocal-platform-rollback-verified.log` (19 testes journal +1 ensaio naquele checkpoint), `/private/tmp/meulocal-platform-browser-proof-verified.log`, e regressão consolidada final. Os bancos, tentativas red e recibos permanecem preservados no container proprietário `meulocal-opendots-recovery-test-platform-20261015` (label codex.owner=meulocal-platform-20261015), sem porta pública.

Limites: ensaio local com Auth/provedor/modelo isolados. Não comprova reversão do binário legado, proxy/VPS real, migração do schema real ou entrega financeira. Essas combinações não são fallback autorizado. Baselines anteriores continuam preservados em Git e nos diretórios históricos de evidência.
