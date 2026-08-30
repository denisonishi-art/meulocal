export const openSeoCapabilities = {
  keywordResearch: true,
  keywordClustering: true,
  rankTracking: true,
  competitorInsights: true,
  backlinks: true,
  siteAudits: true,
  localSeo: true,
  aiVisibility: true,
} as const;

export type OpenSeoCapability = keyof typeof openSeoCapabilities;

export type SeoEvidence = {
  source: 'openseo'|'google_search_console'|'google_business_profile'|'manual';
  observedAt: string;
  metric: string;
  value: string | number | null;
  metadata?: Record<string, unknown>;
};

export type KeywordOpportunity = {
  keyword: string;
  intent: 'transactional'|'commercial'|'informational'|'navigational'|'local';
  targetPage?: string | null;
  location?: string | null;
  searchVolume?: number | null;
  difficulty?: number | null;
  currentRank?: number | null;
  competitorGap?: boolean | null;
  priority: 'low'|'medium'|'high';
  evidence: SeoEvidence[];
  recommendation: string;
};

export type SeoRecommendation = {
  id: string;
  category: 'technical'|'content'|'keyword'|'authority'|'local'|'ai_visibility';
  title: string;
  rationale: string;
  impact: 'low'|'medium'|'high';
  effort: 'low'|'medium'|'high';
  evidence: SeoEvidence[];
  requiresHumanApproval: true;
};

export const openSeoIntegration = {
  provider: 'OpenSEO',
  repository: 'every-app/open-seo',
  mode: 'external_mcp_or_adapter',
  status: 'not_connected',
  preferredInitialPath: 'hosted_mcp',
  selfHostingPath: 'cloudflare_or_docker',
  underlyingDataProvider: 'DataForSEO',
  requiredWhenConnected: [
    'OPEN_SEO_MCP_URL',
    'OPEN_SEO_AUTH_TOKEN',
  ] as const,
  rules: {
    noSyntheticMetrics: true,
    noAutomaticPublishing: true,
    preserveEvidenceForEveryRecommendation: true,
    failClosedWhenExternalDataUnavailable: true,
  },
} as const;

export function assertSeoEvidence(evidence: SeoEvidence[]): void {
  if (!evidence.length) throw new Error('SEO_EVIDENCE_REQUIRED');
}

export function isOpenSeoConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.OPEN_SEO_MCP_URL && env.OPEN_SEO_AUTH_TOKEN);
}
