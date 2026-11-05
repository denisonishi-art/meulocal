import {isGeoPoint,selectTopLocalCompetitors,LOCAL_COMPETITOR_RADIUS_METERS,EXTENDED_COMPETITOR_RADIUS_METERS} from './top-local-reputation';

const PLACES='https://places.googleapis.com/v1/';
const TARGET_FIELDS='id,displayName,formattedAddress,location,rating,userRatingCount,websiteUri,primaryType,types,businessStatus';
const SEARCH_FIELDS='places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.websiteUri,places.primaryType,places.types,places.businessStatus';
const DAY=86400000;
export type LocalComparison={
  version:'meulocal_top3_v1'|'meulocal_top3_v2';
  observedAt:string;
  expiresAt:string;
  radiusMeters:3000|5000;
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
const LANGUAGE_BRANDS=/(wizard|fisk|wise\s*up|yazigi|cna\b|ccaa|knn\b|influx|red\s*balloon|cultura\s*inglesa|cel\s*lep|british\s*council|alumni|berlitz|number\s*one|uptime|skill)/i;
export function languageSchoolCandidate(name:string){
 const n=normalized(name);
 return /(idioma|ingles|english|lingua|language|espanhol|frances|alemao)/.test(n)||LANGUAGE_BRANDS.test(n);
}
export function asksForComparativeAnalysis(message:string){
 const text=normalized(message).trim().replace(/[!.?]+$/,'').trim();
 if(!text||text.length>140||/\b(nao|nunca|pare|sair|cancel|stop|sem interesse)\b/.test(text))return false;
 return /^(sim|pode (?:me )?(?:mandar|enviar|preparar)|manda|envia|quero (?:a analise|receber|ver|sim)|gostaria de receber(?: a analise)?|me (?:manda|envia)|claro|por favor|pode sim)(?:[ ,]+(?:por favor|a analise|o comparativo|a avaliacao|sim|obrigad[oa]|pode mandar|pode enviar))*$/.test(text);
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

/**
 * Google's Text Search circle is a LOCATION BIAS, not a hard boundary. We
 * always post-filter by real geodesic distance, independent of API ranking.
 * Different language-school searches recover relevant businesses that the
 * first capped 20-result query can miss.
 */
const NON_LANGUAGE_BUSINESS_TYPES=new Set([
 'restaurant','bar','cafe','bakery','store','shopping_mall','gym',
 'preschool','primary_school','secondary_school','university',
 'hospital','hotel','lodging','night_club','hair_care','car_dealer'
]);
function matchingLanguageSchool(p:any){
 const name=String(p?.displayName?.text||'');
 if(!languageSchoolCandidate(name))return false;
 const types=[p?.primaryType,...(Array.isArray(p?.types)?p.types:[])];
 return !types.some(t=>NON_LANGUAGE_BUSINESS_TYPES.has(String(t)));
}
type SearchRound={places:any[];anyError:boolean;limited:boolean;success:boolean};
export async function buildTop3Report(args:{placeId:string;niche:string;businessName?:string;apiKey:string;fetchImpl?:typeof fetch;now?:Date;details?:any}):Promise<LocalComparison>{
 const fetchImpl=args.fetchImpl||fetch;
 const target=args.details||await fetchGooglePlaceDetail(args.placeId,args.apiKey,fetchImpl);
 if(!validatedGooglePlace(target)||target.id!==args.placeId)throw Error('google_business_data_incomplete');
 const language=isLanguageSchoolNiche(args.niche);
 const category=language?'school':target.primaryType;
 if(!/^[a-z_]{2,80}$/.test(category))throw Error('invalid_google_category');
 const center=target.location;
 const searchRound=async(radius:3000|5000):Promise<SearchRound>=>{
  const requests=language?[
   {url:PLACES+'places:searchText',body:{
    textQuery:'escola de inglês',languageCode:'pt-BR',regionCode:'BR',pageSize:20,
    locationBias:{circle:{center,radius}}
   }},
   {url:PLACES+'places:searchText',body:{
    textQuery:'escola de idiomas',languageCode:'pt-BR',regionCode:'BR',pageSize:20,
    locationBias:{circle:{center,radius}}
   }}
  ]:[{url:PLACES+'places:searchNearby',body:{
   includedTypes:[category],languageCode:'pt-BR',regionCode:'BR',maxResultCount:20,
   rankPreference:'POPULARITY',locationRestriction:{circle:{center,radius}}
  }}];
  const settled=await Promise.allSettled(requests.map(async request=>{
   const response=await fetchImpl(request.url,{method:'POST',headers:{
    'Content-Type':'application/json','X-Goog-Api-Key':args.apiKey,'X-Goog-FieldMask':SEARCH_FIELDS
   },body:JSON.stringify(request.body),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(6500)});
   if(!response.ok)throw Error('google_competitors_unavailable');
   const payload=await response.json();
   return Array.isArray(payload?.places)?payload.places:[];
  }));
  const successes=settled.filter((r):r is PromiseFulfilledResult<any[]>=>r.status==='fulfilled');
  return {
   places:successes.flatMap(r=>r.value),
   anyError:successes.length!==settled.length,
   limited:successes.some(r=>r.value.length>=20),
   success:successes.length>0
  };
 };
 const rank=(places:any[],radius:3000|5000)=>
  selectTopLocalCompetitors({
   businessId:args.placeId,center,businessCategory:category,
   places:language?places.filter(matchingLanguageSchool):places,
   radiusMeters:radius,requireCategory:!language
  });
 const first=await searchRound(LOCAL_COMPETITOR_RADIUS_METERS);
 if(!first.success)throw Error('google_competitors_unavailable');
 let radius:3000|5000=LOCAL_COMPETITOR_RADIUS_METERS;
 let candidates=first.places;
 let peers=rank(candidates,radius);
 let incomplete=first.anyError;
 let limited=first.limited;
 let expansionUnavailable=false;
 if(peers.length<3){
  const extended=await searchRound(EXTENDED_COMPETITOR_RADIUS_METERS);
  if(extended.success){
   radius=EXTENDED_COMPETITOR_RADIUS_METERS;
   candidates=[...candidates,...extended.places];
   peers=rank(candidates,radius);
   incomplete ||=extended.anyError;
   limited ||=extended.limited;
  }else{
   expansionUnavailable=true;
  }
 }
 if(peers.length===0)throw Error('no_reliable_local_competitors');
 const competitors=peers.map(c=>({id:c.id,name:c.name,address:c.address,rating:c.rating,reviewCount:c.reviewCount,distanceKm:c.distanceKm,reputationRankScore:c.reputationRankScore}));
 const avg=peers.length>=2?Math.round(peers.reduce((sum,c)=>sum+c.reviewCount,0)/peers.length):null;
 const reviewGap=avg===null?null:Math.max(0,avg-target.userRatingCount);
 const observedAt=(args.now||new Date()).toISOString();
 const expiresAt=new Date(Date.parse(observedAt)+30*DAY).toISOString();
 const warnings:string[]=[];
 if(radius===EXTENDED_COMPETITOR_RADIUS_METERS)warnings.push('Buscamos primeiro em 3 km e ampliamos para 5 km porque havia menos de três concorrentes válidos.');
 if(expansionUnavailable)warnings.push('A busca complementar de até 5 km não pôde ser concluída; os resultados exibidos foram confirmados em até 3 km.');
 if(peers.length<3)warnings.push('Foram encontrados apenas '+peers.length+' concorrente(s) elegível(is) em até '+radius/1000+' km. Não inventamos outros perfis.');
 if(peers.length<2)warnings.push('Apenas um concorrente: não calculamos a média nem o gap competitivo.');
 if(incomplete)warnings.push('Uma das consultas ao Google não foi concluída; a cobertura da comparação pode estar incompleta.');
 if(limited)warnings.push('A pesquisa atingiu o limite de 20 perfis em pelo menos uma consulta; esta não é uma classificação exaustiva do mercado.');
 const recommendations=[
  avg!==null&&reviewGap!==null&&reviewGap>0
   ?'Seu perfil registra '+target.userRatingCount+' avaliações, contra média de '+avg+' entre os concorrentes selecionados. Convide, de forma imparcial, mais clientes elegíveis a compartilhar experiências honestas.'
   :peers.length===1
    ?'Seu perfil registra '+target.userRatingCount+' avaliações e o concorrente identificado, '+peers[0].name+', registra '+peers[0].reviewCount+'. Convide todos os clientes elegíveis a compartilhar experiências honestas, sem incentivos.'
    :'Crie uma rotina imparcial para convidar todos os clientes elegíveis a deixar avaliações honestas, acompanhando o volume de avaliações frente às empresas comparadas.',
  'Responda às avaliações recebidas de modo consistente, cordial e sem divulgar informações pessoais.',
  language
   ?'Acompanhe consultas e matrículas recebidas pelo Google Business Profile e pelo site para entender se o fortalecimento da reputação se traduz em novos alunos, sem presumir causalidade.'
   :'Acompanhe consultas, agendamentos ou vendas originados da busca local para medir resultados comerciais sem presumir causalidade.'
 ];
 return {
  version:'meulocal_top3_v2',observedAt,expiresAt,radiusMeters:radius,
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
