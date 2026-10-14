# OpenDots + MeuLocal — construção integral, ativação separada

Checkpoint de entrada 7acbffe1e0ac8d3b220b2d6df86cde67b3cffe89. Nenhuma mensagem, escrita no GHL, migration remota, produção, contratação, importação de dados ou ciclo cobrado executado neste bloco. Estado de ativação: **NO-GO / BLOCKED_EXTERNAL**.

## Implementação por requisito

| Componente | Implementação e evidência | Ativação pendente |
|---|---|---|
| Worker / Linux | Entrada run-research, Node 24.21.0, upstream oficial pinado, lockfile, preflight sem chaves, pesquisa fail-closed, limite cinco/uma busca/três requests modelo, correlação runId/thread, cleanup independente com falhas registradas | Execução remota real ainda NOT_VERIFIED |
| GitHub Actions | Preflight/research manual, revisão humana, Environment exclusivo da branch, permissões contents:read, checkout por SHA, actions fixadas, concurrency, timeout, resumo sem texto livre do modelo | Registro do workflow na main por PR mínimo; sem merge automático |
| Backend / Google | Reuso discover e places/search com função Google única; schema estrito 64KB, quota por credencial via RPC distribuída existente, autenticação timing-safe, timeout 12s, pageSize, contagem ausente null e localização observada | Ambos GET publicados retornaram 404; deploy/release específico precisa autorização. Verificar RPC consume_api_rate_limit existe e é eficaz; falha bloqueia endpoint privado |
| Multissetorial | Mesmo Dot e ranking: geradores, buffets, pizzarias, escolas, despachantes, academias, clinicas, servicos locais; pesquisa inicialmente São Paulo/SP | Sem prova real dos novos segmentos; few_reviews isolado é needs_context, nunca oportunidade confirmada. Referência observada do lote não comprova concorrência |
| Intelligence | Mesmo projeto 12275, nenhuma conta/credencial/sessão copiada, padrão Intelligence sem fallback; erro limitado/classificado e sem retry automático | 502 histórico ainda não revalidado; comprovar run e persistência remotos |
| Deduplicação / elegibilidade | IDs/lote/sites, nome+endereço normalizados; histórico Supabase por location com limite explicitamente parcial; leitura GHL GET de contato vinculado, PIT sem exchange; opt-out/resposta/DND/duplicidade bloqueiam. Nunca transforma resultado vazio em autorização | Global/local não mapeados, conversas, memberships, canal, fundamento legal e consentimento são NOT_VERIFIED; contato sempre contactAllowed:false neste bloco |
| Opt-out híbrido | Reusa inbound, ledger, auditoria, RCIA e reconciliação tardia anteriores; migrations e manifesto preservados byte a byte. Resposta comum para automação sem recusa definitiva; recusa anterior ao vínculo/retries/duplicatas cobertos | Preview SQL e mecanismo nativo GHL continuam gates próprios. Dispatcher não conectado; não retornar sincronização presumida |
| Abordagem | Texto consultivo existente preservado, identificação Denis, fundador da MeuLocal em ambos canais, sem preço inicial, pedido de permissão e SAIR | Texto definitivo escolhido não foi localizado nas evidências disponíveis: messageApproval NOT_VERIFIED; não aprovar automaticamente o gerado |
| Envio / follow-up | Legacy enqueue não cria contato/tag; flags/body não liberam envio inicial; reconciliação ainda funciona, mas cron não envia enquanto release não comprovado | Necessita decisão/recibo server-side vinculado a elegibilidade, mensagem aprovada, entrega e opt-out reais; ambiente flag não é prova |

## Operação e configuração posterior

Node/Git/npm no executor; npm ci --ignore-scripts --no-audit --no-fund; node scripts/opendots-worker/bootstrap.cjs; node scripts/opendots-worker/run-research.mjs --preflight. Nenhuma chave exigida no preflight. Configuração antiga de SQLite com instruções divergentes é recusada sem apagar histórico; não copiar sessão do Mac.

Para Research, injetar somente CPK_INTELLIGENCE_API_KEY (projeto 12275), OPENAI_API_KEY e MEULOCAL_PROSPECTOR_API_KEY no Environment protegido. OPENDOTS_EXECUTION_MODE=intelligence, MEULOCAL_RESEARCH_LIMIT=5 e MEULOCAL_RESEARCH_SEGMENT=geradores para primeiro piloto. As chaves não foram criadas, copiadas ou configuradas aqui.

