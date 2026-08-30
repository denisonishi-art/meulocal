# Score MeuLocal V1 — Reputation Score

## Objetivo

O Score MeuLocal V1 mede a saúde da reputação no Google em uma escala de 0 a 100. Ele não é um score genérico de SEO e não promete posição em busca ou receita.

## Fatores-base

- **Volume de avaliações — 40%**: compara o total de avaliações com o mercado competitivo quando há benchmark confiável. Sem benchmark, usa uma curva logarítmica conservadora.
- **Nota no Google — 25%**: normaliza a avaliação média entre 3,5 e 5,0.
- **Velocidade de avaliações — 20%**: considera novas avaliações nos últimos 30 dias em relação a um ritmo-base histórico.
- **Taxa de respostas — 15%**: percentual das avaliações observadas que receberam resposta do estabelecimento.

Quando um fator não está disponível, seu peso é redistribuído proporcionalmente entre os fatores observados. O sistema nunca preenche um dado ausente com um valor inventado.

## Faixas

- 0–35: `critical`
- 36–55: `weak`
- 56–75: `competitive`
- 76–100: `strong`

## Escopo competitivo

A comparação pode ser:

- `local_radius`: proximidade física é relevante;
- `city_region`: empresas comparáveis na mesma cidade/região;
- `search_market`: empresas que disputam as mesmas buscas, cliques e clientes, mesmo fisicamente distantes.

O raio de 3 km é uma heurística disponível, não uma regra universal.

## Evidência e versionamento

Cada snapshot grava `score_version = reputation_v1` e `score_factors`. Mudanças futuras de fórmula devem criar uma nova versão em vez de alterar silenciosamente o significado do histórico.

## Limitações atuais

- O benchmark competitivo depende dos dados disponíveis no diagnóstico.
- Rankings/keywords não entram no Score de reputação V1.
- Dados de SEO poderão aparecer em produto separado, MeuLocal SEO, sem contaminar o score principal de reputação.
