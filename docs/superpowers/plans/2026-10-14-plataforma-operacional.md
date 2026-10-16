# MeuLocal operacional — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans para executar este plano por checkpoints, com um executor principal. A preferência expressa do usuário substitui a recomendação de agentes por tarefa. Revisão independente no fechamento, sem duplicar suítes já comprovadas.

**Goal:** Entregar e comprovar a jornada existente do MeuLocal em produção, com OpenDots supervisionado, recuperação de falhas e estados confiáveis do primeiro acesso ao painel.

**Architecture:** Reutilizar Next.js/Vercel, Supabase, HighLevel, Asaas, Google Business Profile e o container OpenDots existente na VPS. Aproveitar a PR #6 para inbound e eventos de pagamento/onboarding; corrigir os pontos de falha nos fluxos existentes. Nenhum novo produto, infraestrutura paga ou mecanismo de onboarding paralelo.

**Tech Stack:** Next.js 14.2.35, React 18, TypeScript, Supabase/PostgreSQL, HighLevel, Asaas, Google Business Profile, runtime Node da VPS.

**Spec:** Contrato de entrega abaixo, pedido do usuário de 14/10/2026 e autorização anterior para modo supervisionado. Fontes técnicas: `docs/evidence/highlevel-recovery-lifecycle-2026-10-15/CHECKPOINT.md`, `ROLLBACK.md` na mesma pasta, PR #6 e `docs/plano-recuperacao-funil-2026-10-12.md` (histórico a confrontar com produção).

## Global Constraints

- Este documento é uma proposta. Sua criação não autoriza nem executa publicação.
- Após aprovação: executar continuamente correções necessárias, testes, migrações aditivas, atualização do runtime existente, deploys, configuração técnica de webhook e merge das PRs deste escopo, observados os gates abaixo.
- Um executor principal; preservar worktrees, alterações pendentes, evidências e rollback. Trabalhar na branch isolada existente e nunca publicar o checkout original inteiro.
- Vercel pela CLI autenticada, equipe `denisonishi-8130s-projects`, projeto `prj_tTEcf7eWDIAPt7Q1vZ3Qmawu8QSp`. Não repetir o conector que respondeu 404.
- Supabase exclusivo `vznecxfmnthyxvsxwpzi`. Confirmar identidade antes de cada migração e consulta privilegiada.
- HighLevel location `uNh3KsM7WFuLeTN8Q583`; teste externo de mensagens exclusivamente com Teste22 2, contato `SdJ2oWZqsReI1TTq4cAd`.
- OpenDots registra orientações, exige revisão humana e aponta para `/onboarding` ou `/dashboard`; não envia, responde automaticamente, cobra, convida ou ativa contas por decisão própria.
- Não enviar mensagens comerciais, ativar campanhas, efetuar cobranças reais ou inscrever bases reais em automações. Não disparar convites por replay de produção sem destinatário e ação autorizados.
- Consentimento OAuth, instalação com autorização humana do provedor, novo custo, cobrança e teste de envio real exigem a participação/autorização correspondente. Aprovar este plano não contorna essas fronteiras.
- Verificar presença, escopo e funcionamento das credenciais sem imprimir valores; arquivos privados fora do Git e do relatório público.
- Nenhuma liberação baseada apenas em HTTP 200, build, teste simulado ou ausência de erro na tela.

## Contrato de entrega e limites de “100%”

O aceite cobre todos os fluxos atuais listados abaixo. Cada item terá versão testada, resultado, IDs de evidência e classificação: `REAL_VERIFIED`, `LOCAL_VERIFIED`, `BLOCKED_EXTERNAL` ou `NOT_VERIFIED`. Um item bloqueado não conta como aprovado.

“Pronta para operação supervisionada” significa que a jornada aprovada funciona, persiste seus estados, retoma falhas e não produz ações externas sem autorização. Operação comercial completa também exige prova controlada dos envios e da cobrança reais; essas ações continuam sujeitas às restrições do usuário. Não anunciar “100% da plataforma” se alguma função essencial permanecer apenas simulada ou bloqueada.

