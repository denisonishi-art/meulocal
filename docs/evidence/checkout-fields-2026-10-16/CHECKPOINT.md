# Contratação sem diagnóstico obrigatório — 16/10/2026 (São Paulo)

Base: origin/main 5f5d07fca45bdea7554ab5c38f168f32cf83ea6e, incluindo os links de pagamento confirmados da PR #19. Implementação isolada para preservar o checkout original e suas 78 entradas pendentes.

## Ajuste

- Plano, nome, e-mail e WhatsApp com largura total, altura 52 px, rótulos separados, foco visível e espaçamento entre campos.
- Acesso a /contratar?plan=essencial ou inteligencia não exige diagnóstico nem IDs de lead/negócio.
- Botão navega ao link público Asaas correspondente já usado na home. Não cria checkout pela API legada nem muda preços, links, assinaturas, webhooks ou permissões do provedor.
- Contexto anterior de diagnóstico continua opcional para preencher os campos, com e-mail editável. Os dados de cobrança são confirmados no Asaas: os campos desta página não são transmitidos automaticamente ao link público, e não há PII na URL. Nenhuma compatibilidade de prefill não documentada foi presumida.
- Plano desconhecido continua bloqueado até escolha de uma opção válida. Nome/e-mail têm validação HTML; WhatsApp é opcional.

## Verificação

- 12/12 testes existentes de planos passaram: catálogo, valores oficiais, callbacks, conflitos/idempotência do checkout legado e disponibilidade.
- Navegador: sete cenários passaram, nos dois planos e em desktop 1366 px/mobile 390 px; destinos Asaas interceptados localmente, sem chamadas reais ao provedor. Testa campos obrigatórios, troca de plano, plano inválido, dimensões/espaçamento, ausência de overflow, contexto opcional e ausência de chamadas à API.
- TypeScript e build passaram. Lint com dois avisos de hooks já existentes; build também preserva aviso CSS global anterior.
- Tentativa inicial do script legado de reservas foi interrompida pelo guard owned_platform_container_required porque seu ambiente PostgreSQL obrigatório não foi informado. Esse script não foi contado como aprovado; banco, RPCs e rota de reserva não foram alterados neste ajuste. A validação pertinente usa o teste atual de planos e o formulário real no navegador.
- Screenshots contêm apenas dados sintéticos. Não houve pagamento, cobrança, envio, mudança de infraestrutura nem publicação em produção.

## Limites

Esta validação comprova layout e seleção do destino; não comprova pagamento, webhook, convite ou onboarding reais. O checkout de cobrança final continua no Asaas. Preparação inicial concluída; publicação posterior expressamente autorizada pelo usuário e comprovada abaixo.


## Publicação autorizada — 16/10/2026, São Paulo

PR #20 mesclada; commit de produção f1d48028ca5835d30af6c634bcc5624f7f121d40. CI, GitGuardian e preview passaram antes da integração. O deployment dpl_HC6nKJxgriHwKYeJG5ynDV28dJuh está READY e tem o domínio meulocal.ia.br confirmado pela API administrativa da Vercel.

Sete cenários passaram novamente no domínio publicado, nos dois planos e em desktop/mobile. A navegação Asaas foi interceptada antes de sair do navegador: nenhum acesso real ao provedor, cobrança, alteração de contato ou envio foi executado. Isso comprova formulário e destino do link, não pagamento/onboarding reais. Imagens e resultados em production-browser.json, production-desktop.png e production-mobile.png.

Nenhuma variável de ambiente, configuração Asaas, preço, workflow ou migration foi alterada. Checkout original preservado em feat/opendots-prospeccao-meulocal, HEAD 6ad83bb e 78 entradas pendentes.

Rollback de aplicação: deployment anterior dpl_3ea6ov9LRwMCA65snwLzi2t2eE2o (commit 5f5d07fca45bdea7554ab5c38f168f32cf83ea6e), guardado em deployment-before.json. Não usar o checkout original antigo como rollback. Não há alteração de banco a reverter.
