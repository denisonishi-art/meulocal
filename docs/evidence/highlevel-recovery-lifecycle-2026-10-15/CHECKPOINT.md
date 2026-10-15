# Retomada e lifecycle supervisionado

Status: IMPLEMENTED_TESTED_LOCAL. Publicação e prova externa da nova versão: NOT VERIFIED.

O inbound real anterior continua comprovado; esta correção não significa operação ampla pronta.

## Correções

- P1: RPC transacional grava resposta/cadência/ghl_events e fila no mesmo commit. Falha local desfaz tudo. Eventos antigos incompletos podem ser adotados sem duplicar a resposta. Lease de três minutos impede dupla entrega; expiração e rota protegida permitem retomada. Recibo OpenDots e estado local são concluídos juntos. Falha na retirada das tags preserva o recibo e só retoma a limpeza.
- P2 STOP/SAIR: conclusão terminal persistida, igual na repetição, sem fila nem modelo. Opt-out já existente também interrompe processamento comercial.
- P2 correlação: ID do provedor ou timestamp imutável da mensagem obrigatórios; nunca correlaciona pelo horário de execução. ID é procurado exatamente no histórico autorizado, até cinco páginas de 50; esgotamento recusa a identidade. Timestamp deve coincidir com dateAdded e mensagens ambíguas são recusadas.
- Revisão adjacente: vínculo de contato deve selecionar exatamente um lead. Ambiguidade não escreve dados nem escolhe negócio arbitrário. Retirada de tags prospectar/follow-up preservada como parte retomável.

## Pagamento/onboarding existentes

Triggers adicionais observam somente estados persistidos e transições de customer_accounts/payment_checkouts. Exigem conta active, user_id, paid_at e checkout paid com acesso linked/invited do mesmo negócio. O fluxo Asaas, convites, autorização do onboarding e telas não foram reconstruídos. Cada checkout produz um evento de pagamento; cada mudança real de onboarding produz um evento próprio. Atualização idêntica não duplica evento.

O receptor OpenDots grava orientação determinística supervisionada, requiresHumanReview=true, channel=none e nextPath /onboarding ou /dashboard. Não chama modelo neste caminho. initialSend/autoReply/crmWrite permanecem false. Não executa pagamento, convite, ativação nem mensagem.

A fila pertence ao backend: RLS habilitada, nenhum SELECT/RPC para anon ou authenticated. O cron Google já agendado drena até dois jobs por execução; /api/cron/opendots permite a mesma retomada administrativa sob CRON_SECRET. Equipe Vercel confirmada como Hobby; não foi adicionada frequência de cron não suportada. A entrega supervisionada pode ficar pendente até o cron diário ou execução administrativa. Não é prova de operação imediata em escala.

## Validação

- 25 testes do contrato HighLevel/bridge: passaram.
- 7 testes HTTP locais do receptor: reinício com recibo durável, concorrência, conflito de payload, falha de disco, STOP sem modelo, lifecycle sem modelo e limite UTF-8 para 4000 caracteres: passaram.
- 9 testes com PostgreSQL 17 local isolado: rollback injetado, lease/retomada, falha de persistência do recibo, limpeza de tags pendente, STOP duplicado, escopo, lifecycle, permissões e lead ambíguo: passaram.
- TypeScript: passou. Build Next: passou. git diff --check: passou.
- Lint: NOT RUN; base publicada não tem configuração ESLint e next lint abre o assistente de configuração. Não foi criado config fora do escopo.
- Revisão independente focada: dois findings adjacentes corrigidos; re-review sem novo bloqueio de código. Não repetiu suítes.
- Tentativa inicial de build falhou por tipo de retorno; corrigida e build repetido com sucesso. Teste HTTP executado no sandbox falhou por EPERM de porta local; repetição autorizada passou. Esses incidentes não foram tratados como falhas de produto nem omitidos.

## Gates externos

Vercel CLI autenticada confirmada, equipe denisonishi-8130s-projects, project prj_tTEcf7eWDIAPt7Q1vZ3Qmawu8QSp. Três variáveis obrigatórias presentes sem exibir valores. Acesso de leitura real ao histórico do contato Teste22 2 confirmou o ID 4aRCOWsYXSS5CWw4ZELm. O endpoint direto por ID respondeu 401 Token source/channel mismatch; usamos somente o histórico já autorizado.

O workflow Customer Replied observado não envia ID nem timestamp imutável. O seletor Message oferece Body, Subject e Attachments. Não foi inventada uma variável de merge. Publicar o handler estrito com esse payload recusaria todas as execuções.

Correção externa mínima: fornecer ID/dateAdded do evento de origem por uma assinatura nativa InboundMessage já existente, mantendo a fronteira controlled-contact e exclusivo Teste22 2. O adaptador nativo está preparado no mesmo endpoint com ?controlled_native=1: exige assinatura válida, location/contato exclusivos de Teste22 2 e tag controlled-contact consultada no provedor; eventos de outros contatos são ignorados sem gravação. A conferência dos apps nativos foi interrompida pelo encerramento do Chrome durante a sessão; três integrações privadas de API foram observadas, mas nenhuma assinatura nativa foi comprovada. A documentação oficial do evento inclui messageId/dateAdded: https://marketplace.gohighlevel.com/docs/webhook/InboundMessage/index.html . Não afirmar ausência de app baseado somente na lista de integrações privadas.

Migração remota, atualização da VPS, deploy e publicação do novo workflow: NÃO EXECUTADOS até resolver o contrato. Nenhum novo teste externo, convite, cobrança ou mensagem foi executado nesta correção. A produção anterior foi preservada.

## Última conferência do adaptador nativo

Re-review independente não encontrou novo finding em autenticação, filtro por query, tag atual e âncora. O adaptador não constitui prova de assinatura nativa disponível nem de entrega real de WhatsApp por esse evento. O Chrome retornou erro -600 (aplicativo não executando) ao terminar a inspeção; não foi contornado. Três integrações privadas observadas: GHL_API_KEY, Resultado com ia - MeuLocal, MeuLocal auditoria. Não foi alterada nenhuma delas.
