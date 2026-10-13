# OpenDots → MeuLocal: worker portátil de pesquisa

Reutiliza OpenDots 0.1.0 oficial, commit `625452e06cde74cb25b0ce319e2c1be0488f5a5f`, o mesmo Dot existente e os módulos de qualificação/rascunhos do MeuLocal. Sem CRM, browser, computer, Slack, voz ou dispatcher GHL. Toda saída permanece pending_review e NOT_VERIFIED comercialmente. Construção atual: [relatório consolidado](../../docs/opendots-completion-2026-10-13.md).

## Preparação

Usar Node 24.21.0, npm do runtime e Git. Não clonar sobre instalação existente. Bootstrap reutiliza revisão/lockfile correspondentes; não reseta nem reinstala checkout existente.

```sh
npm ci --ignore-scripts --no-audit --no-fund
node scripts/opendots-worker/bootstrap.cjs
export OPENDOTS_ROOT="$PWD/.opendots/upstream"
node --test scripts/opendots-worker/adapter.test.cjs scripts/opendots-worker/backend-mapping.test.cjs scripts/opendots-worker/agent-text.test.cjs scripts/opendots-worker/remote.test.cjs scripts/opendots-worker/credential-environment.test.cjs
node --test scripts/opendots-worker/local-integration.test.mjs scripts/opendots-worker/workspace-bootstrap.test.mjs scripts/opendots-worker/run-research.test.mjs
```

Para instalação validada existente, definir OPENDOTS_ROOT antes do bootstrap. Somente os dois módulos puros existentes são compilados em meulocal-adapter/shared. Upstream não é vendorizado.

## Entrada

Configurar variáveis pelo ambiente seguro do host; nomes em env.example, sem valores reais. O programa não recupera chaves da Vercel nem lê .env implicitamente. Opcionalmente, OPENDOTS_ENV_FILE seleciona um arquivo autorizado; seus valores prevalecem sobre credenciais herdadas, com regressão automatizada.

```sh
node scripts/opendots-worker/run-research.mjs --preflight
node scripts/opendots-worker/run-research.mjs
```

Preflight funciona sem chaves e informa quais faltam; confere módulos, revisão e identidade em banco de configuração local do host; não autentica provedores, pesquisa ou escreve em banco remoto. Modo padrão Intelligence, projeto existente meulocal-prospeccao-dev/12275; administrador deve confirmar origem da chave. Sem fallback automático. OPENDOTS_EXECUTION_MODE=local_diagnostic é diagnóstico explícito com DotAgent oficial, sem comprovação de persistência Intelligence.

Runtime, MCP e proxy de medição ficam apenas em loopback e são encerrados ao final. Uma pesquisa, até três requests de modelo, até 2.000 tokens de saída por request, limite padrão cinco. Não é teto financeiro exato. Erros de auth/quota interrompem; sem retries de pesquisa. Lock local e concurrency do workflow evitam sobreposição no mesmo executor. Pausa existente e conexões anteriores não são removidas ou reativadas.

workspace-bootstrap.mjs importa somente configuração de dot-identity.json/dot.json. Nenhum SQLite, thread autenticada, cookie, token ou histórico local é copiado. SQLite e relatórios ficam em .opendots/, fora do Git. Jobs efêmeros não conservam estado local entre runs; threads Intelligence persistem no projeto se a execução correspondente tiver sucesso.

## Fonte e qualificação

Fonte operacional fixa https://meulocal.ia.br/api/agents/prospecting/discover reutiliza o mesmo Google Places da interface /api/places/search, com credencial dedicada e habilitação explícita no servidor. Não exporta sua chave. Mapeia name/reviewCount/rating/website e município observado no texto, sem inventar Maps URI, businessStatus ou localização estruturada. Zero não é evidência: também é default do backend. Até oito retornados, somente os primeiros limit avaliados.

Qualificação HTTPS restrita a https://meulocal.ia.br/api/agents/prospecting com MEULOCAL_PROSPECTOR_API_KEY. Redirecionamentos/origens alternativas negados. Confirmação compara integralmente job, ações e ranking; HTTP 200/texto do modelo não provam sucesso. Callback MCP só registra confirmação após essas verificações. Chave privada só segue para as duas rotas privadas no domínio autorizado. MEULOCAL_RESEARCH_SEGMENT escolhe um dos oito segmentos; cidade inicial continua São Paulo/SP. Score por few_reviews sozinho exige contexto; referência do lote não é automaticamente concorrência confirmada. Elegibilidade permanece NOT_VERIFIED ou BLOCKED, nunca autoriza contato.

Endpoint /api/agents/prospecting/discover é reutilizado, agora com chave dedicada, contrato estruturado e mesma função Google da interface. CRON_SECRET não é aceito pelo worker. O contrato antigo segment/limit não é usado por este worker; publicação desse endpoint antigo não foi comprovada.

## Hospedagem e gates

.github/workflows/opendots-research.yml: somente manual, Linux padrão, sem cron, cache, artifacts ou deploy. Repositório público tem minutos padrão gratuitos; resultados sanitizados ficam no resumo do job. OpenAI/Google têm cobrança independente.

Workflow_dispatch novo requer registro na branch padrão para primeiro disparo. Main não foi alterada: registro/merge depende de aprovação futura. Executor Linux já autorizado do ChatGPT Work pode executar o mesmo comando; confirmar disponibilidade, rede e custo antes. Nenhuma VPS contratada.

Pendências: endpoint privado remoto retornou 404, chave específica ausente localmente, Intelligence teve 502 no histórico e GHL 403. Disponibilizar/testar endpoint privado com deploy aprovado, configurar credencial específica nos dois lados, habilitar pesquisa no servidor e confirmar recuperação Intelligence e executar um job remoto supervisionado. GHL, entrega, respostas e opt-out continuam gates para campanha/follow-ups.

validate-real-cycle.mjs permanece diagnosticador histórico com paths portáteis/process env, módulos compilados e loader de testes para handler local. Exige configuração/histórico local referenciado ou arquivos explicitamente fornecidos; não é entrypoint remoto. Novas saídas ficam em .opendots/results, sem sobrepor evidências anteriores. runtime-smoke.mjs/local-integration.test.mjs também são testes, não serviços.

[Handoff e evidências](../../docs/opendots-remote-preparation-2026-10-13.md).
