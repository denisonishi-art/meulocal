# Fechamento operacional: opt-out MeuLocal / GHL / Resultado com IA (12/10/2026)

## Evidência confirmada
- GHL local read-only audit: HTTP 200; 5 conversas; 0 erros de API; 3 mensagens failed, 2 unknown, nenhuma entrega confirmada.
- GET /api/admin/ghl-workflows-check: HTTP 200; dois workflows published confirmados:
  - bb6f4a2b-46d7-4e23-9c99-176461551583 (Aquisição — diagnóstico inicial)
  - f4500c60-e33d-41f5-a461-c146662e226e (Régua de aquisição — follow-up)
- GET /api/admin/ghl-test-contact-verify: contato QA S5cW6oqhgKDFs0ZYGkDh verificado; sem email, sem telefone, tags=[], DND=true; membership NÃO verificada.
- Testes locais: check-ghl-workflow-removal.cjs e check-inbound-intent.cjs aprovados.
- GitHub Actions CI e Validate branch: successful para commit 45aadf5.
- GHL plugin ChatGPT: authClass/IAM HTTP 401; não usar como evidência da API privada.
- Variáveis de produção verificadas pela API de metadados da Vercel (sem ler valores): MeuLocal possui GHL_API_KEY; MeuLocal NÃO possui MEULOCAL_RCIA_SYNC_SECRET; RCIA NÃO possui MEULOCAL_RCIA_SYNC_SECRET, MEULOCAL_RCIA_SYNC_URL, MEULOCAL_GHL_LOCATION_ID.

## Gates de liberação (todos obrigatórios)
1. [ ] Obter via GHL evidência dos triggers/Settings das duas réguas publicadas; revisar stop on response, reentry e interrupção mediante opt-out. Não alterar workflow sem inspeção.
2. [ ] Definir fonte verificável de memberships ativos, inclusive eventStartTime; não inferir pelo cadastro, tags ou ausência de eventos.
3. [ ] Validar contrato de remoção HTTP DELETE em contato de teste realmente inscrito (somente depois de preparar cenário seguro e autorizado), e confirmar succeeded=true; testar uma e duas inscrições.
4. [ ] Incorporar remoção remota ao fluxo real de opt-out com persistência/auditabilidade e sem falsos positivos; remover tags somente como defesa complementar. Atualmente app/api/internal/rcia-opt-out/route.ts retorna intencionalmente 503 depois de persistir localmente.
5. [ ] Revisar resposta a falhas e retentativas na ponte RCIA para impedir respostas comerciais mesmo quando o sync falhar.
6. [ ] Configurar MEULOCAL_RCIA_SYNC_SECRET nos dois projetos, MEULOCAL_RCIA_SYNC_URL e MEULOCAL_GHL_LOCATION_ID no RCIA em ambiente de teste; segredos não devem ser divulgados em logs.
7. [ ] Testar ponta a ponta com opt-out controlado, ausência de mensagens subsequentes, isolamento por location e idempotência.
8. [ ] Reexecutar CI, typecheck e build nas branches e aprovar deploy somente com evidências.

**Status: NOT_READY.** Nenhuma evidência de membership ou remoção real. Nenhum disparo, alteração dos workflows nem deploy autorizados ou realizados neste fechamento.
