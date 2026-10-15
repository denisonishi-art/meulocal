# Decisão: aproveitar o workflow e a credencial existentes

O portal de desenvolvedor autenticado mostrou zero apps, inclusive na tela My apps. O formulário de criação foi aberto, mas não foi salvo e depois foi cancelado. Não houve criação/instalação.

A alternativa incremental já aprovada no plano evita novos client credentials e OAuth callback HighLevel. A leitura REAL confirmou os dois IDs do contato controlado, os metadados de paginação e a mensagem âncora 4aRCOWsYXSS5CWw4ZELm; o Supabase correto contém recibo decision_saved para esse mesmo ID/conversation/location/contato. Ver history-contract-proof.json.

## Contrato implementado localmente

- Modo explícito ?controlled_reconcile=1 no mesmo webhook; autenticação existente, workflow/location/contato/direction coerentes e tag controlled-contact atual consultada no provedor.
- O corpo do aviso não é correlacionado a mensagem alguma. O histórico é percorrido até encontrar o cursor exato salvo; todas as mensagens inéditas são identificadas por seus próprios IDs.
- Ausência da âncora, escopo inconsistente, corpo malformado ou paginação truncada/duplicada recusam gravação.
- Lease serializa notificações. Batch local, fila e avanço do cursor são transacionais; falha desfaz o lote. Outbound/conteúdo não textual fora do contrato é registrado como ignorado, sem trabalho de modelo, mantendo o cursor rastreável.
- Uma descoberta de STOP/SAIR suprime trabalhos comerciais ainda não entregues quando forem reclamados. Recibo remoto já salvo conserva o caminho de limpeza sem repetir modelo.
- Reconciliação ainda não é processamento OpenDots completo: entrega/recibo têm seu próprio estado e prova. O handler informa ingestion=saved e deliveryAttempt separadamente.

## Publicação ainda necessária

Preservar/pause apenas o workflow controlado; aplicar as duas migrations aditivas específicas no Supabase correto; atualizar receptor existente com rollback; inicializar cursor por RPC usando a âncora verificada; publicar handler compatível; atualizar URL do webhook para o modo reconcile e publicar workflow após validação. Não publicar handler estrito enquanto o workflow antigo sem o novo modo continuar apontando para ele.

É obrigatório acrescentar retomada periódica no runtime existente antes de liberar operação: notificação que chega durante um lease pode receber 202 e o cron atual é diário. Não declarar latência imediata com esse fallback. A recuperação deve usar autenticação restrita a reconciliação/entrega supervisionada, não fornecer ao modelo credencial de crons capazes de enviar mensagens.

Revisão independente, build/lint consolidados e prova de NOVO inbound em produção continuam pendentes.

## Cadência implementada localmente

A dependência de implementação periódica citada acima foi resolvida no código: runtime existente chama somente a rota assinada e restrita de recuperação, sem receber CRON_SECRET. Ativação exige MEULOCAL_RECOVERY_URL=https://meulocal.ia.br/api/internal/opendots/recover e publicação coordenada do endpoint + migrations + cursor + receptor. Frequência: próxima tentativa 60s após conclusão da anterior, timeout de 55s; não é um relógio fixo de 60s. Operação/cadência externa e métricas de backlog continuam pendentes de prova em produção.
