# Aceite do bloco local — 15/10/2026

Estado: LOCAL_VERIFIED_REVIEWED. Publicação preparada com HOLD de pré-condições externas. Não é PLATFORM_FUNCTIONALLY_COMPLETE em produção.

| Jornada | Evidência local final | Limite / gate externo |
| --- | --- | --- |
| Aquisição → inbound → OpenDots → revisão humana | Chrome real, handlers, SQL e receptor HTTP reais; recibo em disco e banco; revisão humana obrigatória | Auth, transporte HighLevel e inferência isolados; novo corte ainda não publicado |
| Resposta manual | Confirmação do texto, UUID persistido, receipt salvo, retry/reload sem duplicação | Prova local; gates reais não habilitados |
| Cadência | Bloqueio mais antigo reproduzido; backoff persistente permite próximo contato; concorrência/stale settlement e permissões testados | No máximo um candidato por execução; bloqueado fica com pendência visível; nenhum disparo real |
| Timeout/falha parcial/reconciliação | Sem falso sucesso; slot durável; receiver reiniciado após recibo salvo não repete inferência | Conferência de recibo do provedor feita com evidência sintética, não em produção |
| SAIR/STOP e mensagens iguais | Cadência cancelada atomicamente; opt-out preservado; mensagens de mesmo corpo têm IDs distintos | Remoção de workflow no HighLevel requer confirmação externa própria |
| Pagamento → acesso | Handlers/RPCs e vínculo transacional aprovados na regressão; browser parte de fixture paga isolada | Prova financeira pendente: usuário informou nenhum pagamento anterior; sem sandbox Asaas disponível; nenhuma confirmação fabricada em produção |
| Onboarding → pendências → ativação | Negócio e conclusão explicitamente confirmados; falha não conclui; pagamento não conclui onboarding; canal real e destino público de avaliação exigidos; fila de 1, entrega 0 | Google OAuth opcional; boot/transporte/ingresso de clientes reais ainda são gates externos |
| Admin e isolamento | 18 casos admin; autorização servidor antes de acesso; RPCs service-only; conta/negócio/contato verificados; pendências e próximos passos sem payload/segredos | Escopo multiempresa local/sintético, não auditoria irrestrita de toda a produção |
| Qualidade/rollback/revisão | 348/348, TypeScript/build exit0, lint sem erros; P2 independente corrigido/revisto; snapshots preservados no desligamento/restauração | Avisos existentes de hooks/CSS; não ensaiado binário legado nem restauração financeira |

Logs e JSON neste diretório. Bancos sintéticos e tentativas anteriores continuam preservados. Nenhum merge, push, deploy, migration remota, edição de workflow, cobrança, convite, disparo comercial ou resposta automática foi realizado neste bloco.
