# Monitoramento: publicação coordenada de 16/10/2026

Estado deste checkpoint: migração aplicada; aplicação e timer em preparação. Monitor **desativado**. Nenhum piloto ou aviso real executado.

## Contrato

Avisar o responsável em até 3 horas da **postagem** da avaliação que exige atenção. Google createTime é a origem; detecção, aceitação pelo GHL e entrega são eventos distintos. Ausência de createTime e atraso são visíveis; nunca usar detecção para reiniciar o prazo. Prazo real NOT_VERIFIED.

## Evidências

- `migration-applied.json`: versão 20261016155756, transação confirmada, checksum verificado, 47 versões históricas preservadas.
- `database-postflight.json`: PostgreSQL 17.6, três novas tabelas com RLS, RPCs restritas, nenhum alerta/recibo/conexão Google.
- `focused-tests.log`: 45/45; `adjacent-tests.log`: 28/28; `full-schema-tests.log`: 11/11 no PostgreSQL descartável com DDL público atual e dependências Auth simuladas.
- `browser.json` e screenshots: Next real com fixtures sintéticas, nenhuma chamada externa ou envio; não é prova da jornada de cliente real.
- `configuration.json`: flag false e segredo exclusivo configurados na Vercel. Credenciais Google OAuth/encriptação e conexão legítima ausentes; modelo real também não validado.
- `vps-installation.json`: instalação no container existente, sem trocar runtime nem alterar configuração comercial. Início/execução do timer serão registrados na evidência final.
- Typecheck e build passaram. Lint passou com dois avisos de hooks já existentes.

## Bloqueios do piloto

1. Google Business legítimo autorizado: zero conexões; configurar OAuth do projeto Google existente e encriptação por meio administrativo, então conectar a conta legítima com leitura confirmada.
2. Definir somente a empresa piloto e o contato GHL já existente; e-mail deve corresponder ao responsável autenticado/verificado, location correta e DND liberado. Não fazer upsert nem mudar tags/workflows.
3. Confirmar a assinatura/configuração nativa que entrega eventos OutboundMessage Email e os recibos de entrega reais; esquema documentado não comprova sua configuração nesta conta.
4. Auditar efeitos de workflows existentes em mensagens operacionais sem modificá-los; o risco de contact-created/upsert foi eliminado no monitor.
5. Vincular falhas do timer/endpoint ao monitoramento administrativo existente antes da ativação comercial. Journal e código não são prova de aviso ao operador.
6. Piloto legítimo autorizado: registrar postagem → disponibilidade/detecção → classificação → persistência → aceitação → entrega. Não criar avaliações públicas falsas. Nenhuma ação executada neste checkpoint.

GO para publicação **desativada**, condicionado aos checks. NO-GO para ativação operacional e promessa comercial comprovada.

## Rollback

Primeiro manter a flag false e parar/desabilitar somente meulocal-review-monitor.timer. Preservar ledgers, recibos e estados uncertain. Fallback da aplicação: deployment dpl_86Re7pWdHVgCHgSGVnHSwGEWo5CD, commit f11758be74c8c05607ef26a06f99d69b8a098f7d; não redeployar o checkout original antigo. Banco: não remover tabelas/evidências nem repetir a migração. Os wrappers Google permanecem como bloqueio seguro. DDL público e ledger antes da alteração estão guardados privadamente; restauração de dados não foi necessária. Backup VPS: /opt/meulocal-opendots/backups/review-monitor-20261016; não restaurar dados por cima de dados atuais. Não parar/substituir o serviço OpenDots.

## Fontes oficiais

- [HighLevel OutboundMessage](https://marketplace.gohighlevel.com/docs/webhook/OutboundMessage/): identidade e estado do evento; configuração/entrega reais continuam NOT_VERIFIED.
- [HighLevel webhook authentication](https://marketplace.gohighlevel.com/docs/webhook/WebhookIntegrationGuide/index.html): assinatura Ed25519. Testes de roteamento usam verificação simulada; não são prova de assinatura de um evento real.
