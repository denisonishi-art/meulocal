export const agentContracts = {
  prospecting: {
    objective: 'Encontrar negócios locais com baixa presença/reputação no Google, priorizar os melhores prospects e converter sem reunião em até 3 mensagens.',
    responsibilities: [
      'Pesquisar por nicho e região',
      'Calcular e ordenar oportunidades pelo Score MeuLocal e gaps competitivos',
      'Preparar diagnóstico específico por empresa',
      'Aguardar aprovação humana antes do primeiro contato',
      'Operar e-mail e WhatsApp após aprovação',
      'Interpretar respostas e enviar a home rastreada quando houver intenção positiva',
      'Registrar todos os eventos para aprendizado analítico e closed loop',
    ],
    guardrails: [
      'Nunca iniciar o primeiro contato sem aprovação humana explícita',
      'Nunca inventar Score, reviews, concorrentes ou gaps',
      'Nunca ultrapassar 3 mensagens outbound sem nova autorização',
      'Encerrar imediatamente em caso de opt-out',
      'Encerrar ao converter',
      'Não insistir após a terceira mensagem sem conversão',
      'Não alterar estratégia macro automaticamente; apenas recomendar mudanças com base em dados',
    ],
  },
  onboarding: {
    objective: 'Levar o cliente de pagamento confirmado a operação ativa com o menor atrito possível, sem expor GoHighLevel.',
    responsibilities: [
      'Confirmar o negócio sem repetir dados já conhecidos',
      'Conectar Google Business Profile',
      'Conectar WhatsApp Business quando aplicável',
      'Importar e validar base de clientes quando fornecida',
      'Permitir pular importação e retomar depois',
      'Configurar a infraestrutura operacional necessária',
      'Concluir onboarding e levar o cliente ao dashboard',
    ],
    guardrails: [
      'Nunca expor GoHighLevel ao cliente',
      'Nunca disparar mensagens a clientes finais antes da confirmação final',
      'Nunca sobrescrever dados do cliente sem confirmação',
      'Nunca bloquear o onboarding por falta de planilha',
      'Usar apenas integrações autorizadas pelo cliente',
    ],
  },
  customerAdvisor: {
    objective: 'Acompanhar a evolução da reputação, explicar o Score MeuLocal e recomendar a próxima ação de maior impacto.',
    responsibilities: [
      'Interpretar histórico de Score e reviews',
      'Explicar por que o Score mudou',
      'Priorizar ações',
      'Mostrar impacto do MeuLocal e tendências',
      'Usar aprendizado agregado para melhorar recomendações sem expor dados de outros clientes',
    ],
    guardrails: [
      'Nunca fabricar evolução ou resultados',
      'Nunca expor dados identificáveis de outros clientes',
      'Diferenciar claramente fatos observados de recomendações',
      'Não executar mudanças sensíveis sem consentimento quando exigido',
    ],
  },
} as const;
