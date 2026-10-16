# Stress test MeuLocal — 16/10/2026

**Decisão: NO-GO para tráfego pago com operação autônoma.** A resistência a duplicidade e falhas passou no ambiente isolado descrito abaixo. Isso não comprova a jornada comercial nem o prazo de três horas em produção.

Código examinado: bcef7a02d3d29fe67e2a8195026c289fa8f4fd0d (main após PR #8). Nenhum deploy, migration remota, segredo, chamada Google/modelo, contato, cobrança ou mensagem real foi executado por este ensaio.

## Resultados novos

| Ensaio | Resultado observado |
|---|---|
| 5.000 inserções/replays de avaliações, 20 empresas | 1.000 observações únicas; sem duplicações |
| 2.000 reentregas de inbound | 200 eventos, 200 atividades e 200 tarefas OpenDots únicas |
| 100 submissões de claim de alerta | 50 reservas distintas, todas no escopo solicitado |
| 100 claims para o mesmo evento OpenDots | Uma lease válida |
| 100 tentativas de ativação de pagamento | Uma lease válida |
| Falha de escrita de pagamento | Transação revertida; retry concluiu e replay não duplicou o handoff |
| Recibos antecipados, tardios, repetidos e fora de ordem | 50 alertas reconciliados; falha tardia não rebaixou entrega confirmada |
| Interrupção de worker e lease expirada | Retomada; worker com lease inválida não concluiu tarefa |
| Resultado desconhecido após dispatch | Estado incerto; sem reenvio automático |
| STOP | Opt-out persistido; nenhuma nova decisão OpenDots enfileirada |
| Fechar e reabrir banco | 1.000 observações e 50 entregas simuladas preservadas |
| Roles públicas | Sem leitura de ledger nem claim |
| 10.000 classificações com retorno inválido/falha simulada | Todas incertas, nenhuma tratada como análise limpa |

`stress.json` contém 15 casos aprovados e tempos locais (31,757 s na execução registrada). Os tempos não representam capacidade da Vercel, Supabase, Google ou GHL. São funções SQL reais das migrations sobre fixtures mínimas no PGlite, com uma conexão que SERIALIZA as submissões. Não é teste de concorrência de múltiplas conexões PostgreSQL, carga HTTP ou disponibilidade de provedores. Advisory locks e SKIP LOCKED em múltiplas sessões precisam do ensaio PostgreSQL externo.

Regressões: primeiro resultado 154/155 (`regressions.txt`). A única falha esperava que Google fosse opcional, regra substituída pelo usuário. O teste foi atualizado para exigir que não exista opção de pular Google, sem alterar o produto. Nova rodada 155/155 (`regressions-after.txt`). Mais cinco testes novos de limites passaram; `boundaries.txt` registra 14 testes porque repete nove testes da jornada. Portanto são **160 testes distintos**, além dos 15 casos de carga SQL e do script existente de migração PGlite, executado separadamente.

## Limites comprovados e bloqueios

1. **Piloto único:** o endpoint exige MEULOCAL_REVIEW_MONITOR_PILOT_BUSINESS_ID e OWNER_CONTACT_ID. Não é monitoramento autônomo multiempresa. Preservado deliberadamente; removê-lo sem desenho de autorização/destinatários seria inseguro.
2. **Fila limitada:** o runner encerra após 100 requests por execução. Cada request tenta um aviso e processa até cinco observações novas. O ensaio forçou fila contínua: retornou monitor_batch_limit_reached na centésima chamada, sem declarar fila drenada. Não há prova de capacidade para pico comercial ou cumprimento do SLA sob backlog.
3. **Leitura Google limitada:** 20 páginas/1.000 avaliações por consulta, sem cursor durável entre consultas. Perfil simulado com 1.500 avaliações retornou truncated=true; a varredura não pode ser declarada completa. O orçamento total também depende das latências paginadas e do limite de 60 s da função; este ensaio não mediu o provedor.
4. **Caminho financeiro:** a fixture testa atomicidade e idempotência com R$189, mas não o checkout comercial recorrente nem o vínculo de preço/plano, pagamento legítimo, convite real e primeiro onboarding.
5. **Serviços reais:** OAuth/Google legítimo, destinatário, GHL/recibos reais e runtime comercial OpenDots remoto não foram usados. Não houve prova nova de rede, qualidade do modelo, deliverability ou SLA da postagem à entrega.
6. **Resultado incerto exige operação:** o sistema bloqueia replay inseguro, mas ainda é necessária reconciliação de exceções. Isso protege contra duplicidade; não equivale a resolução autônoma de todo erro.

Docker/PostgreSQL não está disponível nesta sessão. A tentativa de provisionar PostgreSQL local falhou nas permissões do sistema; não houve bypass das verificações de propriedade dos scripts existentes. `test-selection.json` identifica os 20 scripts não executados, incluindo a plataforma PostgreSQL e navegador. Nenhum resultado anterior fornecido pelo usuário foi recontado como teste novo.

## Próxima liberação

Manter monitor desligado e não liberar tráfego para contratação automática ainda. Primeiro comprovar o fluxo completo do Essencial: preço/assinatura corretos → pagamento autorizado → acesso → OAuth Google → CSV → ativação → pedido/lembrete → STOP → avaliação legítima → alerta com recibo e tempo medido. Depois exercitar múltiplas conexões no PostgreSQL da plataforma de teste e validar fila, paginação, recuperação e destinatários por empresa antes de liberar mais clientes. A análise de temas e o resumo semanal do plano Inteligência continuam fora deste ensaio e não foram implementados.

## Reproduzir sem credenciais

- node --test scripts/check-stress-boundaries.cjs scripts/check-customer-journey.cjs
- node scripts/stress-platform.cjs /tmp/meulocal-stress-result.json
- node scripts/check-review-monitor-database.cjs

Os novos testes foram adicionados ao CI. Nenhuma alteração no código de produção é necessária para reproduzir o ensaio.
