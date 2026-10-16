# Vínculo financeiro dos planos — 16/10/2026

## O que foi vinculado

| Plano | Valor mensal | ID real do link Asaas | Cadastro administrativo |
|---|---:|---|---|
| Essencial | R$189 | hkztixnoy3z2jxn0 | 4756927 |
| Inteligência | R$289 | 71k8chmbik8gy1ph | 4756949 |
| Legado preservado | R$397 | lay9mi0r83n79lzn | 4571033 |

Os IDs foram copiados pelo controle oficial da interface Asaas, não derivados dos IDs administrativos. Os links novos foram brevemente habilitados para copiar seus IDs e imediatamente desabilitados novamente; não foram distribuídos e não houve cobrança. O link antigo foi preservado.

Novo catálogo service-only: preço, ciclo, identidade do link e liberação explícita. Essencial e Inteligência iniciam com checkout_enabled=false. O endpoint público divulga somente ID/nome/preço/ciclo/disponibilidade, sem IDs administrativos. `/contratar?plan=essencial` e `/contratar?plan=inteligencia` selecionam o plano correto e mantêm a contratação bloqueada enquanto o catálogo não a liberar. A home continua levando ao diagnóstico gratuito.

O cliente envia somente planId, nunca decide o preço. A reserva reutiliza as transações, locks e reconciliação existentes, ajustando o preço dentro da transação antes da chamada Asaas. Troca de plano com reserva pendente gera conflito; não abre uma segunda cobrança. Checkout recorrente usa cartão, MONTHLY e conserva o plano nos callbacks. Callback não confirma pagamento.

O webhook reconhece os dois links e o legado, exige correspondência de valor, identidade e status, mantém o plano na renovação e salva plan_id na conta dentro da ativação atômica. O handoff factual pós-pagamento inclui planId/amountCents com permissões de envio/resposta/escrita desativadas. A entrega deste payload ao runtime remoto OpenDots ainda não foi executada nesta prova.

Não há upgrade/downgrade automático. Uma nova compra sem vínculo de renovação para conta ativa é recusada. Não foram implementadas as features do plano Inteligência nem liberada sua contratação. O preço fundador anterior foi removido da orientação comercial; valores históricos dos contratos são preservados.

## Banco publicado

Projeto confirmado: vznecxfmnthyxvsxwpzi. Quatro funções financeiras em produção tinham hashes normalizados idênticos ao código de origem antes da migração. Uma trava dentro da migração recusa sobrescrever alterações concorrentes.

Migração aplicada uma vez pelo conector Supabase: **20261016185642 / payment_plan_catalog**. O arquivo foi inicialmente gerado pelo CLI e alinhado ao timestamp efetivamente atribuído no ledger remoto; não executar o nome provisório nem repetir a aplicação.

Conferência depois da aplicação: catálogo com 18900/28900/39700 centavos; ciclos MONTHLY; flags false; anon sem SELECT no catálogo e sem EXECUTE na reserva. Checkouts=0, eventos financeiros=0 e contas ativas=1 antes e depois: a conta ativa preexistente não foi criada por este trabalho. Nenhum convite, cobrança ou pagamento real.

O advisor de segurança já tinha três views com aviso ERROR, além de avisos de configuração e tabelas service-only sem policies. Eles não foram alterados neste escopo; isto não é uma certificação de segurança global da plataforma. A nova tabela possui RLS e acesso público revogado. Referência do aviso de views preexistente: https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view .

## Validação

- 67 testes de aplicação aprovados, incluindo 12 novos contratos de planos e regressões de acesso, dashboard, inbound e recibos de monitoramento.
- 15 cenários SQL sobre migrations reais em PGlite: preços/IDs, liberação, reserva/reuso/conflito, valores incorretos, vínculo compartilhado, renovação, legado, permissões e plano no handoff OpenDots. Fixtures mínimas isoladas; não comprova concorrência PostgreSQL multi-sessão.
- TypeScript, lint e build aprovados; permanecem os dois avisos de hooks e avisos CSS existentes.
- Novos testes adicionados ao CI. Scripts financeiros antigos dependentes da plataforma Docker/PostgreSQL não foram executados nesta sessão; não contar como aprovados.

Registros brutos em unit-tests.txt e database-tests.txt. Nenhuma chamada de modelo/Google, criação de sessão Asaas, envio de e-mail ou cobrança foi feita pelos testes. O checkout/webhook com pagamento legítimo continua NOT_VERIFIED.

## Publicação e reversão

A publicação da aplicação deve manter os dois checkout_enabled=false, links Asaas desabilitados e monitoramento desligado. Não liberar contratação só porque o catálogo está vinculado. Antes de liberar: validar Google, destinatário/recibo, jornada legítima de pagamento/acesso/onboarding e entregas contratadas. Home e checkout devem informar disponibilidade real.

Rollback conservador: manter flags false, preservar ledger e plano de qualquer pagamento recebido, reverter aplicação se necessário. O banco é aditivo e mantém as assinaturas/RPCs legadas; não remover catálogo/colunas nem restaurar snapshots antigos por cima de pagamentos ou opt-outs. A migração contém as definições originais em arquivos históricos e guarda os contratos financeiros anteriores no Git; nenhuma credencial foi versionada.
