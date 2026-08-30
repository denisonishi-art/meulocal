import {Agent, run} from '@openai/agents';
import {agentModels} from './config';
import {
  customerAdvisorInstructions,
  onboardingInstructions,
  prospectingInstructions,
  seoIntelligenceInstructions,
} from './instructions';

export const prospectingAgent = new Agent({
  name: 'MeuLocal Prospecting Agent',
  model: agentModels.prospectDecision,
  instructions: prospectingInstructions,
});

export const onboardingAgent = new Agent({
  name: 'MeuLocal Onboarding Agent',
  model: agentModels.onboarding,
  instructions: onboardingInstructions,
});

export const customerAdvisorAgent = new Agent({
  name: 'MeuLocal Customer Advisor',
  model: agentModels.customerAdvisor,
  instructions: customerAdvisorInstructions,
});

export const seoIntelligenceAgent = new Agent({
  name: 'MeuLocal SEO Intelligence Agent',
  model: agentModels.seoIntelligence,
  instructions: seoIntelligenceInstructions,
});

export type MeuLocalAgentKind = 'prospecting'|'onboarding'|'customerAdvisor'|'seoIntelligence';

const agents = {
  prospecting: prospectingAgent,
  onboarding: onboardingAgent,
  customerAdvisor: customerAdvisorAgent,
  seoIntelligence: seoIntelligenceAgent,
} as const;

export function ensureOpenAIConfigured(): void {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY_NOT_CONFIGURED');
  }
}

export async function runMeuLocalAgent(kind: MeuLocalAgentKind, input: string): Promise<string> {
  ensureOpenAIConfigured();
  const result = await run(agents[kind], input);
  return typeof result.finalOutput === 'string'
    ? result.finalOutput
    : JSON.stringify(result.finalOutput ?? null);
}
