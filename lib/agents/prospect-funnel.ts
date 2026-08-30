import {agentPolicies} from './config';

type CompetitionMode = 'local_radius'|'city_region'|'search_market';

type ProspectDiagnostic = {
  prospectId: string;
  businessName: string;
  score: number;
  reviews: number;
  rating: number | null;
  competitorAverageReviews: number | null;
  diagnosticUrl: string;
  competitionMode?: CompetitionMode;
  competitionLabel?: string | null;
  searchIntent?: string | null;
};

function competitionCopy(d: ProspectDiagnostic) {
  const mode = d.competitionMode ?? 'city_region';
  if (mode === 'search_market') {
    const intent = d.searchIntent ? ` para buscas como “${d.searchIntent}”` : '';
    return {
      subject: `empresas que disputam as mesmas buscas no Google${intent}`,
      short: `empresas que disputam os mesmos clientes no Google${intent}`,
    };
  }
  if (mode === 'local_radius') {
    return {
      subject: d.competitionLabel ? `negócios próximos em ${d.competitionLabel}` : 'negócios próximos',
      short: 'negócios próximos',
    };
  }
  return {
    subject: d.competitionLabel ? `negócios comparáveis em ${d.competitionLabel}` : 'negócios comparáveis do mercado',
    short: d.competitionLabel ? `negócios da região de ${d.competitionLabel}` : 'negócios comparáveis',
  };
}

export function buildProspectFunnel(d: ProspectDiagnostic) {
  const gap = d.competitorAverageReviews == null ? null : Math.max(0, Math.round(d.competitorAverageReviews - d.reviews));
  const competition = competitionCopy(d);
  const evidence = d.competitorAverageReviews == null
    ? `Hoje a empresa tem ${d.reviews} avaliações${d.rating ? ` e nota ${d.rating.toFixed(1)}` : ''}.`
    : `Hoje a empresa tem ${d.reviews} avaliações, enquanto ${competition.subject} têm em média ${Math.round(d.competitorAverageReviews)}.${gap ? ` O gap é de ${gap} avaliações.` : ''}`;

  const homeUrl = `/?utm_source=meulocal_prospecting&utm_medium=whatsapp&utm_campaign=outbound&prospect_id=${encodeURIComponent(d.prospectId)}`;

  const email = {
    message1: `Oi! Fizemos uma análise da presença da ${d.businessName} no Google. O Score MeuLocal hoje é ${d.score}/100. ${evidence} Veja o diagnóstico completo: ${d.diagnosticUrl}`,
    message2: `O principal ponto do diagnóstico da ${d.businessName} é a oportunidade de fortalecer a reputação no Google frente a ${competition.short}. O MeuLocal automatiza esse crescimento e acompanha a evolução do seu Score. Quer melhorar suas avaliações?`,
    message3: `Última mensagem sobre o diagnóstico da ${d.businessName}: se fizer sentido melhorar a reputação no Google, você pode conhecer como o MeuLocal funciona e ativar quando quiser. Se não for prioridade, encerramos por aqui.`,
  };

  const whatsapp = {
    message1: `Oi! Fizemos uma análise da presença da ${d.businessName} no Google. O Score MeuLocal hoje é ${d.score}/100. ${evidence} Quer saber como melhorar suas avaliações? Responda *SIM* e eu te mostro.`,
    positiveReplyPatterns: ['sim','s','quero','pode mandar','manda','me mostra','mostrar','claro','ok','quero sim'],
    positiveReplyMessage: `Perfeito. Aqui você consegue ver como o MeuLocal pode ajudar a melhorar suas avaliações e sua reputação no Google: ${homeUrl}`,
    message2: `Vi que existe uma oportunidade para a ${d.businessName} ganhar força no Google frente a ${competition.short}. Se quiser, responda *SIM* e eu te mando como funciona.`,
    message3: `Última mensagem sobre a análise da ${d.businessName}. Se quiser ver como melhorar suas avaliações, responda *SIM*. Se não for prioridade, encerramos por aqui.`,
    homeUrl,
  };

  return {
    approvalRequiredBeforeMessage1: agentPolicies.prospecting.requiresHumanApprovalBeforeContact,
    maxMessages: agentPolicies.prospecting.maxOutboundMessages,
    competitionMode: d.competitionMode ?? 'city_region',
    channels: {email, whatsapp},
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
      whatsappRequiresPositiveReplyBeforeHomeLink: true,
      copyMustMatchCompetitionScope: true,
    },
  };
}
