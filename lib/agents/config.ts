export const agentModels = {
  prospectDiscovery: 'gpt-5.6-luna',
  prospectDecision: 'gpt-5.6-terra',
  onboarding: 'gpt-5.6-terra',
  customerAdvisor: 'gpt-5.6-sol',
} as const;

export const agentPolicies = {
  prospecting: {
    requiresHumanApprovalBeforeContact: true,
    maxCandidatesPerSearch: 30,
    maxApprovedBatch: 10,
    defaultRadiusMeters: 3000,
    minimumGoogleRating: 4.0,
    prioritizeScoreBelow: 55,
    channels: ['email', 'whatsapp'] as const,
  },
  onboarding: {
    neverExposeHighLevel: true,
    neverSendCustomerMessagesBeforeFinalConfirmation: true,
    allowImportSkip: true,
  },
} as const;
