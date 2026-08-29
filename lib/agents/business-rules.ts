export const meulocalBusinessRules = {
  commercial: {
    officialMonthlyPriceBRL: 397,
    founderMonthlyPriceBRL: 297,
    founderPriceIsException: true,
    publicOfferName: 'MeuLocal',
    promise: 'Mais avaliações. Mais presença no Google. Mais clientes locais.',
  },
  systems: {
    intelligenceSystem: 'supabase',
    executionSystem: 'highlevel',
    customerFacingSystem: 'meulocal',
    neverExposeHighLevelToCustomer: true,
  },
  whatsapp: {
    transportOwnedByHighLevel: true,
    neverConnectMeuLocalDirectlyToWhatsAppProvider: true,
    inboundEventsMustReturnToMeuLocal: true,
    futureHighLevelWebhookRequired: true,
    webhookPurpose: [
      'message_status',
      'inbound_reply',
      'opt_out',
      'conversion_attribution',
      'learning_event',
    ] as const,
  },
  prospecting: {
    requiresHumanApprovalBeforeFirstContact: true,
    maxOutboundMessagesPerProspect: 3,
    diagnosticMustBeEvidenceBased: true,
    stopOnOptOut: true,
    stopOnConversion: true,
    stopAfterThirdMessageWithoutConversion: true,
    noMacroStrategyChangeWithoutApproval: true,
    whatsappHomeLinkAfterPositiveIntent: true,
  },
  onboarding: {
    requiresConfirmedPaymentBeforeActivation: true,
    dedicatedHighLevelLocationPerCustomer: true,
    provisionHighLevelBeforeChannelSetup: true,
    allowManualProvisioningFallback: true,
    googleBusinessConsentRequired: true,
    customerImportOptional: true,
    customerImportRequiresValidation: true,
    customerImportRequiresDedupe: true,
    customerImportRequiresFinalConfirmation: true,
    neverSendEndCustomerMessagesBeforeFinalConfirmation: true,
  },
  advisor: {
    observedFactsMustBeSeparatedFromRecommendations: true,
    neverInventMetrics: true,
    neverExposeIdentifiableCrossCustomerData: true,
    preferAggregateLearning: true,
  },
  data: {
    minimizePersonalData: true,
    doNotPersistRawGoogleReviewTextByDefault: true,
    storeStructuredLearningEvents: true,
    everyExternalEventShouldBeIdempotent: true,
  },
} as const;

export type MeuLocalBusinessRules = typeof meulocalBusinessRules;
