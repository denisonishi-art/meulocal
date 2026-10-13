# OpenDots MeuLocal — preparação remota e handoff

**READY_FOR_CONTROLLED_DEPLOYMENT do código / NO-GO para operação remota ou campanha.** Nenhuma execução em nuvem comprovada, nenhum deploy, cron, recurso pago, contato ou workflow GHL alterado. Código preparado para job Linux independente do Mac; autenticação e backend publicado permanecem gates reais.

## Reuso e publicação

Worker em `scripts/opendots-worker/`. Entrada operacional: `run-research.mjs`. Adapter, MCP, inteligência de qualificação e consultative-approach reutilizados; mesmo Dot `MeuLocal Geradores SP`, identidade existente importada somente como configuração. Nenhum novo agente, CRM ou implementação alternativa de qualificação.

OpenDots oficial 0.1.0, commit `625452e06cde74cb25b0ce319e2c1be0488f5a5f`, lock SHA-256 `5468cc68fc9ada584525047024515838977a4720a3a6d3f705ad29aa2564a123`, Node **24.21.0**. Projeto Intelligence existente `meulocal-prospeccao-dev`, ID 12275. Bootstrap não usa latest, não reseta checkout incompatível e não reinstala dependências de instalação existente. Nenhum segredo, SQLite, sessão autenticada ou cookie está incluído.

Branch de publicação: `feat/opendots-prospeccao-meulocal`. Checkout original permaneceu em `6ad83bb53859bfec57c0d2c8fb7c0ced355def49`, com alterações locais preservadas. Descoberta de avanço remoto até `061886a638bd0383d19098921dd33b7f1c067cf2` exigiu worktree isolado para publicar sobre esse histórico, preservando alterações multissetoriais/descoberta/GHL de outra frente. Não restauramos arquivos removidos pela outra frente nem alteramos seus módulos. O SHA final publicado será informado na entrega e deve ser fixado na implantação.

## Comando e variáveis

Após checkout do SHA publicado, com Node 24.21.0/Git no executor autorizado:

```sh
npm ci --ignore-scripts --no-audit --no-fund
node scripts/opendots-worker/bootstrap.cjs
node scripts/opendots-worker/run-research.mjs --preflight
node scripts/opendots-worker/run-research.mjs
```

Obrigatórias, somente nomes: **CPK_INTELLIGENCE_API_KEY**, **OPENAI_API_KEY**, **MEULOCAL_PROSPECTOR_API_KEY**. Chaves devem ser injetadas pelo ambiente seguro autorizado, nunca chat/Git/argumentos de processo. Não copiar a sessão do CLI CopilotKit. A credencial Intelligence deve pertencer ao projeto existente 12275.

Opcionais: `OPENAI_MODEL`, `OPENDOTS_ROOT`, `OPENDOTS_DATA_DIR`, `OPENDOTS_OUTPUT_DIR`, `MEULOCAL_RESEARCH_LIMIT`, `MEULOCAL_PROSPECTOR_ENDPOINT`, `OPENDOTS_EXECUTION_MODE`, `OPENDOTS_ENV_FILE`. Arquivo de credenciais só é lido quando explicitamente selecionado por OPENDOTS_ENV_FILE; nesse caso prevalece sobre variáveis herdadas. Defaults: GPT-4.1 mini snapshot 2025-04-14, limite cinco, Intelligence e endpoint HTTPS exato MeuLocal. Modo `local_diagnostic` é explicitamente separado, nunca fallback automático. Não necessita chave Google exportada, service-role Supabase, GHL_API_KEY ou CRON_SECRET.

Preflight inicializa apenas configuração SQLite do host, fora do banco comercial. Não é uma autenticação remota nem comprovação da disponibilidade dos endpoints. Pesquisa limita uma chamada da fonte, até três requests de modelo e 2.000 tokens de saída por request. Isso não é teto financeiro garantido. Lock local e concorrência do job evitam sobreposição no mesmo executor. Pausa e conexões anteriores são preservadas.

## Plataforma recomendada e custos

