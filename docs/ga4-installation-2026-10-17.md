# GA4 — instalação controlada em 2026-10-17

## Escopo autorizado

Usuário: “então pode instalar”. Instalar a medição da conta MeuLocal criada neste atendimento. Nenhum envio, migration, workflow, preço, Asaas ou operação comercial alterado. Usados os procedimentos de brainstorming (desenho limitado já autorizado), teste e verificação. Sem novas dependências.

## Desenho

- Conta 412347026 / propriedade 559363806 / fluxo 16147790415 / tag pública G-09EZKSRFRM.
- Apenas meulocal.ia.br e www.meulocal.ia.br; preview/localhost não medem.
- Lista fixa de páginas institucionais, diagnóstico e contratação. Login, painel, admin, onboarding, links individuais e API excluídos.
- Google somente carrega após “Aceitar medição”. “Recusar” tem igual disponibilidade. Preferências reabertas nas páginas públicas; escolha local por até 180 dias. Storage indisponível não concede permissão em visita futura.
- Consentimento publicitário e Google Signals desativados. Enhanced measurement estava desativado na criação do fluxo. Nenhum formulário é instrumentado.
- Pageviews manuais com títulos fixos e URLs sem query/fragmento; referrer externo reduzido à origem. Cada navegação pública efetiva gera no máximo um pageview. Parâmetros UTM e detalhes do referenciador não são preservados por este escopo mínimo.
- Retirada bloqueia medição pelo ga-disable e limpa cookies _ga e _ga_09EZKSRFRM. Rotas privadas bloqueiam o destino, inclusive se o script ainda estiver carregando.
- Política de privacidade atualizada com cookies, controles e link oficial Google. Isso não é certificação jurídica nem prova de outros scripts/integradores fora desta instalação.

## Base e preservação

- Base publicada confirmada: main f1d48028ca5835d30af6c634bcc5624f7f121d40, deployment dpl_HC6nKJxgriHwKYeJG5ynDV28dJuh.
- Preparação em diretório descartável criado de git archive da base vigente. Apenas arquivos GA4 são adicionados a essa base para publicação; não publica o diff pendente de e-mail/Google nem sua migration.
- Código também registrado no worktree existente codex/checkout-fields-direct-payment. Checkout original feat/opendots-prospeccao-meulocal e suas 78 entradas preservados.
- A publicação usa a configuração de produção já existente da Vercel. Variáveis OAuth adicionadas em bloco anterior também ficam disponíveis a novos builds; não foram criadas/alteradas neste bloco. A aprovação de API Google e o Google Business Profile continuam separados deste GA4.

## Validação local

- TDD: sete testes falharam por ausência da implementação; depois passaram. Acrescentado teste de escolha expirada/inválida. Resultado final: 8 analytics + 12 planos = 20 PASS.
- Navegador desktop e mobile: 10 cenários PASS no build de produção local, origin canônico encaminhado ao servidor local e script Google simulado. Zero eventos reais nesses cenários.
- Build, lint e TypeScript aprovados. Duas advertências de hooks preexistentes em DashboardClient e onboarding, sem erros novos.
- Suíte SQL check-checkout-reservation não executou: proteção exige configuração de container descartável, ausente nessa tentativa. Não é aprovação dessa suíte; não houve acesso ao Supabase remoto. Não necessária à alteração que não toca pagamentos/banco; testes de planos com mocks passaram.
- Screenshots desktop/mobile inspecionados.

## Publicação e prova real

Pendente de execução no momento deste registro. A confirmação será anexada em docs/evidence/ga4-2026-10-17/production.json.

Critérios: implantação Ready com domínio correto; sem requisição Google antes da escolha; visita controlada consentida gera page_view para a tag correta com URL saneada; recusa/retirada bloqueia eventos; confirmar separadamente recepção HTTP e exibição no GA4 Realtime. Um HTTP 204 não comprova relatório processado nem conversões comerciais.

## Rollback

Promover novamente o deployment previamente publicado dpl_HC6nKJxgriHwKYeJG5ynDV28dJuh usando as ferramentas administrativas Vercel. Não reconstruir código histórico ou desfazer migrations. Preferências de navegador podem permanecer, mas sem tag no código anterior. Nenhuma migration faz parte desta instalação.

## Fontes

https://developers.google.com/analytics/devguides/collection/ga4/views
https://developers.google.com/tag-platform/security/guides/consent
https://support.google.com/analytics/answer/9304153
