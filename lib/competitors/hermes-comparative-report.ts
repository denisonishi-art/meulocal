import {isGeoPoint,selectTopLocalCompetitors,LOCAL_COMPETITOR_RADIUS_METERS} from './top-local-reputation';

const PLACES='https://places.googleapis.com/v1/';
const TARGET_FIELDS='id,displayName,formattedAddress,location,rating,userRatingCount,websiteUri,primaryType,types,businessStatus';
const SEARCH_FIELDS='places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.websiteUri,places.primaryType,places.types,places.businessStatus';
const DAY=86400000;
export type LocalComparison={
  version:'meulocal_top3_v1';
  observedAt:string;
  expiresAt:string;
  radiusMeters:3000;
  source:'google_places';
  selection:'top_3_volume_adjusted_rating';
  business:{id:string;name:string;address:string;rating:number;reviewCount:number;category:string};
  competitors:Array<{id:string;name:string;address:string;rating:number;reviewCount:number;distanceKm:number;reputationRankScore:number}>;
  averageCompetitorReviews:number|null;
  reviewGap:number|null;
  warnings:string[];
  recommendations:string[];
};
function normalized(s:string){return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()}
export function isLanguageSchoolNiche(niche:string){
 return /(ingles|idiomas|linguas|language|english|escola de idiomas|curso de idiomas)/.test(normalized(niche));
}
const LANGUAGE_BRANDS=/(wizard|fisk|wise\s*up|yazigi|cna\b|ccaa|knn\b|influx|red\s*balloon|cultura\s*inglesa|cel\s*lep|british\s*council|alumni|berlitz|number\s*one|uptime|skill|maple\s*bear)/i;
export function languageSchoolCandidate(name:string){
 const n=normalized(name);
 return /(idioma|ingles|english|lingua|language|espanhol|frances|alemao)/.test(n)||LANGUAGE_BRANDS.test(n);
}
export function asksForComparativeAnalysis(message:string){
 const text=normalized(message).trim().replace(/[!.?]+$/,'').trim();
 if(!text||text.length>140||/\b(nao|nunca|pare|sair|cancel|stop|sem interesse)\b/.test(text))return false;
 return /^(sim|pode (?:mandar|enviar|preparar)|manda|envia|quero (?:a analise|receber|ver|sim)|me (?:manda|envia)|claro|por favor|pode sim)(?:[ ,]+(?:por favor|a analise|o comparativo|a avaliacao|sim|obrigad[oa]|pode mandar|pode enviar))*$/.test(text);
}
function validatedGooglePlace(p:any){
 return typeof p?.id==='string'&&p.id.length>=8&&isGeoPoint(p.location)&&
 Number.isFinite(p.rating)&&p.rating>0&&p.rating<=5&&Number.isInteger(p.userRatingCount)&&p.userRatingCount>=0&&
 typeof p.displayName?.text==='string'&&Boolean(p.displayName.text.trim())&&
 typeof p.primaryType==='string';
}
export async function fetchGooglePlaceDetail(placeId:string,apiKey:string,fetchImpl:typeof fetch=fetch){
 if(!/^[A-Za-z0-9_-]{8,200}$/.test(placeId))throw Error('invalid_google_place_id');
 const response=await fetchImpl(PLACES+'places/'+encodeURIComponent(placeId),{
  headers:{'X-Goog-Api-Key':apiKey,'X-Goog-FieldMask':TARGET_FIELDS},
  cache:'no-store',redirect:'error',signal:AbortSignal.timeout(6500)
 });
 if(!response.ok)throw Error('places_details_unavailable');
 const p=await response.json();
 if(!validatedGooglePlace(p)||p.id!==placeId||p.businessStatus&&p.businessStatus!=='OPERATIONAL')throw Error('google_business_data_incomplete');
 return p;
}
export async function buildTop3Report(args:{placeId:string;niche:string;businessName?:string;apiKey:string;fetchImpl?:typeof fetch;now?:Date;details?:any}):Promise<LocalComparison>{
 const fetchImpl=args.fetchImpl||fetch;
 const target=args.details||await fetchGooglePlaceDetail(args.placeId,args.apiKey,fetchImpl);
 if(!validatedGooglePlace(target)||target.id!==args.placeId)throw Error('google_business_data_incomplete');
 const language=isLanguageSchoolNiche(args.niche);
 const category=language?'school':target.primaryType;
 if(!/^[a-z_]{2,80}$/.test(category))throw Error('invalid_google_category');
 const center=target.location;
 let url:string;
 let body:any;
 if(language){
  // A text query narrows schools to the language-school market. The Google circle
  // is only a bias here; selectTopLocalCompetitors applies an independent hard
  // geodesic 3 km cutoff after the response.
  url=PLACES+'places:searchText';
  body={textQuery:'escola de idiomas',languageCode:'pt-BR',regionCode:'BR',maxResultCount:20,
    locationBias:{circle:{center,radius:LOCAL_COMPETITOR_RADIUS_METERS}}};
 }else{
  url=PLACES+'places:searchNearby';
  body={includedTypes:[category],languageCode:'pt-BR',regionCode:'BR',maxResultCount:20,
    rankPreference:'POPULARITY',
    locationRestriction:{circle:{center,radius:LOCAL_COMPETITOR_RADIUS_METERS}}};
 }
 const response=await fetchImpl(url,{method:'POST',headers:{
  'Content-Type':'application/json','X-Goog-Api-Key':args.apiKey,'X-Goog-FieldMask':SEARCH_FIELDS
 },body:JSON.stringify(body),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(6500)});
 if(!response.ok)throw Error('google_competitors_unavailable');
 const payload=await response.json();
 const candidates=Array.isArray(payload?.places)?payload.places:[];
 const peers=selectTopLocalCompetitors({businessId:args.placeId,center,businessCategory:category,
  places:language?candidates.filter((p:any)=>languageSchoolCandidate(String(p?.displayName?.text||''))):candidates});
 if(peers.length===0)throw Error('no_reliable_local_competitors');
 const competitors=peers.map(c=>({id:c.id,name:c.name,address:c.address,rating:c.rating,reviewCount:c.reviewCount,distanceKm:c.distanceKm,reputationRankScore:c.reputationRankScore}));
 const avg=peers.length>=2?Math.round(peers.reduce((sum,c)=>sum+c.reviewCount,0)/peers.length):null;
 const reviewGap=avg===null?null:Math.max(0,avg-target.userRatingCount);
 const observedAt=(args.now||new Date()).toISOString();
 const expiresAt=new Date(Date.parse(observedAt)+30*DAY).toISOString();
 const warnings:string[]=[];
 if(competitors.length<3)warnings.push('Foram encontrados apenas '+competitors.length+' concorrentes elegíveis em até 3 km.');
 if(competitors.length<2)warnings.push('Apenas um concorrente: não calculamos a média nem o gap competitivo.');
 if(candidates.length>=20)warnings.push('Comparação entre os perfis retornados pelo Google (até 20 por busca), não um ranking exaustivo.');
 const recommendations=[
  'Convide todos os clientes elegíveis, de forma imparcial, a registrar avaliações honestas após a experiência.',
  'Responda avaliações de modo consistente, sem expor dados pessoais.',
  'Acompanhe a evolução do volume e da nota das avaliações e das consultas comerciais, sem presumir aumento de vendas.'
 ];
 return {
  version:'meulocal_top3_v1',observedAt,expiresAt,radiusMeters:3000,
  source:'google_places',selection:'top_3_volume_adjusted_rating',
  business:{id:target.id,name:target.displayName.text,address:target.formattedAddress||'',
   rating:target.rating,reviewCount:target.userRatingCount,category},
  competitors,averageCompetitorReviews:avg,reviewGap,warnings,recommendations
 };
}
export function verifiedReportLink(publicToken:string){
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(publicToken))throw Error('invalid_public_token');
 return 'https://meulocal.ia.br/d/'+publicToken;
}
