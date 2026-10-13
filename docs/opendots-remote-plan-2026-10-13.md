# Plano de portabilidade do worker existente

Escopo autorizado: preparar e publicar somente worker, suas dependências diretas e documentação na branch `feat/opendots-prospeccao-meulocal`. Não fazer deploy, criar infraestrutura, configurar segredos remotos, enviar mensagens ou executar cron.

1. Preservar snapshot dos arquivos pendentes. Reutilizar adapter, MCP, DotAgent/Platform oficiais, configuração do Dot e módulos puros de qualificação/rascunhos.
2. Testar primeiro configuração portátil, isolamento de endpoint HTTPS autorizado, identidade do Dot preservada, ausência de conexões de escrita e falha fechada.
3. Generalizar caminhos e emitir módulos existentes no diretório upstream por build reproduzível. Adicionar entrypoint de job limitado, sem loader de testes em runtime remoto.
4. Preparar workflow manual GitHub Actions, sem cron/push de pesquisa, sem cache/artifact pagos. Node 24.21.0, upstream/lock/actions fixados. Runtime Intelligence é obrigatório por padrão; diagnóstico local separado e explícito.
5. Validar módulos com mocks e integração oficial. Executar pesquisa real limitada se as credenciais autorizadas e a fonte estiverem disponíveis, registrando limitações do endpoint privado remoto. Reexecutar regressão, lint/typecheck/build no fechamento.
6. Auditar allowlist de arquivos, segredos e diferenças; commit/push sem force. Verificar SHA remoto e entregar procedimento ao ChatGPT Work. Não alterar main. Workflow_dispatch novo necessita registro na branch padrão, sujeito à aprovação futura.

Critério: código portátil publicado e testes aprovados. Execução Linux/Intelligence/qualificação HTTPS remotamente permanecem gates distintos até evidência real; publicação não significa operação em nuvem.