| Jornada existente | Aceite necessário |
| --- | --- |
| Diagnóstico e lead | Busca/análise existentes, resultado persistido, link correto, lead associado ao negócio sem duplicação indevida ou exposição entre empresas. |
| Inbound HighLevel | Mensagem real identificada pelo provedor, autenticação válida, vínculo único, persistência no Supabase e recibo próprio OpenDots com o mesmo ID. |
| Retomada e SAIR/STOP | Falha parcial recuperável; repetição sem duplicar processamento; opt-out terminal; mensagens iguais com IDs distintos não se confundem. |
| Contratação e pagamento | Checkout correto; evento autenticado e associado; processamento retomável; acesso vinculado à pessoa e negócio certos; nenhum sucesso fictício. |
| Login e acesso | Sessão, recuperação e vínculo funcionam; autorização aplicada no backend; conta sem direito de acesso não ultrapassa o gate. |
| Onboarding e Google | Etapas persistidas; OAuth/unidade pertencentes à conta; primeira sincronização comprovada; falha não vira conclusão na interface. |
| Base e avaliações | Importação, confirmação, deduplicação, isolamento e preparação funcionam. Ativação/envio real permanecem fechados até aprovação específica. |
| Painel e administração | Dados reais da empresa autenticada, estados de falha/espera legíveis e orientação supervisionada consultável no ambiente existente. |
| Operação | Fila retomável com frequência demonstrada, crons autenticados, erros rastreáveis e rollback ensaiado. |

## Estado inicial comprovado

- Um inbound controlado anterior foi rastreado ponta a ponta. Isso não comprova a versão nova nem a plataforma inteira.
- PR #5 foi incorporada à base. PR #6 está em rascunho: `https://github.com/denisonishi-art/meulocal/pull/6`.
- Branch isolada: `codex/highlevel-recovery-lifecycle`, em `/Users/denisonishi/.codex/worktrees/highlevel-opendots-inbound/meulocal`. Checkpoint lido: commit `1e51e8e6d318173d27f1d377cb6f05b166b4163f`; implementação `e49e31e`.
- A PR #6 contém as três correções e a ligação supervisionada com estados persistidos de pagamento/onboarding. Checkpoint registra 25 testes de contrato, 7 HTTP e 9 PostgreSQL aprovados, TypeScript/build aprovados e revisão independente sem finding remanescente. Não foram executados novamente para elaborar este plano.
- Migração remota, novo runtime e publicação dessa PR ainda não foram executados. Lint não está configurado na base e continua uma lacuna de fechamento.
- O workflow Customer Replied observado fornece corpo, mas nenhuma âncora imutável comprovada. Apps instalados e integrações privadas foram inspecionados; o acesso a uma assinatura administrável InboundMessage no portal do desenvolvedor ainda precisa ser comprovado. Não se concluiu que ela inexiste.
- Inspeção atual do código também mostra: `payment_events.processed_at` é gravado antes da ativação, duplicatas retornam sem retomá-la; a tela de onboarding avança ao concluir mesmo se a gravação falhar. Esses comportamentos precisam de correção e regressão específicas.
- O cron diário da PR #6 drena no máximo dois jobs por execução. Isso exige ajuste ou aceite explícito da latência; não comprova prontidão operacional imediata.

## Etapa 1 — Fixar a versão de entrega e conferir os gates externos

**Arquivos:** ler `AGENTS.md`, `package.json`, `vercel.json`, os dois checkpoints citados e a configuração vinculada da Vercel; criar `docs/evidence/platform-operational-2026-10-14/ACCEPTANCE.md` e `CHECKPOINT.md` na branch isolada durante a execução.

**Interface de saída:** matriz de jornadas com evidência, versão e pendência; manifesto de rollback com os identificadores exatos dos recursos alteráveis.

