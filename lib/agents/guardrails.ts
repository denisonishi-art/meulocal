import {meulocalBusinessRules} from './business-rules';

export type GuardrailDecision = {
  allowed: boolean;
  code: string;
  reason: string;
};

const allow = (code = 'allowed', reason = 'Ação permitida.') : GuardrailDecision => ({allowed:true,code,reason});
const deny = (code:string, reason:string) : GuardrailDecision => ({allowed:false,code,reason});

export type ProspectingAction = {
  action: 'prepare'|'send_message'|'send_home_link'|'close';
  messageIndex?: number;
  hasHumanApproval?: boolean;
  hasEvidence?: boolean;
  optedOut?: boolean;
  converted?: boolean;
  positiveIntent?: boolean;
};

export function evaluateProspectingAction(input: ProspectingAction): GuardrailDecision {
  if (input.optedOut && input.action !== 'close') {
    return deny('prospect_opted_out','O prospect pediu opt-out; nenhuma nova abordagem pode ser enviada.');
  }
  if (input.converted && input.action !== 'close') {
    return deny('prospect_already_converted','O prospect já converteu; a régua comercial deve ser encerrada.');
  }
  if (input.action === 'send_message') {
    const index = input.messageIndex ?? 1;
    if (index === 1 && meulocalBusinessRules.prospecting.requiresHumanApprovalBeforeFirstContact && !input.hasHumanApproval) {
      return deny('human_approval_required','O primeiro contato exige aprovação humana explícita.');
    }
    if (!input.hasEvidence) {
      return deny('evidence_required','Nenhuma mensagem comercial pode apresentar diagnóstico sem evidência verificável.');
    }
    if (index < 1 || index > meulocalBusinessRules.prospecting.maxOutboundMessagesPerProspect) {
      return deny('message_limit_reached','O MeuLocal permite no máximo 3 mensagens outbound por prospect sem nova autorização.');
    }
  }
  if (input.action === 'send_home_link' && meulocalBusinessRules.prospecting.whatsappHomeLinkAfterPositiveIntent && !input.positiveIntent) {
    return deny('positive_intent_required','No WhatsApp, o link da Home só deve ser enviado após intenção positiva do prospect.');
  }
  return allow();
}

export type OnboardingAction = {
  action: 'provision_ghl'|'connect_channel'|'activate_outreach'|'complete_onboarding';
  paymentConfirmed?: boolean;
  dedicatedLocation?: boolean;
  ghlProvisioned?: boolean;
  channelConnected?: boolean;
  finalCustomerConfirmation?: boolean;
  exposesHighLevel?: boolean;
};

export function evaluateOnboardingAction(input: OnboardingAction): GuardrailDecision {
  if (input.exposesHighLevel && meulocalBusinessRules.systems.neverExposeHighLevelToCustomer) {
    return deny('highlevel_must_remain_invisible','GoHighLevel é infraestrutura interna e não deve ser exposto ao cliente.');
  }
  if (input.action === 'provision_ghl' && input.dedicatedLocation === false) {
    return deny('dedicated_location_required','Cada cliente deve possuir uma location/subconta dedicada no HighLevel.');
  }
  if (input.action === 'connect_channel' && !input.ghlProvisioned) {
    return deny('ghl_must_be_provisioned_first','A location do HighLevel deve estar provisionada antes da configuração dos canais.');
  }
  if (input.action === 'activate_outreach') {
    if (meulocalBusinessRules.onboarding.requiresConfirmedPaymentBeforeActivation && !input.paymentConfirmed) {
      return deny('payment_required','A ativação operacional só pode ocorrer após confirmação de pagamento.');
    }
    if (!input.ghlProvisioned) {
      return deny('ghl_required','A infraestrutura operacional ainda não foi provisionada.');
    }
    if (!input.channelConnected) {
      return deny('channel_required','Nenhum canal operacional está conectado.');
    }
    if (meulocalBusinessRules.onboarding.neverSendEndCustomerMessagesBeforeFinalConfirmation && !input.finalCustomerConfirmation) {
      return deny('final_confirmation_required','Mensagens para clientes finais exigem confirmação final do estabelecimento.');
    }
  }
  return allow();
}

export type AdvisorOutputCheck = {
  hasRecommendations?: boolean;
  recommendationsAreLabeled?: boolean;
  exposesOtherCustomerIdentity?: boolean;
  claimsUnobservedResult?: boolean;
};

export function evaluateAdvisorOutput(input: AdvisorOutputCheck): GuardrailDecision {
  if (input.exposesOtherCustomerIdentity) {
    return deny('cross_customer_data_forbidden','O agente não pode expor dados identificáveis de outro cliente.');
  }
  if (input.claimsUnobservedResult) {
    return deny('unobserved_result_forbidden','O agente não pode apresentar resultado não observado como fato.');
  }
  if (input.hasRecommendations && !input.recommendationsAreLabeled) {
    return deny('fact_recommendation_separation_required','O agente deve separar fatos observados de recomendações.');
  }
  return allow();
}

export function assertGuardrail(decision: GuardrailDecision): void {
  if (!decision.allowed) {
    throw new Error(`AGENT_GUARDRAIL:${decision.code}:${decision.reason}`);
  }
}
