import {agentPolicies} from './config';

type ProspectDiagnostic = {
  prospectId: string;
  businessName: string;
  score: number;
  reviews: number;
  rating: number | null;
  competitorAverageReviews: number | null;
  diagnosticUrl: string;
};

export function buildProspectFunnel(d: ProspectDiagnostic) {
  const gap = d.competitorAverageReviews == null ? null : Math.max(0, Math.round(d.competitorAverageReviews - d.reviews));
  const evidence = d.competitorAverageReviews == null
    ? `Hoje a empresa tem ${d.reviews} avaliações${d.rating ? ` e nota ${d.rating.toFixed(1)}` : ''}.`
    : `Hoje a empresa tem ${d.reviews} avaliações, enquanto negócios comparáveis da região têm em média ${Math.round(d.competitorAverageReviews)}.${gap ? ` O gap é de ${gap} avaliações.` : ''}`;

  const message1 = `Oi! Fizemos uma análise da presença da ${d.businessName} no Google. O Score MeuLocal hoje é ${d.score}/100. ${evidence} Veja o diagnóstico completo: ${d.diagnosticUrl}`;
  const message2 = `O principal ponto do diagnóstico da ${d.businessName} é a oportunidade de fortalecer a reputação no Google. O MeuLocal automatiza esse crescimento e acompanha a evolução do seu Score. Quer melhorar suas avaliações?`;
  const message3 = `Última mensagem sobre o diagnóstico da ${d.businessName}: se fizer sentido melhorar a reputação no Google, você pode conhecer como o MeuLocal funciona e ativar quando quiser. Se não for prioridade, encerramos por aqui.`;

  return {
    approvalRequiredBeforeMessage1: agentPolicies.prospecting.requiresHumanApprovalBeforeContact,
    maxMessages: agentPolicies.prospecting.maxOutboundMessages,
    messages: [message1, message2, message3],
    diagnostic: {
      cta: agentPolicies.prospecting.diagnosticCtaLabel,
      ctaDestination: agentPolicies.prospecting.diagnosticCtaDestination,
      utm: {
        utm_source: 'meulocal_prospecting',
        utm_medium: 'diagnostic',
        utm_campaign: 'outbound',
        prospect_id: d.prospectId,
      },
    },
    rules: {
      stopOnConversion: true,
      stopOnOptOut: true,
      stopAfterThirdMessage: true,
      neverSendBeforeApproval: true,
    },
  };
}
