export type SeoMetricEvidence={source:'openseo'|'search_console'|'manual';observedAt:string;reference?:string|null};
export type SeoOpportunityInput={keyword:string;intent?:string|null;locationScope?:string|null;targetUrl?:string|null;currentPosition?:number|null;searchVolume?:number|null;keywordDifficulty?:number|null;competitorUrl?:string|null;opportunityType:'new_page'|'optimize_page'|'technical'|'backlink'|'local_seo'|'ai_visibility';priority:'low'|'medium'|'high'|'critical';evidence:SeoMetricEvidence&Record<string,unknown>};

export function ensureEvidence(o:SeoOpportunityInput){
  if(!o.keyword?.trim())throw new Error('SEO_KEYWORD_REQUIRED');
  if(!o.evidence?.source||!o.evidence?.observedAt)throw new Error('SEO_EVIDENCE_REQUIRED');
  for(const [key,value] of Object.entries({searchVolume:o.searchVolume,keywordDifficulty:o.keywordDifficulty,currentPosition:o.currentPosition})){
    if(value!=null&&!Number.isFinite(Number(value)))throw new Error(`SEO_INVALID_${key.toUpperCase()}`);
  }
  return o;
}

export function openseoStatus(){
  const configured=Boolean(process.env.OPENSEO_MCP_URL||process.env.OPENSEO_API_URL);
  return {provider:'openseo',configured,mode:process.env.OPENSEO_MCP_URL?'mcp':process.env.OPENSEO_API_URL?'api':'pending'} as const;
}