- [ ] Conferir branch, diff, HEAD e estado de produção; incorporar este plano à branch isolada sem transportar arquivos pendentes do checkout original.
- [ ] Conferir Vercel pela CLI com equipe/projeto explícitos; testar acesso administrativo ao Supabase correto, VPS, HighLevel, Asaas e Google conforme a próxima ação, sem varrer segredos ou dados de outros projetos.
- [ ] Conferir `GHL_WEBHOOK_SECRET`, `OPENDOTS_COMMERCIAL_URL`, `OPENDOTS_COMMERCIAL_SECRET`, `CRON_SECRET` e as variáveis dos fluxos de pagamento/Google pelos nomes referenciados no código. Registrar apenas presença, ambiente e resultado da validação.
- [ ] Preservar configuração completa do workflow, deployment atual, migrações, código/configuração do container e referências dos registros existentes. Backups privados devem conservar permissões restritas.
- [ ] Inspecionar o app/portal de desenvolvedor HighLevel existente e os controles reais de configurar, salvar, instalar e publicar. Priorizar a assinatura nativa existente. Se faltar app próprio, preparar a configuração mínima de app privado para a mesma infraestrutura; instalar somente com os scopes necessários e consentimento do administrador.
- [ ] Registrar dependências humanas reais imediatamente, continuar as correções locais independentes e não repetir tentativas de acesso sem mudança relevante.

**Gate:** versão e recursos inequivocamente identificados; bloqueios externos com causa e próximo ato administrativo concretos. Esta etapa não reabre decisões já aprovadas.

## Etapa 2 — Fechar identidade, retomada e conclusão do inbound

**Arquivos existentes:** `app/api/webhooks/highlevel/route.ts`, `lib/ghl-controlled-inbound.ts`, `lib/highlevel-operational.ts`, `lib/agents/opendots-{outbox,commercial-bridge}.ts`, `supabase/migrations/20261015_opendots_durable_handoffs.sql`, `scripts/opendots-worker/commercial-*`, `scripts/check-controlled-inbound.cjs`, `scripts/check-opendots-database.cjs`.

**Interfaces:** entrada autenticada com `locationId`, `contactId`, ID real da mensagem e/ou `dateAdded` imutável; saída durável ligada ao mesmo evento. O adaptador preparado usa `POST /api/webhooks/highlevel?controlled_native=1` e limita gravações ao contato controlado e tag atual consultada no provedor.

- [ ] Reutilizar os três patches já revisados; acrescentar testes apenas se o contrato real revelar diferença. Não refazer as implementações.
- [ ] Confirmar que a assinatura nativa realmente entrega mensagens de WhatsApp dessa location com identificação imutável. Documentação/schema e presença de app sozinhos não satisfazem esse gate.
- [ ] Preparar a assinatura sem apontar tráfego amplo ao handler antigo. Antes de habilitá-la, publicar o receptor compatível e filtrado na ordem da etapa 6; preservar/desabilitar somente a entrada legada controlada durante a troca, com possibilidade de rollback.
- [ ] Se não houver assinatura utilizável, verificar a menor alternativa com o histórico já autorizado: leitura incremental de IDs reais no runtime existente, persistindo cursor e deduplicação, processando todas as mensagens inéditas do contato controlado. Não inferir “a última mensagem” pelo corpo ou horário de execução. Documentar a escolha e usar uma única entrada operacional.
- [ ] Manter o workflow legado preservado; só republicá-lo com payload válido. Se a entrada nativa o substituir, registrar sua desativação controlada e não publicar um fluxo que falhará por ausência de ID.
- [ ] Executar os testes focados afetados, incluindo duas mensagens com mesmo corpo/IDs diferentes, atraso, duplicata, lead ambíguo, assinatura inválida, outra location/contato, lease expirado, falha de persistência e limpeza de tags após recibo salvo.
- [ ] Comprovar STOP/SAIR terminal e idempotente nos testes locais reais de banco; não alterar opt-out de produção para facilitar reteste. Um teste real de STOP no Teste22 exige concordância com o encerramento da elegibilidade desse contato.

Comandos existentes, executados no checkpoint necessário:

```sh
node scripts/check-controlled-inbound.cjs
node --test scripts/opendots-worker/commercial-server.test.mjs
node scripts/check-opendots-database.cjs
```

O último comando exige PostgreSQL isolado com `OPENDOTS_TEST_PG_CONTAINER` conforme o script. Criar/remover apenas recurso temporário com propriedade verificada.

**Gate:** nenhum P1/P2 aberto nesses contratos; caminho real de identidade comprovado no teste externo da etapa 6. Se não houver âncora confiável, manter o bloqueio explícito e a produção anterior preservada.

## Etapa 3 — Tornar pagamento e acesso retomáveis