Servidor: mesma chave dedicada, Google existente; MEULOCAL_RESEARCH_ENABLED=true somente após publicação aprovada/validação. Elegibilidade externa é opt-in servidor MEULOCAL_RESEARCH_ELIGIBILITY_ENABLED; usa credenciais Supabase/GHL existentes, nunca exportadas ao worker. GHL_LOCATION_ID tem de ser a unidade autorizada uNh3KsM7WFuLeTN8Q583. Desabilitar gates iniciais/cron comercial e manter release bloqueada.

Ordem mínima: revisão/merge somente PR de registro; validar migrations em preview isolado com manifesto anterior sem reescrita; aprovar release backend; verificar quota, autenticação, origem das chaves, enable de pesquisa e recuperação Intelligence; administrador configura três segredos; aprovação humana do primeiro job real limitado. Depois comprovar resultados/fontes/custos/run/histórico. Somente então discutir piloto comercial separado, contato de teste autorizado e remoção nativa das duas réguas.

Lint foi tornado reproduzível: script next lint existente não possuía configuração/dependências no parent remoto. Restauradas somente dependências de desenvolvimento fixadas ESLint 8.57.1/eslint-config-next 14.2.35 e configuração core-web-vitals, alinhadas ao Next 14 já adotado. Pacotes de lint legado têm avisos de descontinuação; migração de framework/toolchain não incluída.

Os novos endpoints privados não foram autenticados/remotamente executados. GET sem credenciais não aciona Google. O histórico TESTED_LOCAL_REAL do checkpoint anterior é preservado; não equivale ao novo contrato TESTED_REMOTE_REAL.

## Evidência documental oficial

[Google searchText](https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places/searchText): pageSize substitui maxResultCount; nenhum campo ausente é inventado. [GHL Get Contact](https://marketplace.gohighlevel.com/docs/ghl/contacts/get-contact/): GET /contacts/:contactId, Version v3, resposta contact com id/locationId. Leitura de contato não prova membership ou ausência de DND/consentimento. [GitHub workflow_dispatch](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch): registro na branch padrão exige PR/merge humano. [GHL lookup atual](https://marketplace.gohighlevel.com/docs/ghl/contacts/lookup-contact/index.html) documenta canal OAuth exclusivo para busca exata por email/phone: não presumimos compatibilidade com PIT nem trocamos sua credencial. Identificadores novos sem vínculo autorizado continuam NOT_VERIFIED; leitura vinculada não prova ausência global. A verificação é limitada a cinco prospects e um contato por prospect, timeout de três segundos, múltiplos vínculos bloqueados. Escopos de conversas/workflows e permissões efetivas continuam dependências externas; o diagnóstico de acesso não troca tokens por POST.

## Custos e recuperação

Nenhuma nova chamada de modelo/Google nesta construção. Histórico anterior: tokens/estimativa e tentativa invalidada continuam no relatório anterior; não representam uso deste bloco. Runner padrão de repositório público tem minutos gratuitos, provedores/armazenamento/custos adicionais não são presumidos zero. Sem artifacts/cache de cobrança. Limites de chamadas/tokens não são teto monetário garantido.

Falhas 401/403/404/429/502/timeout bloqueiam e exigem diagnóstico; sem repetição silenciosa. Cleanup tenta todos os recursos próprios e reporta falha parcial; lock residual requer inspeção de propriedade/processo. Rollback do código por SHA sem tocar produção/DB/workflows. Só habilitar envio após gate específico; a implementação não concede essa autoridade.

Resultados consolidados e checksums serão registrados em docs/evidence/opendots-completion-2026-10-13/verification.json e release-checksums.json; os checksums anteriores pertencem ao commit anterior e não devem ser usados contra os arquivos evoluídos.

## Resultado consolidado

69 testes locais e 69 Linux (aarch64, sem rede/segredos) aprovados, bootstrap de instalação existente e checks determinísticos aprovados. TypeScript, lint e build aprovados; dois avisos de hooks preexistentes e avisos CSS existentes. Preflight sem chaves: 7bc1a28b-1674-4582-be8d-741ec9844035. Instalação Linux limpa/x86_64 e operação em nuvem não comprovadas. Environment criado com revisão humana, administradores sem bypass, branch exclusiva, zero segredos; nenhum job disparado.

Comando reproduzível dos testes: Node 24.21.0, OPENDOTS_ROOT apontando à instalação pinada, npm test. O bootstrap nunca reinstala checkout compatível. Evidência real anterior não é reclassificada como resultado deste bloco.