**GitHub Actions, runner Linux padrão, job manual.** Repositório `denisonishi-art/meulocal` foi confirmado público, default branch main. [GitHub documenta minutos gratuitos em runners padrão de repositórios públicos](https://docs.github.com/en/billing/concepts/product-billing/github-actions). Workflow proposto não usa cache, artifacts, larger runners, deploy ou cron; relatório sanitizado fica no job summary. Compute desse mecanismo é US$ 0 conforme essa condição, sem contratar serviço. OpenAI e Google têm cobrança independente; custo total não é declarado zero.

Infraestrutura Vercel existente fornece Google Places; não instalamos o processo OpenDots persistente nela. [Vercel Functions têm duração máxima por invocação](https://vercel.com/docs/functions/limitations), e o runtime existente usa HTTP/MCP próprios e SQLite. Não foi comprovada compatibilidade direta dessa instalação com Functions. Outros serviços/betas Vercel não foram habilitados nem têm custo/eligibilidade presumidos. Evitamos refatorar o agente para uma nova arquitetura serverless.

Workflow `.github/workflows/opendots-research.yml`: somente workflow_dispatch com aprovação explícita, branch exata, environment `opendots-research`, Node/upstream/actions fixados, permission contents:read e checkout sem persistir token. Sem disparo de pesquisa por push/PR. [GitHub exige registro do workflow na branch padrão para seu primeiro dispatch](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch). **Não alteramos main:** merge/registro só após aprovação. Antes disso, ChatGPT Work pode usar executor Linux já autorizado com o mesmo comando; disponibilidade, rede, armazenamento e custos desse executor precisam de confirmação. Nenhuma VPS ou assinatura foi contratada.

## Validação real e portabilidade

- Pesquisa real supervisionada reexecutada no diagnosticador portátil: uma busca pelo backend Google existente, oito retornados, cinco avaliados, **três** qualificados (Alugar Gerador, Aluguel de Gerador SP e GR Produções e Locações de Geradores), score 30, sem duplicatas de ID no lote. Dois requests GPT-4.1 mini, usage medido, custo estimado US$ **0,0026648** somente modelo. Google billing não verificado.
- Essa execução usou endpoint privado **local**, handler original com loader de teste; não é validação do HTTPS privado publicado nem execução de nuvem. Intelligence persistente permanece sem nova comprovação após 502 anterior. Três rascunhos baseados nos três candidatos reais, pendentes de revisão comercial e verificação de opt-out/GHL. A busca é dinâmica e não reproduz necessariamente os dois candidatos do ciclo anterior.
- Incidente corrigido no diagnóstico: Node --env-file preservou OPENAI_API_KEY herdada de origem não confirmada. Duas chamadas tiveram usage medido/estimativa US$ 0,00233, conta de cobrança NOT_VERIFIED. Tentativa preservada em invalidated-attempt-sanitized.json e invalidada como prova de autenticação autorizada; nenhum valor foi exposto. Seleção explícita agora prevalece e possui regressão SYNTHETIC. O ciclo acima foi reexecutado com o arquivo autorizado. Estimativa conjunta das duas tentativas com respostas do modelo: US$ 0,0049948; Google/Intelligence/fatura efetiva não medidos.
- Linux descartável **aarch64** com Node 24.21.0, sem rede externa e sem montar .env/sessões, exercitou agente/MCP reais e fixtures **SYNTHETIC**. Não é teste de provedor real nem prova de runner x86_64 em nuvem. Image digest: `sha256:3d27e5c11e5786e309ec3e03f93ae536eb36e6e5eb3714d5eb3300a36157add0`.
- Testes cobrem deduplicação, origem de métricas, zero/default não tratado como evidência, município errado, contratos, confirmação falsa HTTP 200, isolamento de endpoints, identidade persistida, credenciais não encaminhadas/expostas, pausa preservada, limpeza e ausência de GHL/envio. Resultados finais e checksums em [verification.json](evidence/opendots-remote-preparation-2026-10-13/verification.json); [pesquisa real sanitizada](evidence/opendots-remote-preparation-2026-10-13/real-local-sanitized.json).

Fonte fixa usa `/api/places/search` existente; qualificação HTTPS somente `/api/agents/prospecting`. O endpoint `/api/agents/prospecting/discover` criado por outra frente é preservado, mas não usado: requer CRON_SECRET mais abrangente e tem critérios/projeção próprios. Não expandimos permissões do worker nem reconstruímos descoberta. Campos ausentes continuam NOT_VERIFIED; dados de clientes não são importados. Source key permanece no MeuLocal. HTTP 200, texto do modelo ou absence de matches não autorizam contato.

## Gates de autorização para ChatGPT Work

1. **Backend privado:** GET e POST sem credencial para `https://meulocal.ia.br/api/agents/prospecting` retornaram **404** em 13/10/2026. Fonte existe no repositório, mas disponibilidade publicada não comprovada. Preparar/validar release específico e obter aprovação de deploy antes de disponibilizá-lo; nenhum deploy foi feito aqui.
2. **Credencial específica:** MEULOCAL_PROSPECTOR_API_KEY estava ausente nos arquivos locais autorizados. Administrador deve configurar a mesma credencial dedicada no endpoint e worker, de modo seguro e após autorização. Não substituir por service-role, GHL key ou CRON_SECRET. Origem/projeto das chaves existentes precisam ser confirmados no ambiente remoto.
3. **Intelligence:** 502 anterior na leitura do histórico interrompeu a tentativa completa; runtime reconheceu configuração/criou thread, mas não prova execução durável. Confirmar recuperação do serviço e executar somente um smoke autorizado com o mesmo projeto. Sem nova conta, upgrade, fallback silencioso ou tentativas repetidas em quota/permissão.
4. **GitHub/executor:** aprovar environment protegido/segredos e registro do workflow na main, ou autorizar executor Linux existente do ChatGPT Work. Não executar job real simplesmente porque o código foi publicado. O push pode acionar CI de validação já existente; não é disparo de pesquisa nem deploy explícito de produção.
5. **Primeiro job remoto:** limite cinco, Intelligence obrigatório, uma busca, confirmação completa de qualificação, IDs únicos, usage, evidências sanitizadas, rascunhos pendentes e crmWrites/outboundMessages zero. Persistir prova de run/resultado num destino autorizado; só declarar operação remota depois desse gate.
6. **Comercial:** GHL teve 403; supressões, duplicatas, entrega, respostas, remoção das réguas e opt-out ponta a ponta permanecem gates separados. Não conectar dispatcher, ampliar lote, agendar recorrência ou habilitar follow-ups automaticamente.

Rollback operacional: encerrar job, revogar somente a conexão temporária/credencial do worker se autorizado, desativar o workflow manual se necessário e voltar ao SHA anterior do worker. Não modificar banco comercial, migrations, workflow GHL, contatos ou main como rollback desse job. Em lock residual após kill, primeiro comprovar ausência de execução; não apagar locks indiscriminadamente.