**Arquivos:** `app/api/webhooks/asaas/route.ts`, `app/api/payments/checkout/route.ts`, `app/api/customer-access/claim/route.ts`, `lib/customer-context.ts`, `lib/payments/asaas.ts`; criar `scripts/check-payment-lifecycle.cjs`; migration aditiva própria se o estado de processamento exigir colunas/RPC.

**Interfaces:** evento Asaas autenticado + identidade externa persistida → checkout/conta associados + progresso de ativação recuperável. OpenDots observa somente pagamento e acesso efetivamente persistidos, usando a fila da PR #6.

- [ ] Escrever e executar primeiro regressões que reproduzam: falha de convite seguida do mesmo evento; erro de update após pagamento; duas execuções concorrentes; dois eventos de confirmação do mesmo pagamento; associação ausente ou ambígua; evento de outra assinatura/link.
- [ ] Separar recebimento, processamento e conclusão do evento. Uma duplicata incompleta deve retomar o trabalho pendente; uma concluída deve reutilizar o resultado persistido.
- [ ] Verificar cada escrita crítica e recusar conclusão quando a conta/usuário/checkout não estiverem vinculados corretamente. Serializar a ativação concorrente e preservar tentativas/erro para retomada, sem duplicar convite deliberadamente.
- [ ] Corrigir associação ambígua sem escolher negócio arbitrário; preservar a regra comercial de elegibilidade e não resetar onboarding de conta já ativa durante reconciliação.
- [ ] Cobrir sessão inválida, e-mail não confirmado, claim concorrente, conta pendente/cancelada e acesso a outro negócio. Preservar a política de cobrança existente; não inventar novas tolerâncias ou suspensões.
- [ ] Conferir webhook registrado, autenticação e evidência de pagamento no provedor. Usar sandbox ou pagamento genuíno já existente autorizado; não fabricar um pagamento confirmado no banco de produção.
- [ ] Testar convite/recuperação somente em destinatário autorizado. Evidência local não vira prova de entrega de e-mail.

Exemplo do resultado obrigatório da regressão, verificado pelo novo harness com falha injetada antes da primeira ativação e repetição do mesmo ID:

```js
assert.equal(afterRetry.paymentStatus, 'active');
assert.equal(afterRetry.checkoutCount, 1);
assert.equal(afterRetry.linkedUserCount, 1);
assert.equal(afterRetry.completedEventCount, 1);
assert.equal(afterRetry.paymentHandoffCount, 1);
```

Executar `node scripts/check-payment-lifecycle.cjs`. Não reproduzir o cenário de convite falho contra pessoas reais.

**Gate:** pagamento e acesso têm retomada demonstrada, vínculo único e nenhum falso sucesso. Dependência de consentimento/conta de teste é registrada como bloqueio externo, não ignorada.

## Etapa 4 — Concluir onboarding, Google e painel nas telas existentes

**Arquivos:** `app/login/page.tsx`, `app/onboarding/page.tsx`, `app/onboarding/CustomerBaseSetup.tsx`, `app/dashboard/page.tsx`, `app/api/onboarding/status/route.ts`, `app/api/google-business/{connect,callback,locations,select,sync,disconnect}/route.ts`, `app/api/customer-dashboard/route.ts`, `lib/google-business-server.ts`; criar `scripts/check-customer-journey.cjs`.

**Interfaces:** sessão autenticada e conta elegível → status persistido, conexão Google da empresa certa, primeira sincronização e painel dessa empresa. Eventos OpenDots vêm das transições persistidas, nunca de um clique isolado.

- [ ] Reproduzir falha do GET de status e do POST de conclusão. Corrigir a tela para distinguir erro de consulta, pagamento pendente e gravação malsucedida; avançar ou mostrar “concluído” apenas após sucesso persistido.
- [ ] Validar também “Fazer isso depois”: base continua opcional, sem afirmar automação ativa quando não foi ativada. Recarregar a página deve recuperar o estado verdadeiro.
- [ ] Conferir callback OAuth, state vinculado à sessão/conta, seleção de unidade autorizada e armazenamento seguro dos tokens. Executar consentimento real com o titular, sem contornar aprovação do Google.
- [ ] Comprovar sincronização e dados persistidos do Google; testar erro, expiração/revogação e repetição sem duplicar dados. Falta de permissão/quota do provedor deve aparecer como ação necessária.
- [ ] Validar login, recuperação, retorno do convite e painel pelo navegador real. Conferir que as consultas e números correspondem ao negócio autenticado e que outra conta não acessa seus dados.
- [ ] Conferir que OpenDots salva orientação de pagamento/onboarding e que o operador consegue consultá-la no admin existente. Se faltar visualização, acrescentar somente essa leitura autenticada no painel existente, sem permitir execução automática.
- [ ] Executar `node scripts/check-customer-journey.cjs`, cobrindo status HTTP e persistência, e guardar a evidência de navegador sem tokens ou dados pessoais desnecessários.

