# Estado atual — fechamento local de 15/10/2026

Este resumo prevalece sobre as seções históricas abaixo. Código: `9fc9301`, branch `codex/highlevel-recovery-lifecycle`, checkout `/Users/denisonishi/.codex/worktrees/highlevel-opendots-inbound/meulocal`. Não tocar no checkout original de Documents. Pacote LOCAL_VERIFIED_REVIEWED, publicação não executada. Não marcar o objetivo global como concluído.

- Cadência: o antigo 5/6 era contaminação entre fixtures vencidas; corrigida seleção sintética e preservado teste negativo de identidade. A revisão final também encontrou starvation real no cron limit1: uma inscrição bloqueada continuava a mais antiga para sempre. Agora slot/backoff de 5min persistido e serializado antes da preparação permite o próximo candidato, sem resetar agenda, consentimento ou journal. Teste red contra 7654fd0 e green com dois contatos; paralelismo e fechamento antigo recusado. Pendência consultável no admin.
- Manual/admin: texto completo aprovado pelo humano, UUID durável antes do HTTP e reaproveitado após reload/retry, receipt obrigatório; sem receipt/timeout continua incerto. Supervisão de outbox, pagamentos, avaliações, aquisição e cadência, com próximos passos e falha de consulta visível. Nunca converter falha de leitura em zero.
- Onboarding/ativação: pagamento, configuração e serviço ativo distintos. Negócio/conclusão exigem confirmação salva do usuário; Google pode ser adiado. Ativação exige canal ativo, destino público de avaliação e base/audiência confirmada; pagamento/navegação não ativam. O runtime só orienta e conserva revisão humana, sem conceder permissões ou responder automaticamente.
- 348/348 testes na regressão consolidada, 0 skips; TypeScript e build exit0. Lint configurado sem erros; 2 avisos de hooks e avisos CSS no build permanecem. Jornada repetida no build final: 8 cenários Chrome + handlers/SQL/HTTP receipts reais, Auth/HighLevel/modelo isolados, 0 requisições externas. Fonte financeira é fixture isolada, NÃO sandbox Asaas.
- Revisão independente do delta d3f45e2..7654fd0 e re-review 7654fd0..9fc9301: P2 de starvation encerrado, sem novos P1/P2 nas adjacências examinadas. Não é auditoria irrestrita de toda a plataforma.
- Rollback ensaiado localmente na versão segura: gates off/on preservaram snapshots de pagamento, opt-out, recibos e tentativas incertas; zero novo envio. Reinício do receptor reaproveitou decisão salva. Rollback para binário legado não aprovado.

Manifesto SHA-256/ordem em `release-manifest.json`; publicação e compatibilidade em `PUBLICATION.md`; ensaio/restrições em `ROLLBACK.md`; matriz em `ACCEPTANCE.md`; evidências finais em `release-*.log/json` e screenshots. 13 migrations candidatas dependem do ledger/DDL remoto, 4 arquivos de runtime alterados; não repetir migration nem publicar componente cujo hash já coincide. Prefixos históricos iguais exigem versões únicas no bundle de release após preflight, sem db push cego.

Pendências externas distintas: (a) conferir DDL/ledger remoto e boot/proxy/permissões do runtime real antes de autorizar publicação; (b) publicar app/runtime/workflow controlado de modo coordenado e comprovar novo evento; (c) comprovar ingresso/STOP de clientes fora do contato controlado antes de escala; (d) prova financeira de pagamento legítimo, pois não há anterior ou sandbox. Não há falha local conhecida remanescente no escopo revisado. Nada externo foi alterado neste bloco.

---

# Histórico preservado

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

## Revisão independente e vínculo de usuário

Revisão somente leitura do patch 1e51e8e..8e4405c: um P2 na conclusão do onboarding, que inferia ausência de sincronização a partir do estado inicial local do Google. Corrigido com texto neutro até consulta da conexão; nova regressão de reload falhou antes e passou depois (9/9 onboarding). Nenhum outro P1/P2 encontrado pelo revisor nesse patch; isso não valida publicação nem operação externa.

