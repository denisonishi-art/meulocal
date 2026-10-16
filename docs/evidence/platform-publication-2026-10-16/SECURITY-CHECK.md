# GitGuardian — chave sintética do teste de navegador

O check da PR #6 identificou uma constante sintética em scripts/check-platform-browser.cjs, no commit histórico 7654fd05ec23336e1796d7d37c7b7c0b0fc8453b (incidente 38283204). A constante tinha três consumidores no mesmo harness isolado e não correspondia às credenciais reais disponíveis. Não foi comprovado vazamento de credencial de produção.

O harness agora gera uma chave aleatória por execução e a compartilha entre o receptor, o armazenamento de recibos e o adaptador. A verificação focada exercitou assinatura, persistência e replay após reinício com a mesma chave; chaves diferentes entre execuções. Nenhuma chamada de modelo ou rede externa. node --check passou. Os oito cenários completos de navegador anteriores não foram repetidos por esta alteração exclusiva de fixture; TypeScript/build e aplicação publicada não mudaram.

Histórico preservado, sem force-push nem rotação de segredos de produção. O resultado remoto após o push deve ser consultado: retirar uma constante do HEAD não resolve necessariamente um incidente localizado em commit anterior. Não ignorar um check reprovado nem declarar a PR pronta para merge sem tratar seu resultado.
