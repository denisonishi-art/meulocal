export type ProspectState =
  | 'discovered'
  | 'scored'
  | 'awaiting_approval'
  | 'approved'
  | 'contacted_1'
  | 'engaged'
  | 'home_link_sent'
  | 'contacted_2'
  | 'contacted_3'
  | 'converted'
  | 'opted_out'
  | 'closed_no_response';

const prospectTransitions: Record<ProspectState, readonly ProspectState[]> = {
  discovered: ['scored'],
  scored: ['awaiting_approval'],
  awaiting_approval: ['approved','closed_no_response'],
  approved: ['contacted_1','opted_out','converted'],
  contacted_1: ['engaged','contacted_2','opted_out','converted'],
  engaged: ['home_link_sent','contacted_2','opted_out','converted'],
  home_link_sent: ['contacted_2','opted_out','converted'],
  contacted_2: ['engaged','contacted_3','opted_out','converted'],
  contacted_3: ['engaged','opted_out','converted','closed_no_response'],
  converted: [],
  opted_out: [],
  closed_no_response: [],
};

export type OnboardingState =
  | 'payment_pending'
  | 'payment_confirmed'
  | 'access_created'
  | 'business_confirmed'
  | 'ghl_provisioning'
  | 'ghl_manual_action_required'
  | 'ghl_ready'
  | 'google_connected'
  | 'whatsapp_pending'
  | 'whatsapp_connected'
  | 'import_pending'
  | 'review_activation'
  | 'active'
  | 'error';

const onboardingTransitions: Record<OnboardingState, readonly OnboardingState[]> = {
  payment_pending: ['payment_confirmed','error'],
  payment_confirmed: ['access_created','error'],
  access_created: ['business_confirmed','error'],
  business_confirmed: ['ghl_provisioning','error'],
  ghl_provisioning: ['ghl_ready','ghl_manual_action_required','error'],
  ghl_manual_action_required: ['ghl_ready','error'],
  ghl_ready: ['google_connected','error'],
  google_connected: ['whatsapp_pending','import_pending','review_activation','error'],
  whatsapp_pending: ['whatsapp_connected','import_pending','review_activation','error'],
  whatsapp_connected: ['import_pending','review_activation','error'],
  import_pending: ['review_activation','error'],
  review_activation: ['active','error'],
  active: [],
  error: ['ghl_provisioning','ghl_manual_action_required','google_connected','whatsapp_pending','import_pending','review_activation'],
};

export function canTransitionProspect(from: ProspectState, to: ProspectState): boolean {
  return prospectTransitions[from].includes(to);
}

export function canTransitionOnboarding(from: OnboardingState, to: OnboardingState): boolean {
  return onboardingTransitions[from].includes(to);
}

export function assertProspectTransition(from: ProspectState, to: ProspectState): void {
  if (!canTransitionProspect(from,to)) throw new Error(`INVALID_PROSPECT_TRANSITION:${from}->${to}`);
}

export function assertOnboardingTransition(from: OnboardingState, to: OnboardingState): void {
  if (!canTransitionOnboarding(from,to)) throw new Error(`INVALID_ONBOARDING_TRANSITION:${from}->${to}`);
}