Avanço parcial no pagamento: ensureCustomerUser extraído para lib/payments/customer-user.ts. Busca paginada antes de convidar; falha/limite/paginação repetida recusam convite; resposta ambígua é reconciliada por nova leitura. O SDK instalado trunca páginas de dois dígitos no Link, portanto o helper calcula page+1 e recusa repetições. 8/8 testes isolados passaram, zero convite ou consulta de usuários reais. Esta correção NÃO resolve sozinha o problema maior do handler Asaas: journal durável, leases por evento/conta, associação e commit atômico ainda pendentes; não publicar pagamento como concluído.

## Base transacional de pagamento — LOCAL_VERIFIED, ainda sem ligação ao handler

Migration 20261015_003_payment_activation_recovery.sql e scripts/check-payment-database.cjs adicionados. Banco isolado novo por PID no container proprietário já registrado; 13/13 testes passaram com PostgreSQL 17 real. Claim serializa evento e conta; lease expira em 2 minutos; release com token antigo não remove reserva mais nova. Payment ID só pode vincular um checkout/conta; link compartilhado sem âncoras exige link configurado e e-mail correspondente. Complete valida usuário/vínculo e grava checkout pago + conta ativa + evento concluído + fila OpenDots na mesma transação; falha injetada no update da conta reverte tudo. Preserva onboarding in_progress. PAYMENT_CONFIRMED/RECEIVED do mesmo pagamento geram apenas uma orientação de lifecycle. Processed_at histórico não é certificado automaticamente: exige reconciliação. RPCs/tabelas de reserva restritas a service-role.

Esta base NÃO está integrada ao handler Asaas e não foi aplicada no Supabase remoto. O handler ainda mantém o defeito de processed_at prematuro/duplicata descartada; a próxima etapa obrigatória é substituí-lo por recebimento durável, normalização e associação única, claim, resolução de usuário e complete/release, com regressões do handler. Conferir valor/assinatura/identidade e replay de payload conflitante; implementar também eventos não pagos sem mudar a política existente. Resolver criação concorrente/orfandade de checkout e recuperação prática de eventos pendentes antes de liberar a jornada. Não dar sucesso a convite ambíguo nem disparar replay de convite real sem autorização.

Logs: /private/tmp/meulocal-platform-payment-db-red.log (RPC ausente, 9 falhas), -green.log (9 aprovados) e -final.log (13 aprovados); bancos de tentativa preservados. Nenhuma cobrança, convite ou evento real fabricado. Gate de pagamento permanece IN_PROGRESS.

## Pagamento durável integrado e checkout reservado — LOCAL_VERIFIED, NÃO PUBLICADO

O handler Asaas agora valida asaas-access-token antes de ler/processar, normaliza somente fatos financeiros e IDs imutáveis e persiste o evento antes de associar/ativar. Payload diferente com mesmo ID é conflito; falha deixa evento retomável, não processed_at prematuro. Associação por checkout/reference/subscription é única; link compartilhado exige link configurado, e-mail exato único e valor oficial. Auth é buscado antes de convidar. Convite tem reserva durável global por e-mail e conta, impedindo duas empresas de dispararem o mesmo convite; resposta ambígua exige reconciliação em vez de novo envio. Commit transacional salva conta + pagamento + evento + orientação OpenDots. Testes injetam falha antes e perda de resposta depois do commit. Novas migrations 004/005 continuam SOMENTE locais; 003 foi ajustada antes da primeira aplicação remota.

Recuperação periódica agora tenta inbox, pagamentos e fila independentemente. Ela só vincula usuário Auth existente, nunca autoriza novo convite. Ordenação por próxima disponibilidade evita que evento antigo com erro monopolize todas as tentativas. Worker exige também resultado payment.ok, não apenas HTTP 200.

Checkout agora persiste intenção/referência sob reserva por negócio ANTES de chamar Asaas. Requisições repetidas reutilizam URL salva ou aguardam conferência; nenhuma recriação automática após timeout/falha de salvamento. Preserva onboarding e contratos existentes; pagamento em processamento impede nova operação financeira. CHECKOUT_CREATED pode reconciliar ID por referência local exata; CHECKOUT_PAID pode chegar antes da resposta HTTP. Sem referência/ID confiável, evento fica pendente: não inferir empresa por nome, texto ou horário. A documentação do evento não garante externalReference no envelope; portanto a recuperação de criação sem ID salvo pode precisar de painel humano. Não inventar endpoint de listagem de checkout ou chave de idempotência não documentada.

