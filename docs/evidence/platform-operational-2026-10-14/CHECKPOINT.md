# Execução do plano aprovado

Goal ativo. Estado: IN_PROGRESS, sem liberação ampla.

## Aprovação e escopo atual

O usuário aprovou o plano de plataforma operacional em /goal. Depois decidiu seguir sem configurar OAuth Google por enquanto, usando login e senha do MeuLocal. A conexão Google passa a ser adiável, explicitamente desconectada. Não coletar senha Google nem simular sincronização. Asaas permanece o provedor; ainda não houve autorização de nova cobrança, convite de teste ou envio comercial.

## Conferência externa atual

- Vercel CLI autenticada confirmou equipe e Project ID explícitos. Node da Vercel: 24.x. PR #6 continua DRAFT/OPEN, HEAD 1e51e8e; build/GitGuardian/preview aprovados.
- As três variáveis do bridge e CRON_SECRET constam em produção. Export local antigo omite/redige segredos sensíveis; isso não significa ausência. Google Business OAuth/encryption e credenciais agency GHL não constam na lista atual.
- Supabase vznecxfmnthyxvsxwpzi conferido por host e leitura real: 2 ghl_events, 0 payment_events, 0 payment_checkouts, 1 customer_account, 0 conexões Google, 0 contatos de base e 0 inscrições de avaliações. Fila opendots_handoffs ainda ausente (migration não aplicada).
- HEAD da tabela review_request_settings com select=id retornou 400 porque sua chave é business_id; corrigir a consulta de diagnóstico, não classificar isso como erro do produto.
- VPS: container existente saudável, runtime opendots, dispatch=false; nenhum nome de credencial de transporte encontrado no processo. Source real em /app/scripts/opendots-worker; commercial-receipts.mjs ainda não publicado. Não houve alteração do serviço.
- HighLevel location autenticada segue acessível. Portal de desenvolvedor em marketplace.gohighlevel.com/login exige login separado. Solicitado acesso humano; nenhum app criado ou alterado. A landing usa iframe, portanto innerText vazio não era indisponibilidade do site.

## Implementação local deste checkpoint

app/onboarding/page.tsx agora recusa conclusão quando POST falha, mantém tentativa disponível, trata falha de rede/consulta sem afirmar pagamento confirmado e permite adiar Google. Conclusão não afirma conexão Google ou automação ativa inexistentes. Retorno setup=google permite reabrir a conexão posteriormente.

scripts/check-customer-journey.cjs executa os handlers reais da página, isolando hooks e Auth/HTTP externos. Primeiro reproduziu as falhas; após patch, 8/8 testes aprovados. TypeScript --noEmit --incremental false aprovado. Nenhum build repetido ainda, pois o checkpoint consolidado será após as demais correções.

## Próximos trabalhos obrigatórios

1. Recuperação transacional/serializada de pagamento e teste em PostgreSQL 17 isolado; não marcar recebimento como conclusão.
2. Ajustar no painel a apresentação sem Google e o link de retomada, com teste de comportamento.
3. Resolver identidade HighLevel por app nativo administrável ou alternativa incremental autorizada do histórico; publicar somente com âncora real.
4. Fechar fila/retomada, base e gates de envio, diagnóstico/login/painel, lint, regressão, revisão independente, migrações/runtime/deploy e prova externa.

Migração remota, novo deploy, merge, alteração do workflow, cobrança, convite e mensagem: NÃO executados neste checkpoint.

## Checkpoint incremental de identidade

O usuário autenticou o portal developer. My apps mostrou No apps found; ao perguntar por que criar app, foi explicitada a finalidade e escolhida a alternativa incremental já autorizada, usando a credencial existente. Formulário cancelado sem salvar. Acesso externo adicional não é mais a dependência escolhida.

Implementados localmente leitor paginado, lib de reconciliação, modo explícito no handler e migration 20261015_002_controlled_inbox_cursor.sql. Testes: handler 29/29; reconciliação 12/12; PostgreSQL real 9/9; receptor HTTP 7/7; onboarding 8/8. TypeScript aprovado no checkpoint anterior e conferência final em andamento. Os primeiros runs detectaram e corrigiram harness sem lte/SQL NULL, ambiguidade SQL receipt e chamada catch em PromiseLike do SDK. Logs de falha preservados em /private/tmp/meulocal-platform-*.log.

PostgreSQL temporário ativo, sem portas públicas: container fc4e5ec78ffb3768e43bd02021b56460627f7acea3eef22f517c80e2daf08c68, nome meulocal-opendots-recovery-test-platform-20261015, label codex.owner=meulocal-platform-20261015. Bancos por PID preservam tentativas. Reutilizar para os testes de pagamento; remover apenas após conferência de propriedade ao encerrar.

A dependência agora é implementação de recuperação periódica restrita + gates de publicação/prova externa; pagamento retomável e ajustes do painel sem Google continuam próximos. Não houve alteração de produção.

## Recuperação periódica local — 15/10

Implementados POST /api/internal/opendots/recover e commercial-recovery.mjs no runtime existente. HMAC inclui método e caminho (assinatura comercial não vale para recuperação), timestamp limitado a 90 segundos, payload fixo sem seleção de contato/tenant/job ou permissão de envio. Falha no HighLevel não impede tentativa da fila já persistida. Worker aguarda o término de cada requisição e só então agenda outra em 60 segundos; timeout 55 segundos, redirects proibidos e destino fixo HTTPS MeuLocal. Portanto, não prometer período fixo de 60 segundos: o intervalo inclui a duração da tentativa. Desativado até configurar MEULOCAL_RECOVERY_URL na publicação autorizada. Reinício depende dos leases/recibos do banco, sem fila volátil no worker.

Testes endpoint: 8/8; worker: 4/4; receptor HTTP: 7/7 (11/11 juntos). TypeScript --noEmit --incremental false: exit 0. Red inicial comprovou ausência dos módulos. Logs em /private/tmp/meulocal-platform-recovery-*.log. Nenhuma configuração ou dado de produção foi alterado. Próximo bloco: pagamento retomável e acesso sem conclusão antecipada.
