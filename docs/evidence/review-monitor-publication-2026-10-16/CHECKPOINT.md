# Monitoramento: publicação coordenada de 16/10/2026

Estado final: PR #7 mesclada, migração aplicada, aplicação publicada e timer instalado/habilitado. Monitor **desativado**. Execução real do scheduler confirmou no-op; nenhum piloto ou aviso real executado.

## Contrato

Avisar o responsável em até 3 horas da **postagem** da avaliação que exige atenção. Google createTime é a origem; detecção, aceitação pelo GHL e entrega são eventos distintos. Ausência de createTime e atraso são visíveis; nunca usar detecção para reiniciar o prazo. Prazo real NOT_VERIFIED.

## Evidências

- `migration-applied.json`: versão 20261016155756, transação confirmada, checksum verificado, 47 versões históricas preservadas.
- `database-postflight.json`: PostgreSQL 17.6, três novas tabelas com RLS, RPCs restritas, nenhum alerta/recibo/conexão Google.
- `focused-tests.txt`: 45/45; `adjacent-tests.txt`: 28/28; `full-schema-tests.txt`: 11/11 no PostgreSQL descartável com DDL público atual e dependências Auth simuladas.
- `browser.json` e screenshots: Next real com fixtures sintéticas, nenhuma chamada externa ou envio; não é prova da jornada de cliente real.
- `configuration.json`: flag false e segredo exclusivo configurados na Vercel. Credenciais Google OAuth/encriptação e conexão legítima ausentes; modelo real também não validado.
- `vps-installation.json`: instalação no container existente, sem trocar runtime nem alterar configuração comercial. `remote-validation.json` comprova início e execução manual bem-sucedida com enabled=false; próxima execução agendada para 16/10/2026 18:00 UTC (15:00 São Paulo). A primeira execução automática horária ainda não foi observada neste checkpoint.
- Typecheck e build passaram. Lint passou com dois avisos de hooks já existentes.

## Bloqueios do piloto

1. Google Business legítimo autorizado: zero conexões; configurar OAuth do projeto Google existente e encriptação por meio administrativo, então conectar a conta legítima com leitura confirmada.
2. Definir somente a empresa piloto e o contato GHL já existente; e-mail deve corresponder ao responsável autenticado/verificado, location correta e DND liberado. Não fazer upsert nem mudar tags/workflows.
3. Confirmar a assinatura/configuração nativa que entrega eventos OutboundMessage Email e os recibos de entrega reais; esquema documentado não comprova sua configuração nesta conta.
4. Auditar efeitos de workflows existentes em mensagens operacionais sem modificá-los; o risco de contact-created/upsert foi eliminado no monitor.
5. Vincular falhas do timer/endpoint ao monitoramento administrativo existente antes da ativação comercial. Journal e código não são prova de aviso ao operador.
6. Piloto legítimo autorizado: registrar postagem → disponibilidade/detecção → classificação → persistência → aceitação → entrega. Não criar avaliações públicas falsas. Nenhuma ação executada neste checkpoint.

Publicação **desativada concluída**. NO-GO para ativação operacional e para afirmar prazo comercial comprovado.

## Rollback

Primeiro manter a flag false e parar/desabilitar somente meulocal-review-monitor.timer. Preservar ledgers, recibos e estados uncertain. Fallback da aplicação: deployment dpl_86Re7pWdHVgCHgSGVnHSwGEWo5CD, commit f11758be74c8c05607ef26a06f99d69b8a098f7d; não redeployar o checkout original antigo. Banco: não remover tabelas/evidências nem repetir a migração. Os wrappers Google permanecem como bloqueio seguro. DDL público e ledger antes da alteração estão guardados privadamente; restauração de dados não foi necessária. Backup VPS: /opt/meulocal-opendots/backups/review-monitor-20261016; não restaurar dados por cima de dados atuais. Não parar/substituir o serviço OpenDots.

## Fontes oficiais

- [HighLevel OutboundMessage](https://marketplace.gohighlevel.com/docs/webhook/OutboundMessage/): identidade e estado do evento; configuração/entrega reais continuam NOT_VERIFIED.
- [HighLevel webhook authentication](https://marketplace.gohighlevel.com/docs/webhook/WebhookIntegrationGuide/index.html): assinatura Ed25519. Testes de roteamento usam verificação simulada; não são prova de assinatura de um evento real.

## Publicação comprovada

- PR #7 mesclada em 16/10/2026 17:25:54 UTC. HEAD revisado 6e70137e5c8937ec92b074690a0a68415c2b39b8; merge 821e29e0b1b4191c1ede3b4478da3cfc6b705473. Base anterior f11758be foi preservada como ancestral.
- Deployment dpl_21uTNPoP3PGmH7ofMofzVTJKdWoJ READY; domínio https://meulocal.ia.br confirmado nesse commit. CI, preview Vercel e GitGuardian passaram.
- Endpoint cron: sem credencial 401, credencial incorreta 401, segredo exclusivo 200 com enabled=false e processed=0. Endpoints de status administrativo/cliente exigem autenticação (401 sem sessão). Resposta autenticada desativada: 326 ms no teste registrado, sem pretensão de SLA.
- Timer habilitado; execução manual real na VPS em 17:29:51 UTC result=success/exit=0 e registro disabled_no_op no journal. Próxima execução 18:00 UTC, não observada ainda. Serviço reutiliza root/Docker e Node v24.21.0 existentes. Nenhum runtime reiniciado/substituído; hash do commercial.env preservado.
- Home publicada conferida no Chrome: prazo de 3 horas desde postagem, marcado em validação, sem afirmar cumprimento operacional. Navegação exclusivamente GET.
- Postflight final: zero conexões Google, runs, alertas e recibos. Não houve detecção Google, classificação por modelo real, aceitação GHL nem entrega real de aviso. Tempos entre postagem e entrega: NOT_VERIFIED. Custos de modelo/email neste bloco: nenhuma chamada executada; não representa cotação de tarifas futuras.
- Checkouts: original /Users/denisonishi/Documents/meulocal permanece em feat/opendots-prospeccao-meulocal, HEAD 6ad83bb53859bfec57c0d2c8fb7c0ced355def49, com as mesmas 78 entradas pendentes. Trabalho de publicação isolado em /Users/denisonishi/.codex/worktrees/review-monitor-release/meulocal. Servidor Next local de teste encerrado por PID/diretório verificados.

## Próxima intervenção necessária

Google Cloud Console → projeto Google autorizado existente → APIs e serviços → Credenciais: identificar o cliente OAuth autorizado e configurar GOOGLE_BUSINESS_CLIENT_ID / GOOGLE_BUSINESS_CLIENT_SECRET na Vercel pelos meios administrativos, sem enviar valores no chat. A geração/guarda da chave de encriptação local ao serviço precisa acompanhar essa configuração. Depois, a pessoa autorizada conecta o Perfil da Empresa legítimo pelo onboarding MeuLocal e confirma o e-mail responsável. Não criar avaliações falsas, nem tentar reutilizar tokens de outra conta. Antes de habilitar, confirmar o recibo nativo GHL do contato controlado e o monitoramento de falhas. Manter MEULOCAL_REVIEW_MONITOR_ENABLED=false até esses gates.

O aviso operacional de um teste controlado foi autorizado, mas **não executado** por ausência da conexão legítima e das demais comprovações. Não há nova autorização implícita para mensagens comerciais.