Verificação focada: 29/29 processamento real do handler + PostgreSQL 17 (inclui os 26 casos anteriores); 15/15 reserva/rota real de checkout + PostgreSQL; base de ativação 13/13; vínculo Auth 8/8; recovery 9/9; worker 4/4. TypeScript exit 0. Todos com fornecedor/Auth isolados; zero cobrança/convite real. Logs em /private/tmp/meulocal-checkout-{event,route}-green.log e /private/tmp/meulocal-platform-payment-*.log; tentativas red preservadas.

### Acesso Asaas real, somente leitura

Usuário forneceu chave e token via arquivo privado 0600 fora do Git; nenhum segredo foi exibido. API de produção confirmou webhook existente 50881627-f427-4917-a4a0-acb9bf42b53e para https://meulocal.ia.br/api/webhooks/asaas, enabled=true, interrupted=false, SEQUENTIALLY. Eventos PAYMENT_CONFIRMED/RECEIVED e de assinatura já registrados; CHECKOUT_CREATED/PAID/CANCELED/EXPIRED ausentes. Evidência sanitizada: asaas-webhook-read.json. Configuração completa anterior preservada em /private/tmp/meulocal-asaas-webhook-before.private.json; token privado no arquivo de acesso, não no snapshot público.

Correção de diagnóstico: authToken não é devolvido por GET após criação, conforme documentação oficial https://docs.asaas.com/docs/create-new-webhook-via-api. Ausência no GET NÃO prova falta de configuração. Token precisa de conferência de recebimento real ou alinhamento explícito no gate de publicação. API não fornece logs de entrega; documentação https://docs.asaas.com/docs/webhooks-logs exige interface web para essa parte. Ainda não há prova de pagamento/acesso real nesta execução.

Nenhuma configuração Asaas/Vercel/Supabase/VPS/HighLevel foi modificada. Revisão independente do patch novo, testes consolidados, gates de base/painel/acesso, migração remota, runtime/deploy/corte de workflow e provas externas continuam obrigatórios. Plataforma permanece IN_PROGRESS / NOT_READY para operação ampla.

Fila OpenDots: dois testes integrados novos reproduziram starvation por created_at e interrupção dos jobs seguintes após exceção. Correção prioriza available_at/created_at e isola falha por job; 2/2 aprovados com SQL real e transporte simulado. Logs /private/tmp/meulocal-outbox-{red,green}.log. Não altera permissão de envio nem quantidade de jobs por tentativa.

## Vínculo de acesso e painel sem Google — LOCAL_VERIFIED parcial

Commit de pagamento/retomada preservado: f988d97. Usuário confirmou que NÃO há pagamento anterior a consultar. Acesso Asaas de produção funciona, mas não existe evento genuíno autorizado para provar pagamento/acesso; nenhuma cobrança criada para preencher essa lacuna. Prova externa exige sandbox autorizado com credencial correspondente ou pagamento genuíno futuro. Não dar REAL_VERIFIED à jornada a partir da chave ou dos testes sintéticos. Logs de entrega Asaas exigem sessão web, conforme documentação já registrada.

claim_customer_access é RPC service-role restrito, com confirmação Auth conferida no banco, normalização exata de e-mail, resolução única de negócio, trava por usuário/conta e update condicionado a pagamento ativo. Não marca pagamento, não cria usuário e não convida. Conta vinculada a outra pessoa e conta pending/canceled/past_due são recusadas; leads repetidos do mesmo negócio não criam falsa ambiguidade. API valida token com Auth antes do RPC e distingue erro de banco de ausência de vínculo. 12/12 regressões passaram com Auth isolado e PostgreSQL real. Migration 006 apenas local.

DashboardClient agora apresenta consulta falha como erro recuperável, não painel vazio/pronto; falha de claim é visível; erro de atualização não deixa ação travada nem remove histórico. Lê conexão Google da própria conta, mantém integração opcional, evita afirmar histórico real em estado vazio e reabre conexão em /onboarding?setup=google. Desconectar não apaga histórico salvo. Cinco regressões dos handlers React reais falharam antes e passaram depois. Logs /private/tmp/meulocal-customer-{access,dashboard}-*.log. Nenhuma prova de navegador em produção ainda.

