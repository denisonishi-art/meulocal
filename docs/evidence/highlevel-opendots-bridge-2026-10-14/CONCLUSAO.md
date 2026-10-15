# Integração verificada em produção

Status: REAL_VERIFIED_CONTROLLED_INBOUND. Teste somente com Teste22 2, sem envio comercial ou resposta automática. Esta conclusão substitui o diagnóstico inicial; snapshots anteriores foram preservados.

Mensagem real: 4aRCOWsYXSS5CWw4ZELm. Recebida em 2026-10-15T00:32:28.473Z; execução HighLevel Success às 21:32:39 GMT-03. O log HighLevel contém o mesmo eventId/messageId e o recibo decision_saved; os logs Vercel confirmam recebimento e receiptSaved=true.

No Supabase vznecxfmnthyxvsxwpzi: um ghl_events, ID 6e686d00-4608-4f5a-9a55-5166c1df592f; um outreach_events replied; lead corretamente vinculado com last_reply_at=2026-10-15T00:32:33.8+00:00; business engaged; nenhum enrollment de automação.

OpenDots: arquivo próprio ad29fedd4f0601af894b58aa65875351fdf7d4860f14962da9ddeca41a2a6bc2.json, criado em 2026-10-15T00:32:38.645Z, eventId e contactId correspondentes; action=handoff, status=suggestion_only, requiresHumanReview=true. O recibo autenticado registra dispatched=0. Zero tarefas, runs, calls, conexões MCP, permissões de computador e credenciais de envio no runtime. A conversa HighLevel contém apenas os dois inbounds, sem outbound no teste.

## Alterações

Código isolado do commit publicado 730aaa0; fonte de produção 0e692c25e22a217fd9bd1ec9e38e35d35dd6a5ce, branch codex/highlevel-opendots-inbound. Deployment dpl_8Rn2q3PcbejfJ16fmrE5cjkLHGDZ READY, no Project ID informado e associado ao domínio. Checkout anterior e alterações pendentes preservados.

O adaptador do workflow lê customData, verifica identidade/canal/direção e busca um único inbound recente correspondente pela API existente. Usa o ID real em vez do hash sem identidade. Mensagens ausentes, ambíguas ou fora da janela de 15 minutos falham antes de gravações. Resultado OpenDots e recibo são validados e persistidos em ghl_events.payload_meta; erros não são descartados. Duplicados sem recibo completo exigem reconciliação e não são reenviados automaticamente.

GHL_WEBHOOK_SECRET estava ausente; foi adicionado como sensitive com o segredo existente do workflow, sem rotação nem exposição. URL e secret OpenDots foram preservados. O workflow foi salvo em Publish e recarregado para confirmar a URL https://meulocal.ia.br/api/webhooks/highlevel e os demais campos intactos. Trigger, headers, customData e settings anteriores foram preservados.

A primeira tentativa de deployment foi bloqueada: a configuração Git local continha aspas tipográficas no e-mail do autor. O e-mail sem essas aspas foi comparado à conta Vercel autenticada e ao autor anterior; somente os metadados do nosso commit foram corrigidos. O deployment bloqueado foi preservado como evidência.

## Validação e limites

15 testes focados passaram, incluindo identidade, ambiguidades, falhas de persistência, recibo inválido e duplicados. TypeScript e build local/Vercel passaram. Lint não executado: o repositório publicado não possui configuração ESLint, e next lint abre a configuração inicial. Warnings CSS preexistentes foram registrados.

Prova limitada ao inbound controlado testado, sem ativação de pesquisa, prospecção, envios ou respostas automáticas. HTTP 200 isolado não foi usado como prova. Arquivos JSON ao lado preservam a correlação dos quatro sistemas, com segredos e dados desnecessários removidos.
