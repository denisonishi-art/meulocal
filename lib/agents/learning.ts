export type ProspectLearningEventType =
  | 'approved' | 'contact_sent' | 'diagnostic_opened'
  | 'positive_reply' | 'negative_reply' | 'neutral_reply'
  | 'home_link_sent' | 'home_clicked' | 'checkout_started'
  | 'converted' | 'opt_out' | 'closed_no_response';

export type ProspectLearningEvent = {
  prospectDiagnosticId?: string;
  prospectToken?: string;
  niche?: string;
  region?: string;
  channel?: 'email' | 'whatsapp' | 'voice' | 'web' | 'other';
  messageIndex?: number;
  eventType: ProspectLearningEventType;
  messageVariant?: string;
  score?: number;
  rating?: number;
  reviewCount?: number;
  competitorAvgReviews?: number;
  responseIntent?: string;
  revenueCents?: number;
  metadata?: Record<string, unknown>;
};

export function learningEventRow(e: ProspectLearningEvent) {
  return {
    prospect_diagnostic_id: e.prospectDiagnosticId ?? null,
    prospect_token: e.prospectToken ?? null,
    niche: e.niche ?? null,
    region: e.region ?? null,
    channel: e.channel ?? null,
    message_index: e.messageIndex ?? 0,
    event_type: e.eventType,
    message_variant: e.messageVariant ?? null,
    score: e.score ?? null,
    rating: e.rating ?? null,
    review_count: e.reviewCount ?? null,
    competitor_avg_reviews: e.competitorAvgReviews ?? null,
    response_intent: e.responseIntent ?? null,
    revenue_cents: e.revenueCents ?? null,
    metadata: e.metadata ?? {},
  };
}
