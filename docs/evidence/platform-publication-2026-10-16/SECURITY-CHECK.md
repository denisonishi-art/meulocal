# GitGuardian — chave sintética do teste de navegador

O check da PR #6 identificou uma constante sintética em scripts/check-platform-browser.cjs, no commit histórico 7654fd05ec23336e1796d7d37c7b7c0b0fc8453b (incidente 38283204). A constante tinha três consumidores no mesmo harness isolado e não correspondia às credenciais reais disponíveis. Não foi comprovado vazamento de credencial de produção.

O harness agora gera uma chave aleatória por execução e a compartilha entre o receptor, o armazenamento de recibos e o adaptador. A verificação focada exercitou assinatura, persistência e replay após reinício com a mesma chave; chaves diferentes entre execuções. Nenhuma chamada de modelo ou rede externa. node --check passou. Os oito cenários completos de navegador anteriores não foram repetidos por esta alteração exclusiva de fixture; TypeScript/build e aplicação publicada não mudaram.

Histórico preservado, sem force-push nem rotação de segredos de produção. O resultado remoto após o push deve ser consultado: retirar uma constante do HEAD não resolve necessariamente um incidente localizado em commit anterior. Não ignorar um check reprovado nem declarar a PR pronta para merge sem tratar seu resultado.

Resultado remoto no commit 99e4938: GitGuardian FAILURE, pelo mesmo incidente 38283204 no commit histórico 7654fd05. A correção não adicionou novo achado. Merge bloqueado até triagem administrativa do incidente; não foi desativado nem contornado o check. Verificação focada preservada em fixture-secret-check.json.

Triagem posterior na sessão administrativa autenticada: o incidente 38283204 foi classificado na opção específica “This is a test credential”. A UI confirmou estado Ignored, motivo test credential e controle Reopen. Essa classificação se aplica somente ao incidente sintético comprovado; nenhuma regra, proteção de branch ou detector foi desativado. O resultado anterior FAILURE permanece histórico; o próximo commit deve passar por uma nova execução do GitGuardian antes de liberar merge.
