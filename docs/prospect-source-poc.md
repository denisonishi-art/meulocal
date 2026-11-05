# MeuLocal — POC de fonte alternativa (10 empresas/dia)

## Situação

O fluxo de descoberta existente usa Google Places API em `app/api/agents/prospect/search/route.ts`, com recorte geográfico, deduplicação e seleção manual. Não substituir esse fluxo até comprovar custo, qualidade, origem e permissão dos dados.

## Fonte avaliada

- Projeto upstream: https://github.com/gosom/google-maps-scraper
- Código upstream não foi copiado, executado ou implantado neste branch.
- O uso do scraper para extração de conteúdo do Google Maps precisa de avaliação dos termos da fonte e de privacidade/compliance. Licença MIT do software não concede direitos sobre os dados de terceiros.
- A integração de produção com o scraper permanece **desativada**.

## Implementado neste branch

`lib/acquisition/external-discovery-adapter.ts` contém um adaptador sem efeitos colaterais para candidatos importados de uma fonte autorizada. Padroniza nome, endereço, website, telefone, avaliações e ID/link de origem; remove duplicatas por ID/link; limita a admissão a 10 registros por dia, descontando o total persistido que o chamador fornecer. Todos os registros ficam com `pending_review` e `contactStarted: false`.

## Próxima integração, após validação

1. Definir fonte permitida; confirmar política de coleta, conservação e exibição de dados.
2. Criar persistência com restrição única de fonte+ID e quota atômica por dia em `America/Sao_Paulo`. O adaptador sozinho **não** garante quota sob concorrência.
3. Expor importação em endpoint administrativo autenticado (nunca público) e vinculá-la à seleção manual existente.
4. Verificar supressões, opt-out e contatos no fluxo atual antes de disponibilizar envio manual. Não presumir que telefone/e-mail extraído é canal válido.
5. Testar até 10 empresas num dia de teste, sem mensagens automáticas, e comparar com a API oficial atual.
6. Só depois discutir ativação, mediante aprovação explícita e revisão de segurança.

## Não fazer

Não habilitar prospecção autônoma; não disparar WhatsApp/e-mail; não alterar workflows do HighLevel; não inserir chaves, Docker ou scraper na Vercel; não sobrescrever a busca atual.
