import {NextResponse} from 'next/server';
import {agentModels,agentPolicies} from '@/lib/agents/config';
import {isAdminRequest} from '@/lib/admin-auth';

type Place={id:string;displayName?:{text?:string};formattedAddress?:string;rating?:number;userRatingCount?:number;location?:Point;primaryType?:string;websiteUri?:string;nationalPhoneNumber?:string};
type Point={latitude:number;longitude:number};
type Coverage={low:Point;high:Point;label:string};
const states='AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
function requestedState(location:string){return location.toUpperCase().split(/[^A-Z]+/).find(token=>states.includes(token));}
async function geocodeCoverage(location:string,key:string,state:string):Promise<Coverage|null>{
  try{
    // Resolve geography with the same Places API already used for discovery.
    // Never require an independently enabled Geocoding API or an external geocoder.
    const response=await fetch('https://places.googleapis.com/v1/places:searchText',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':'places.displayName,places.formattedAddress,places.viewport,places.addressComponents,places.types'},body:JSON.stringify({textQuery:location,languageCode:'pt-BR',regionCode:'BR',maxResultCount:5}),cache:'no-store',signal:AbortSignal.timeout(10000)});
    if(!response.ok)return null;
    const body=await response.json();
    const geoTypes=['locality','sublocality','sublocality_level_1','sublocality_level_2','neighborhood','administrative_area_level_2'];
    const results=(body.places||[]).filter((r:any)=>r.types?.some((t:string)=>geoTypes.includes(t))&&r.addressComponents?.some((c:any)=>c.types?.includes('administrative_area_level_1')&&c.shortText===state));
    if(results.length!==1)return null;
    const result=results[0],v=result.viewport;
    if(!v?.low||!v?.high)return null;
    const low=v.low,high=v.high;
    if(![low.latitude,low.longitude,high.latitude,high.longitude].every(Number.isFinite)||low.latitude>=high.latitude||low.longitude>=high.longitude)return null;
    return {low,high,label:result.formattedAddress||location};
  }catch{return null}
}

async function textSearch(query:string,key:string,coverage:Coverage){
  const body:any={textQuery:query,languageCode:'pt-BR',regionCode:'BR',maxResultCount:20};
  body.locationRestriction={rectangle:{low:coverage.low,high:coverage.high}};
  const response=await fetch('https://places.googleapis.com/v1/places:searchText',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':'places.location,places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.primaryType,places.websiteUri,places.nationalPhoneNumber'},body:JSON.stringify(body),cache:'no-store'});
  const payload=await response.json();return {response,payload};
}

export async function POST(req:Request){
  if(!await isAdminRequest(req))return NextResponse.json({error:'Não autorizado.'},{status:401});
  try{
    const {niche,location}=await req.json();
    if(typeof niche!=='string'||typeof location!=='string'||!niche.trim()||!location.trim()||niche.length>80||location.length>150)return NextResponse.json({error:'Informe nicho e região.'},{status:400});
    const key=process.env.GOOGLE_PLACES_API_KEY;
    if(!key)return NextResponse.json({error:'Google Places não configurado.'},{status:503});

    const state=requestedState(location);
    if(!state)return NextResponse.json({error:'Informe cidade e UF para evitar locais homônimos. Ex.: Moema, São Paulo, SP.'},{status:400});
    const query=`${niche} em ${location}`;
    const coverage=await geocodeCoverage(location,key,state);
    if(!coverage)return NextResponse.json({error:'Não foi possível confirmar uma única região. Informe bairro, cidade e UF; a busca não foi ampliada.'},{status:422});
    const latSpan=coverage.high.latitude-coverage.low.latitude,lngSpan=coverage.high.longitude-coverage.low.longitude;
    const zones:Coverage[]=[];
    const divisions=latSpan>=0.03||lngSpan>=0.03?3:1;
    for(let row=0;row<divisions;row++)for(let col=0;col<divisions;col++)zones.push({label:coverage.label,low:{latitude:coverage.low.latitude+latSpan*row/divisions,longitude:coverage.low.longitude+lngSpan*col/divisions},high:{latitude:coverage.low.latitude+latSpan*(row+1)/divisions,longitude:coverage.low.longitude+lngSpan*(col+1)/divisions}});
    const searches=await Promise.all(zones.map(zone=>textSearch(query,key,zone)));
    const failed=searches.find(x=>!x.response.ok);
    if(failed)return NextResponse.json({error:failed.payload?.error?.message||'Falha na busca.'},{status:failed.response.status});
    const places=[...new Map(searches.flatMap(x=>x.payload.places||[]).map((place:Place)=>[place.id,place])).values()];

    const candidates=places.filter((p:Place)=>p.location&&p.location.latitude>=coverage.low.latitude&&p.location.latitude<=coverage.high.latitude&&p.location.longitude>=coverage.low.longitude&&p.location.longitude<=coverage.high.longitude).map((p:Place)=>{
      const reviews=typeof p.userRatingCount==='number'?p.userRatingCount:null;
      const rating=typeof p.rating==='number'?p.rating:null;
      const reviewScore=Math.min(100,Math.round(((reviews??0)/300)*100));
      const ratingScore=rating==null?50:Math.max(0,Math.min(100,Math.round(((rating-3)/2)*100)));
      const score=reviews===null?null:Math.round(reviewScore*0.7+ratingScore*0.3);
      return {id:p.id,name:p.displayName?.text||'',address:p.formattedAddress||'',rating,reviews,website:p.websiteUri||null,phone:p.nationalPhoneNumber||null,score,priority:score===null?'dados_insuficientes':score<35?'muito_alta':score<55?'alta':score<70?'media':'baixa'};
    }).filter((c:any)=>c.rating==null||c.rating>=agentPolicies.prospecting.minimumGoogleRating)
      .sort((a:any,b:any)=>Number(a.reviews===null)-Number(b.reviews===null)||(a.score??101)-(b.score??101)).slice(0,100);

    return NextResponse.json({query,coverage:coverage.label,totalFound:places.length,competitionMode:'auto',competitionNote:'Resultados restritos à região confirmada. A escolha das empresas é exclusivamente sua.',modelPlan:{discovery:agentModels.prospectDiscovery,decision:agentModels.prospectDecision},approvalRequired:true,contactStarted:false,candidates});
  }catch{return NextResponse.json({error:'Não foi possível pesquisar prospects agora.'},{status:500})}
}