Próxima lacuna concreta: customer-dashboard ainda ignora erros de consultas e busca automations/outreach globalmente antes de filtrar; CustomerOperations não captura falha de rede. Corrigir/testar escopo e estados antes da publicação. Base/importação/confirmação/ativação/cron e admin supervisionado continuam pendentes do plano. Não repetir gates já aprovados sem mudança; revisão independente consolidada no fechamento, com patch exato.

## Painel operacional e importação transacional — LOCAL_VERIFIED parcial, NÃO PUBLICADO

Backend filtra atividades por negócio antes de limitar os resultados, incluindo contatos fora da primeira página. Falhas de qualquer fonte obrigatória resultam em erro recuperável, nunca métricas falsas zeradas. CustomerOperations captura falha de rede e preserva o resumo/confirmador após upload: o callback onReady(false) não desmonta mais a confirmação. Seis regressões da rota com SDK real e transporte isolado e sete dos handlers React reais passaram. A sintaxe de relacionamento usa leads!inner conforme https://supabase.com/docs/reference/javascript/select; prova PostgREST remota/navegador continua pendente.

Importação e confirmação passaram para RPCs transacionais, com reserva da conta ativa por negócio/usuário, hash do arquivo para repetição segura e deduplicação por e-mail OU telefone dentro da mesma empresa. Preserva opt-out e recusa vínculo estrangeiro/inativo. Falha de escrita reverte importação/contatos ou confirmação inteira. Duas sessões PostgreSQL independentes importando o mesmo arquivo convergiram para um único registro. Limite de 10.000 linhas comprovado com salvamento integral em banco sintético; a consulta indexada reduziu aquela execução local de cerca de 17 segundos para menos de um segundo, sem promessa de desempenho em produção.

