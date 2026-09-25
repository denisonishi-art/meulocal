const negativeVoicePatterns=[
  /\bn[aã]o\s+(me\s+)?lig(a|ue|ar)\b/i,
  /\bn[aã]o\s+quero\s+(liga[cç][aã]o|falar\s+por\s+telefone)\b/i,
  /\bsem\s+liga[cç][aã]o\b/i,
];

const explicitVoicePatterns=[
  /\bme\s+liga\b/i,
  /\bme\s+ligue\b/i,
  /\bpode\s+(me\s+)?ligar\b/i,
  /\bliga\s+pra\s+mim\b/i,
  /\bligue\s+pra\s+mim\b/i,
  /\bquero\s+(falar|conversar)\s+por\s+(telefone|liga[cç][aã]o)\b/i,
  /\bprefiro\s+(falar|conversar)\s+por\s+(telefone|liga[cç][aã]o)\b/i,
  /\bme\s+chama\s+por\s+telefone\b/i,
  /\bpodemos\s+(falar|conversar)\s+por\s+telefone\b/i,
];

export function isExplicitVoiceRequest(text:string|null|undefined){
  const value=String(text||'').trim();
  if(!value)return false;
  if(negativeVoicePatterns.some((pattern)=>pattern.test(value)))return false;
  return explicitVoicePatterns.some((pattern)=>pattern.test(value));
}