**Gate:** jornada persistida e retomável; conta paga autorizada chega ao painel com dados reais. Google sem consentimento ou sincronização real permanece bloqueado para aceite dessa função.

## Etapa 5 — Fechar a operação de base, filas e automações com segurança

**Arquivos:** `app/api/customer-base/{import,confirm,activate}/route.ts`, `app/api/cron/{review-requests,acquisition-outreach,acquisition-replies,google-sync,opendots}/route.ts`, `app/api/agents/prospect/{approve,dispatch-pending}/route.ts`, `lib/agents/opendots-outbox.ts`, `app/admin/page.tsx`, `vercel.json`; criar `scripts/check-operational-gates.cjs`. Reusar patches preservados do plano de recuperação após comparar com a base atual; não incorporá-los em bloco.

**Interfaces:** tarefas elegíveis e autorizadas → claim, execução rastreada, resultado persistido ou reconciliação pendente. Falha ambígua de envio nunca autoriza repetição cega ou fallback que possa duplicá-lo.

- [ ] Importar fixtures sem pessoas reais; comprovar validação, deduplicação e isolamento por negócio. Confirmar que confirmação e ativação repetidas/concorrentes não criam inscrições duplicadas ou estados parciais silenciosos.
- [ ] Confrontar o cron de avaliações com concorrência, limite diário cumulativo, opt-out/reply antes do envio e erro após aceite do provedor. Corrigir somente os defeitos demonstrados; não tratar ausência de recibo como garantia de que nada foi enviado.
- [ ] Reaproveitar os gates de aquisição já preparados: abrir admin não dispara envio; approve/dispatch/cron respeitam autorização, supressão, parada por resposta e idempotência. Não ativar a prospecção para provar esses gates.
- [ ] Conferir a ligação de respostas e opt-out aos registros de avaliações, além dos leads de aquisição. Não declarar parada comprovada apenas porque existe SAIR no texto de uma mensagem.
- [ ] Substituir a dependência operacional de dois jobs/dia por entrega após commit com limite de tempo e retomada durável no runtime existente, ou worker supervisionado na VPS existente. Escolher a menor opção compatível com o ambiente; não criar cron pago nem duplicar consumidores sem lease.
- [ ] Medir a latência em um evento controlado e num backlog local; demonstrar que queda/reinício não perde jobs e que backlog/erro/última conclusão ficam consultáveis no admin existente. Registrar a frequência real de recuperação; não prometer uma frequência que o deploy não executa.
- [ ] Ensaiar os gates de envio com transporte de teste isolado e sem credenciais reais. Não chamar manualmente crons que possam processar outras pessoas em produção.
- [ ] Executar `node scripts/check-operational-gates.cjs`. Se o aceite exigir envio real, preparar destinatário Teste22, conteúdo, canal e rollback e solicitar a autorização específica antes dessa ação; até lá registrar essa função como sem prova real de envio.

**Gate:** preparação e supervisão funcionam, nenhuma ação externa indevida e erros são retomáveis. Ativação comercial não é consequência automática do deploy.

## Etapa 6 — Publicar em ordem e comprovar a jornada ponta a ponta

**Arquivos:** migrations aditivas das etapas anteriores, evidências/rollback da PR #6 e `docs/evidence/platform-operational-2026-10-14/{ACCEPTANCE,CHECKPOINT,ROLLBACK}.md` na branch de execução.