Arquivo limitado a 4 MB antes do upload, com leitura limitada a 10.002 linhas da primeira aba. A Vercel limita o corpo da função a 4,5 MB (https://vercel.com/docs/functions/limitations); a margem acomoda multipart sem nova infraestrutura. Migration 007 é aditiva e ainda local. Timeout específico da importação de 45s e lock de 3s, sem mudar limites globais.

Metadados OpenAPI do projeto correto foram consultados sem ler contatos ou imprimir credenciais: customer-base-schema-read.json. O DDL inicial das tabelas da base está ausente nesta branch. Fixture isolada reproduz os campos observados; não é prova de todas as constraints remotas e não recria tabelas em produção.

Verificação: 14/14 casos reais de importação/confirmação com PostgreSQL 17, parser XLSX e handlers reais, Auth/fornecedores isolados. Painel 13/13. TypeScript --noEmit --incremental false exit 0. Logs /private/tmp/meulocal-operational-base-final.log, /private/tmp/meulocal-customer-dashboard-checkpoint.log e /private/tmp/meulocal-platform-operational-typecheck-final.log. Tentativas anteriores preservadas. Nenhuma migração, configuração externa, cobrança, convite ou mensagem real executada.

Próximos gates: ativação transacional e cotas cumulativas; reserva/retomada do cron com resultado ambíguo sem reenvio cego; encerramento atômico no inbound de avaliações; controles de aprovação/envio; diagnóstico/login e admin supervisionado; regressão/lint/build/revisão consolidada; migrações/runtime/deploy/corte/prova externa e rollback. Pagamento real continua bloqueado por inexistência de pagamento anterior ou sandbox autorizado; isso não bloqueia o trabalho local independente.

## Ativação atômica e capacidade da fila — LOCAL_VERIFIED parcial, NÃO PUBLICADO

Painel preservado em 888b221 e importação/confirmação em de05398. A ativação agora usa RPC única, serializada pela conta paga e pelo negócio/usuário. Exige as duas confirmações explícitas na rota; a transação só agenda contatos de importação confirmada e sem opt-out, salva inscrição + evento queued com ator/consentimento declarado + estado do contato + settings juntos. Não executa transporte.

Repetição reutiliza inscrições e preserva activated_at. Duas sessões PostgreSQL concorrentes convergem sem duplicar. Nova base usa a capacidade já reservada de cada data, respeita dias úteis e a rampa existente, sem reiniciar a data de ativação; régua pausada permanece pausada. Capacidade de agendamento NÃO é ainda a cota cumulativa de envios do cron: essa correção continua pendente.

Falha injetada ao salvar settings e outra após inserir inscrição/recibo, ao atualizar contato, deixam zero estado parcial; tentativas podem ser refeitas. Erros da rota são sanitizados e ausência de elegíveis/pausa retorna 409. Tela distingue fila preparada de envio operacional. Migration 008 permanece local. Não houve alteração dos registros ou configurações externas.

Verificação: 10/10 em scripts/check-customer-activation.cjs com PostgreSQL real e rota real, Auth isolado. TypeScript --noEmit --incremental false exit 0. Logs /private/tmp/meulocal-customer-activation-{red,green,final}.log e /private/tmp/meulocal-platform-activation-typecheck.log. Red inicial: 0/6, transação ausente; green 6/6; casos de recibo/rota acrescentados fecharam 10/10. Fixtures e bancos de tentativa preservados. Não repetir importação/painel sem mudança correspondente. Revisão independente consolidada permanece obrigatória antes da publicação.

Próxima ação: corrigir cron de avaliações com autorização explícita desabilitada por padrão, reserva durável por tentativa e por cota diária, último gate de reply/opt-out/pagamento, sem fallback após resultado ambíguo e commit de recibo/estado; ligar encerramento do inbound à mesma serialização. Estado atual NOT_READY para operação ampla.

## Journal de avaliações — BASE SQL LOCAL_VERIFIED, NÃO INTEGRADA/NÃO PUBLICADA

Migration 009 implementa reserva durável por inscrição/tentativa com chave única e lease. Reserva anterior ao transporte pode ser retomada após expiração/backoff; dispatching vencido vira ambiguous, nunca nova autorização automática. A cota diária de São Paulo conta reservas, envios aceitos e resultados incertos entre requisições, inclui recibos anteriores à migração e não conta duas vezes o recibo salvo pelo journal. Uma reserva não atravessa a data local antes de iniciar o envio.

Begin revalida conta paga, régua ativa, contato elegível, ausência de reply/opt-out/review observado, vínculo exato com location ativa e lease válido. Salva hash do conteúdo e identidade do canal antes do transporte. Settle exige ID do provedor, salva recibo + tentativa + próxima data em uma transação; repetição do mesmo recibo é segura, ID conflitante é recusado. A programação usa o primeiro envio como âncora D+3/D+7, ajusta fim de semana e impede recuperação tardia disparar tentativas no mesmo dia. Três aceites encerram a régua.

Stop serializa pela mesma conta e grava evento, contato, inscrição e cancelamento da reserva juntos. Resultado tardio de um envio já iniciado pode ser salvo sem desfazer opt-out/reply. Uma parada durante transporte não prova que a chamada externa foi cancelada: fica resultado incerto até recibo/reconciliação. Isso é tratado como limite real, não garantia de ausência de envio. Nenhum transporte foi executado nesta etapa.

18/18 testes passaram com PostgreSQL 17 real e duas sessões concorrentes, relógio sintético explícito somente na fixture e sem credenciais de fornecedor. Cobertura: mesma tentativa, última vaga da cota, recibo perdido/falha de gravação, retomada antes do transporte, bloqueio após início, lease nulo, parada atômica/falha injetada, opt-out e recibo tardio, escopo de negócio, privilégios e término após três tentativas. Logs /private/tmp/meulocal-review-delivery-db-{red,green,final,checkpoint,final17,final18}.log. Parser do harness compartilhado passou a interpretar SQL NULL como null; os seis erros do primeiro green eram desse parser, não autorização de reenvio. Bancos e tentativas preservados. TypeScript não repetido: nenhuma alteração TypeScript neste checkpoint.

IMPORTANTE: o cron atual e o ramo de avaliações do webhook AINDA usam a implementação anterior. Esta migration isolada não corrige o fluxo servido e não deve ser publicada como pronta. Próxima execução deve integrar a rota real: flag de envio desabilitada por padrão, claim/begin/settle/fail, prazo total limitado, leitura final do contato/DND e histórico com identidade/cursor (não texto/horário aproximado), nenhum fallback após falha ambígua, e ingestão/parada atômica antes do retorno por duplicata. Testar com transporte simulado e falha após aceite, depois ligar recuperação periódica restrita e visibilidade no admin.

Fontes oficiais consultadas apenas para confirmar contratos existentes: https://marketplace.gohighlevel.com/docs/ghl/contacts/get-contact/ , https://marketplace.gohighlevel.com/docs/ghl/conversations/search-conversation/ e https://marketplace.gohighlevel.com/docs/ghl/conversations/get-messages/index.html . Nenhuma chamada real de contato/envio foi feita. Migração remota, cron em produção, deploy, flags, workflow e cobrança continuam sem alteração. Não restaurar aplicação anterior com cron inseguro ativo: o plano de rollback deve preservar recibos e pausar previamente a régua ao voltar a uma versão que ignora o novo gate.

Regressão do harness compartilhado: primeira execução 13/14, falha pontual de conexão ao Docker no primeiro teste. Inspeção confirmou o MESMO container running e label codex.owner=meulocal-platform-20261015; nenhum reinício/recriação. Nova execução fechou 14/14 (meulocal-review-base-harness-regression-retry.log). Falha original preservada em meulocal-review-base-harness-regression.log.

## Cron, recuperação e inbound de avaliações ligados — LOCAL_VERIFIED, NÃO PUBLICADO

Novo processNextReviewDelivery é usado pela rota real /api/cron/review-requests e pela recuperação HMAC existente. MEULOCAL_REVIEW_OUTREACH_ENABLED precisa ser exatamente true; ausente/false retorna disabled antes de qualquer consulta, upsert ou transporte. Nenhuma configuração externa foi alterada e a flag não foi habilitada. No máximo uma chamada de envio por invocação, com orçamento de preparação, HTTP limitado e SQL serializado. Rotação por última conferência evita monopolização por negócio sem trabalho; health inclui resultados incertos sem afirmar recuperação concluída. A migration 009 foi ampliada ANTES da primeira aplicação remota, com checked_at, seleção global e health service-only.

A leitura final do provedor confere ID/location/canal/identidade e DND explícito, após histórico completo até a ativação. Busca truncada, cursor inválido, escopo estrangeiro, corpo sem metadados de paginação ou dado desconhecido recusam envio. Inbound/SAIR encontrado salva parada local com o ID imutável, sem responder. Begin também consulta ghl_events do mesmo contato/location para impedir despacho se um inbound chegou depois da leitura. A janela distribuída após begin e durante HTTP é tratada como em curso: STOP posterior encerra o futuro, mas não comprova cancelamento da chamada já iniciada.

Não há fallback WhatsApp→e-mail, nem nova chamada após timeout/ID ausente/falha de salvamento. Aceite seguido de erro fica ambiguous; perda da resposta APÓS commit mantém recibo sent e impede repetição. Novo contato só ganha vínculo pelo mesmo begin transacional; dados de base não são executados como HTML no e-mail. Preparação falha pode retomar após backoff sem gastar outra inscrição/tentativa. Capacidade diária acumula chamadas/reservas e nunca envia antes das 09h de São Paulo, preservando o horário do cron existente; lembretes derivam do primeiro envio e encerram após três aceites.

Webhook agora resolve avaliações antes do insert/atalho por duplicata do fluxo antigo. Migration 010 salva ghl_events + recibo + parada/enrollment/cancelamento em uma transação. IDs ausentes são recusados. Mesmo ID com fatos/conteúdo diferentes é 409; mesmo corpo com IDs distintos permanece separado. Journal legado parcial só é retomado com escopo/fatos/conteúdo verificáveis; preview antigo truncado exige reconciliação. Sent/delivered do mesmo ID recebem chaves de recibo por mensagem+tipo+status, preservando o ID original em metadados, sem inferir mensagem por texto/tempo.

Verificação focada: journal SQL 19/19; processador real + adaptador HTTP HighLevel real + SQL 14/14; webhook real + SQL 9/9; cron 4/4; recuperação HMAC 10/10; worker 5/5; regressão controlada 29/29. Total 90 casos distintos; fornecedores/Auth/relógio isolados onde indicado, PostgreSQL real. TypeScript --noEmit --incremental false exit 0. O primeiro red do processador/webhook reproduziu módulos/transação ausentes; logs preservados. Logs finais: /private/tmp/meulocal-review-delivery-db-integration-final.log, /private/tmp/meulocal-review-processor-webhook-final.log, /private/tmp/meulocal-review-routes-recovery.log, /private/tmp/meulocal-review-controlled-final.log e /private/tmp/meulocal-review-integration-typecheck.log. Permissões dos novos RPCs conferidas em execução focada separada, sem repetir os cenários restantes.

Nenhuma prova real de transporte, cadência, recebimento nativo de avaliações ou migração remota foi produzida. Antes de liberar: comprovar o ingresso real das respostas de avaliações (o workflow controlado atual não é prova de cobertura de clientes), deixar pendências/recibos e reconciliação consultáveis no admin existente, fechar approve/dispatch/acquisition gates, diagnóstico/login/navegador e revisão/regressão/lint/build consolidados. Depois: migrações/runtime/deploy/corte/merge autorizados e prova externa exclusivamente Teste22, com confirmação das permissões antes do teste. Pagamento real continua sem evento anterior/sandbox autorizado. Escopo do goal não foi reduzido.


## Admin e orientações OpenDots — LOCAL_VERIFIED, NÃO PUBLICADO

Removido efeito que chamava dispatch-pending automaticamente ao abrir/atualizar o admin com diagnósticos aprovados. Ações manuais antigas não foram liberadas ou consideradas seguras por esta correção; os gates de aquisição continuam na próxima etapa. Overview agora recusa falha em qualquer fonte em vez de produzir zeros/normalidade e rotula os indicadores como amostra recente. Nomes das colunas de ghl_locations/ghl_provisioning_jobs conferidos por OpenAPI somente leitura no projeto vznecxfmnthyxvsxwpzi; sem acesso aos registros ou alteração remota.

Aba Supervisão usa o cookie administrativo existente e GET privado no-store. Pendências mais antigas e decisões concluídas mais recentes são consultadas separadamente, até 20 de cada com contagens exatas, sem esconder pendências antigas atrás de conclusões recentes. Falhas de leitura têm estado indisponível/retry, nunca zero fictício. Não expõe payload, segredo ou erro interno. Cookie malformado retorna não autorizado.

Runtime retorna somente orientação limitada da decisão já salva (mensagem, justificativa, revisão humana obrigatória e caminho permitido). Bridge verifica recibo/evento e path do evento de lifecycle e preserva a orientação; settle a salva no receipt existente. Admin renderiza texto e links /onboarding ou /dashboard sem nova ação de envio/ativação. Recibos antigos sem orientação continuam válidos e a tela declara a ausência; nenhum backfill ou replay de produção executado. Nenhum botão de aprovação/execução foi acrescentado.

51 casos focados distintos: admin/API/React 9; handler/bridge 30; receptor HTTP 9; outbox com PostgreSQL real 3. TypeScript --noEmit --incremental false exit 0. Escopo local: SDK/handlers reais, fornecedores/identidade sintéticos e SQL isolado. Logs /private/tmp/meulocal-admin-supervision-ui-api-final.log, /private/tmp/meulocal-admin-supervision-final.log (39 = admin 9 + handler/bridge 30), /private/tmp/meulocal-admin-guidance-http-final.log, /private/tmp/meulocal-admin-guidance-postgres.log e /private/tmp/meulocal-admin-supervision-typecheck.log. Red do admin reproduziu disparo automático e operação normal após erro; red overview reproduziu retorno 200 após falha de fonte. Listener HTTP bloqueado pelo sandbox foi executado com permissão normal fora do sandbox, sem contornar controles. Todas as tentativas preservadas.

Restam consulta de ambiguidades de avaliações/pagamentos no admin, gates/idempotência de aquisição, diagnóstico/login/navegador, revisão/regressão/lint/build consolidados e publicação coordenada/rollback/prova externa. NÃO pronto para operação ampla. Nenhuma migração remota, alteração da VPS, deploy, envio ou cobrança nesta etapa.


## Aquisição — BLOQUEIO PADRÃO LOCAL_VERIFIED; RETOMADA DE ENVIO AINDA PENDENTE

Comparei os patches preservados do checkout original sem incorporá-los em bloco. Gates mínimos adicionados após autenticação e antes de body/DB/provedor: approve e dispatch-pending exigem MEULOCAL_PROSPECT_INITIAL_OUTREACH_ENABLED exatamente true; acquisition-outreach exige MEULOCAL_ACQUISITION_OUTREACH_ENABLED exatamente true; reply e send-approved-email exigem MEULOCAL_MANUAL_OUTREACH_ENABLED exatamente true. Ausência, false, 1, TRUE ou espaços não habilitam. Rotas manuais respondem 423 com processed=0/contactStarted=false/outreach_disabled; cron autenticado responde estado disabled sem executar trabalho. Nenhuma variável de produção foi habilitada ou alterada. Approve permanece integralmente bloqueado enquanto desativado porque a implementação atual combina preparação e envio; a separação necessária é pendente, não uma jornada de diagnóstico aprovada.

10/10 testes dos handlers reais com traps para DB/provedor, incluindo todos os verbos publicados e autenticação antes do gate. Red reproduziu cinco caminhos sem bloqueio; green confirmou zero body/DB/provider em desativação. TypeScript --noEmit --incremental false exit 0, diff --check limpo. Logs /private/tmp/meulocal-acquisition-gates-{red,final}.log e /private/tmp/meulocal-acquisition-gates-typecheck.log. Não repetidas suítes já aprovadas sem relação com esta alteração.

ATENÇÃO: flag true ainda acessa o transporte legado, sem claim durável, com riscos de repetição/identidade/DND/erro de reconciliação. NÃO habilitar nem declarar idempotência dos caminhos de envio. Próxima correção deve preservar diagnóstico sem contato automático, introduzir/respeitar identidade durável da tentativa antes do efeito e não repetir após resultado incerto. O cron legado também continua após falha de consulta de respostas; deve falhar fechado nesse caso. Não houve envio ou chamada de provedor. Gates de aquisição do plano continuam PARCIAIS, não concluídos.


## Preparação de diagnóstico separada de contato — LOCAL_VERIFIED, NÃO PUBLICADA

Substituído approve, que misturava insert do diagnóstico, descoberta de e-mail/telefone e enqueue/envio HighLevel. Agora é preparação administrativa autenticada por uma única transação service-role prepare_prospect_diagnostics (migration 011). Não consulta canais nem provedores, não concede consentimento, não cria inscrições, não marca contato enviado e não chama OpenDots. Nem MEULOCAL_PROSPECT_INITIAL_OUTREACH_ENABLED=true muda esse contrato. O bloqueio integral de approve registrado no checkpoint anterior foi superado por esta separação; dispatch-pending/cron/manual continuam bloqueados por padrão.

A transação trava places em ordem estável, reutiliza diagnóstico/token/empresa/lead e cria o vínculo ausente em conjunto. Duas sessões reais concorrentes convergem. Uma aprovação repetida não sobrescreve evidência anterior, consentimento, opt-out, conversão ou agenda. Histórico com múltiplos diagnósticos/leads ou vínculo entre empresas conflitante é recusado para conferência, sem escolher por nome/horário nem inserir outro. Falha crítica desfaz todos os inserts; nova tentativa é possível. O navegador recebe links relativos dos tokens persistidos. Admin tem ação Salvar diagnósticos distinta de preparar abordagens; apresenta links e informa zero contatos. Erro mantém seleção para retry, sem alegar salvamento.

Verificação focada: 14/14 rota real + PostgreSQL isolado (duas sessões concorrentes); 11/11 admin/API/handlers React; 8/8 gates restantes de transporte. Total 33 casos distintos. TypeScript --noEmit --incremental false exit 0, diff --check limpo. Red inicial preparação 0/11; logs /private/tmp/meulocal-prospect-preparation-{red,green,final}.log, /private/tmp/meulocal-prospect-admin-final.log, /private/tmp/meulocal-prospect-admin-gates.log e /private/tmp/meulocal-prospect-preparation-typecheck.log. Autenticação/fornecedores são isolados; não houve criação de contatos, cobranças, mensagens ou migração remota. Esta prova não substitui diagnóstico real no navegador/provedor.

Próxima ação: fechar dispatch-pending/cadência/manual com reserva durável e estado incerto após início, antes de qualquer chamada real, supressão/reply/DND revalidados sem fallback. Reusar outreach_events e regras existentes, sem nova campanha ou ativação. Pendências/ambiguidades devem ficar consultáveis no admin. Continuam obrigatórios diagnóstico/login/navegador, revisão/regressão/lint/build, publicação coordenada e ensaio de rollback, novo inbound real Teste22 autorizado e prova financeira externa quando houver sandbox/pagamento genuíno. Goal completo preservado, ainda NOT_READY.
