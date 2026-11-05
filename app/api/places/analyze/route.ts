import { NextRequest, NextResponse } from 'next/server';
import {consumeRateLimit} from '@/lib/rate-limit';
import {isGeoPoint,selectTopLocalCompetitors,LOCAL_COMPETITOR_RADIUS_METERS,LOCAL_COMPETITOR_LIMIT} from '@/lib/competitors/top-local-reputation';

const fields = [
  'places.id','places.displayName','places.formattedAddress','places.location','places.rating','places.userRatingCount','places.websiteUri','places.primaryType','places.types','places.businessStatus',
].join(',');

function clamp(value:number,min=0,max=100){return Math.max(min,Math.min(max,value))}
function presenceBand(score:number){if(score<=30)return{key:'critical',label:'Crítica'};if(score<=50)return{key:'weak',label:'Fraca'};if(score<=70)return{key:'competitive',label:'Competitiva'};return{key:'strong',label:'Forte'}}
export async function POST(req:NextRequest){
  const rate=await consumeRateLimit(req,'places_analyze',6,60);
  if(!rate.allowed)return NextResponse.json({error:'Muitas análises em pouco tempo. Aguarde um minuto e tente novamente.'},{status:429,headers:{'Retry-After':'60'}});
  try{
    const place=await req.json();
    if(!place?.id)return NextResponse.json({error:'Empresa inválida.'},{status:400});
    const apiKey=process.env.GOOGLE_PLACES_API_KEY;if(!apiKey)return NextResponse.json({error:'Google Places não configurado.'},{status:500});

    const category=String(place.category||'').toLowerCase();
    const center={latitude:place.latitude,longitude:place.longitude};
    if(!isGeoPoint(center)||!/^[a-z][a-z_]{1,79}$/.test(category))
      return NextResponse.json({error:'Não foi possível confirmar a localização e a categoria da empresa. Não ampliaremos a busca além de 3 km.'},{status:422});

    // Search one category in a strict 3 km circle. Re-rank the returned candidates
    // by volume-adjusted Google rating: provider popularity is not the MeuLocal ranking.
    const body={languageCode:'pt-BR',regionCode:'BR',maxResultCount:20,rankPreference:'POPULARITY',
      includedTypes:[category],
      locationRestriction:{circle:{center,radius:LOCAL_COMPETITOR_RADIUS_METERS}}};
    const response=await fetch('https://places.googleapis.com/v1/places:searchNearby',{
      method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':apiKey,'X-Goog-FieldMask':fields},
      body:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(15000)
    });
    const payload=await response.json();
    if(!response.ok)return NextResponse.json({error:payload?.error?.message||'Falha ao analisar concorrentes.'},{status:response.status});
    const searched=Array.isArray(payload.places)?payload.places:[];
    const competitors=selectTopLocalCompetitors({
      businessId:place.id,center,businessCategory:category,places:searched
    });
    const competitionMode='local_radius' as const;
    const scoringCompetitors=competitors.filter(c=>c.reviewDataReliable);
    const avgReviews=scoringCompetitors.length?scoringCompetitors.reduce((sum,c)=>sum+c.reviewCount,0)/scoringCompetitors.length:0;
    const businessReviewCount=typeof place.reviewCount==='number'?place.reviewCount:0;
    const businessReviewDataReliable=businessReviewCount>0;
    const competitorReviewDataReliable=scoringCompetitors.length>=2;
    const reviewComparisonReliable=businessReviewDataReliable&&competitorReviewDataReliable;
    const reviewScore=reviewComparisonReliable?clamp((businessReviewCount/avgReviews)*100):null;
    const ratingScore=typeof place.rating==='number'?clamp(((place.rating-3)/2)*100):null;
    const profileScore=place.website?70:45;const seoScore=place.website?55:35;const authorityScore=40;
    const components=[reviewScore==null?null:{value:reviewScore,weight:.45},ratingScore==null?null:{value:ratingScore,weight:.15},{value:profileScore,weight:.15},{value:seoScore,weight:.15},{value:authorityScore,weight:.10}].filter((component):component is {value:number;weight:number}=>component!==null);
    const totalWeight=components.reduce((sum,c)=>sum+c.weight,0);const score=Math.round(components.reduce((sum,c)=>sum+c.value*c.weight,0)/totalWeight);
    const band=presenceBand(score);const gainPotential=score<=50?'Alto':score<=70?'Médio':'Baixo';const reviewGap=reviewComparisonReliable?Math.max(0,Math.round(avgReviews-businessReviewCount)):null;
    const dataWarnings:string[]=[];
    if(competitors.length<LOCAL_COMPETITOR_LIMIT)dataWarnings.push('Identificamos apenas '+competitors.length+' concorrente(s) com nota, volume e localização válidos dentro de 3 km. Não ampliamos o raio.');
    if(searched.length>=20)dataWarnings.push('A API do Google limita esta consulta a 20 perfis. Estes são os melhores dentre os resultados encontrados, não um ranking exaustivo de todo o mercado.');
    if(!businessReviewDataReliable)dataWarnings.push('O Google não retornou uma contagem confiável de avaliações para esta empresa. Esse dado foi excluído do cálculo.');
    if(!competitorReviewDataReliable)dataWarnings.push('Não encontramos pelo menos dois concorrentes com contagem confiável de avaliações. A comparação de reviews foi excluída do cálculo.');
    const competitorPhrase='concorrentes selecionados em até 3 km';
    const gaps=[reviewGap!=null&&reviewGap>0?`${competitorPhrase} têm, em média, ${Math.round(avgReviews)} avaliações. Você tem ${businessReviewCount}.`:null,!place.website?'Seu perfil não apresenta um site associado, o que reduz sinais de autoridade e conversão.':null,typeof place.rating==='number'&&scoringCompetitors.length>=2&&place.rating<(scoringCompetitors.reduce((sum,c)=>sum+c.rating,0)/scoringCompetitors.length)?`Sua nota é ${place.rating}, abaixo da média observada entre os concorrentes selecionados.`:null].filter((gap):gap is string=>Boolean(gap));

    return NextResponse.json({business:place,competitors,competition:{mode:competitionMode,label:'concorrentes da mesma categoria em até 3 km',radiusMeters:LOCAL_COMPETITOR_RADIUS_METERS,method:'google_places_nearby',selection:'top_3_volume_adjusted_rating',candidateCount:searched.length,maxResultsPerQuery:20},metrics:{score,band:band.label,bandKey:band.key,gainPotential,avgCompetitorReviews:reviewComparisonReliable?Math.round(avgReviews):null,reviewGap,reviewScore:reviewScore==null?null:Math.round(reviewScore),ratingScore:ratingScore==null?null:Math.round(ratingScore),reviewComparisonReliable},dataQuality:{status:dataWarnings.length?'partial':'reliable',warnings:dataWarnings,reliableCompetitors:scoringCompetitors.length},gaps});
  }catch{return NextResponse.json({error:'Não foi possível concluir a análise agora.'},{status:500})}
}