- [ ] Consolidar commits por comportamento e revisar o diff contra a base publicada. Configurar lint não interativo compatível com a versão atual do projeto, sem upgrade de framework. Resolver os erros do escopo e registrar separadamente problemas anteriores demonstrados.
- [ ] Executar uma regressão consolidada dos contratos alterados, TypeScript, lint, build e `git diff --check`. Reutilizar resultados focados anteriores quando o código/dependências não mudaram; repetir por mudança ou dúvida concreta.
- [ ] Fazer revisão independente final do patch exato, focada em falhas parciais, pagamentos, isolamento, autorização e efeitos externos. Corrigir findings bloqueantes e reavaliar somente o que mudou.
- [ ] Preservar backup e conferir compatibilidade da migração com a aplicação anterior. Aplicar migrações aditivas ao Supabase correto; conferir RLS e permissões de RPC com anon/authenticated/service-role.
- [ ] Atualizar somente os arquivos do receptor no container OpenDots existente, preservando identidade, configuração, mounts e dados. Reiniciar o serviço e verificar o recibo persistente antes de liberar tráfego.
- [ ] Fazer o corte controlado do inbound conforme etapa 2, publicar a aplicação validada pela CLI Vercel com equipe/projeto explícitos e confirmar o commit realmente servido. Assinar/habilitar somente o ingresso compatível e filtrado; publicar workflow apenas quando o contrato for válido.
- [ ] Incorporar as PRs técnicas aprovadas pelo gate de revisão à main, garantir que o deployment final corresponda ao commit final e conferir os checks do provedor. A aprovação deste plano inclui esse merge; não pedir autorização novamente só por se tratar de main.
- [ ] Confirmar permissões efetivas e flags de execução antes do teste. Solicitar um inbound técnico único do Teste22 e rastrear o mesmo ID em HighLevel, Vercel, `ghl_events`, fila/lead e recibo próprio OpenDots na VPS. Comprovar zero resposta automática e zero envio novo causado pelo teste.
- [ ] Comprovar pagamento/acesso/onboarding usando a conta autorizada e eventos genuínos/sandbox identificados, conferindo cada transição nos registros e orientações OpenDots. Não mudar flags de pagamento manualmente para produzir uma aparência de sucesso.
- [ ] Ensaiar rollback com fixtures/ambiente isolado e verificar os comandos privados de reversão. Em produção, reverter aplicação/configuração quando necessário sem apagar recibos, eventos ou dados. Não remover tabelas/fila com jobs pendentes.
- [ ] Observar a execução controlada até seu estado terminal e uma retomada demonstrada; fechar a matriz com links/IDs, versão, limites e pendências. Recursos temporários só são removidos após conferir propriedade.

**Gate final:** nenhum P1/P2 aberto nas jornadas liberadas; testes obrigatórios aprovados; autenticação e isolamento comprovados; evento controlado recebido/processado/salvo nos quatro sistemas; pagamento/acesso/onboarding comprovados com evidência do tipo declarado; rollback disponível. Funções sem prova externa continuam explicitamente não liberadas.

## Sequência, prazo e decisões

1. Começar após aprovação pela conferência do acesso e contrato HighLevel, pois é o bloqueio conhecido da publicação da PR #6.
2. Enquanto depender de ato humano/provedor, avançar nas correções locais de pagamento, onboarding e gates operacionais. Não gastar tentativas repetidas no mesmo bloqueio.
3. Publicar somente os componentes cujos contratos e regressões estejam validados, sem interromper jornadas existentes para cumprir uma estimativa.
4. Informar progresso por marco: código pronto, publicado, comprovado externamente e liberado. Relatar bloqueio com causa comprovada e menor ação necessária.
5. Não há prazo fechado sustentado pela evidência atual. O primeiro checkpoint de execução deve confirmar as dependências de HighLevel, Google e conta de pagamento/teste e então fornecer uma previsão de entrega para o escopo verificável. Uma estimativa não será apresentada como garantia de serviço externo.

## Conferência deste plano

- [x] Contempla os três findings e reaproveita a implementação/revisão existentes.
- [x] Cobre diagnóstico, pagamento/acesso, onboarding/Google, base, painel e operação sem reconstruí-los.
- [x] Diferencia correção local, publicação e recebimento/processamento/persistência externos.
- [x] Preserva autorizações, modo supervisionado, segredos, checkout pendente e rollback.
- [x] Identifica a permissão humana necessária para cobrança, convite, consentimento e envio real; não a presume.
- [x] Não confunde aceite supervisionado com liberação comercial completa.
