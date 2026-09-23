import {NextResponse} from 'next/server';
import {agentModels,agentPolicies} from '@/lib/agents/config';
import {isAdminRequest} from '@/lib/admin-auth';

type Place={id:string;displayName?:{text?:string};formattedAddress?:string;rating?:number;userRatingCount?:number;primaryType?:string;websiteUri?:string;nationalPhoneNumber?:string};
type Point={latitude:number;longitude:number};

async function geocodeCoverage(location:string,key:string){
  try{
    const url=`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${encodeURIComponent(key)}&language=pt-BR&region=BR`;
    const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(7000)});const body=await response.json();
    let geometry=body?.results?.[0]?.geometry;
    if(!geometry?.location){
      const fallback=await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(location)}`,{headers:{'User-Agent':'MeuLocal prospect discovery'},cache:'no-store',signal:AbortSignal.timeout(7000)});
      const row=(await fallback.json())[0];
      if(!row?.lat||!row?.lon)return null;
      const [south,north,west,east]=(row.boundingbox||[]).map(Number);
      geometry={location:{lat:Number(row.lat),lng:Number(row.lon)},viewport:{northeast:{lat:north,lng:east},southwest:{lat:south,lng:west}}};
    }
    const center:Point={latitude:geometry.location.lat,longitude:geometry.location.lng};
    const viewport=geometry.viewport;
    if(!viewport?.northeast||!viewport?.southwest)return {centers:[center],radius:12000};
    const north=viewport.northeast.lat,south=viewport.southwest.lat,east=viewport.northeast.lng,west=viewport.southwest.lng;
    const latSpan=Math.abs(north-south),lngSpan=Math.abs(east-west);
    if(latSpan<0.03&&lngSpan<0.03)return {centers:[center],radius:9000};
    const centers:Point[]=[];
    for(const lat of [south+latSpan*.2,south+latSpan*.5,south+latSpan*.8])for(const lng of [west+lngSpan*.2,west+lngSpan*.5,west+lngSpan*.8])centers.push({latitude:lat,longitude:lng});
    const radius=Math.max(7000,Math.min(30000,Math.round(Math.max(latSpan*111000,lngSpan*111000)*.32)));
    return {centers,radius};
  }catch{return null}
}

async function textSearch(query:string,key:string,center?:Point,radius?:number){
  const body:any={textQuery:query,languageCode:'pt-BR',regionCode:'BR',maxResultCount:20};
  if(center&&radius)body.locationBias={circle:{center,radius}};
  const response=await fetch('https://places.googleapis.com/v1/places:searchText',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.primaryType,places.websiteUri,places.nationalPhoneNumber'},body:JSON.stringify(body),cache:'no-store'});
  const payload=await response.json();return {response,payload};
}

export async function POST(req:Request){
  if(!await isAdminRequest(req))return NextResponse.json({error:'Não autorizado.'},{status:401});
  try{
    const {niche,location}=await req.json();
    if(!niche||!location)return NextResponse.json({error:'Informe nicho e região.'},{status:400});
    const key=process.env.GOOGLE_PLACES_API_KEY;
    if(!key)return NextResponse.json({error:'Google Places não configurado.'},{status:503});

    const query=`${niche} em ${location}`;
    const coverage=await geocodeCoverage(location,key);
    const searches=coverage?.centers?.length?await Promise.all(coverage.centers.map(center=>textSearch(query,key,center,coverage.radius))):[await textSearch(query,key)];
    const failed=searches.find(x=>!x.response.ok);
    if(failed)return NextResponse.json({error:failed.payload?.error?.message||'Falha na busca.'},{status:failed.response.status});
    const places=[...new Map(searches.flatMap(x=>x.payload.places||[]).map((place:Place)=>[place.id,place])).values()];

    const candidates=places.map((p:Place)=>{
      const reviews=typeof p.userRatingCount==='number'?p.userRatingCount:0;
      const rating=typeof p.rating==='number'?p.rating:null;
      const reviewScore=Math.min(100,Math.round((reviews/300)*100));
      const ratingScore=rating==null?50:Math.max(0,Math.min(100,Math.round(((rating-3)/2)*100)));
      const score=Math.round(reviewScore*0.7+ratingScore*0.3);
      return {id:p.id,name:p.displayName?.text||'',address:p.formattedAddress||'',rating,reviews,website:p.websiteUri||null,phone:p.nationalPhoneNumber||null,score,priority:score<35?'muito_alta':score<55?'alta':score<70?'media':'baixa'};
    }).filter((c:any)=>c.rating==null||c.rating>=agentPolicies.prospecting.minimumGoogleRating)
      .sort((a:any,b:any)=>a.score-b.score).slice(0,100);

    return NextResponse.json({query,coverage:coverage?.centers?.length?`${coverage.centers.length} zonas de busca em ${location}`:'Busca por relevância',totalFound:places.length,competitionMode:'auto',competitionNote:'Raio físico não é regra; o escopo competitivo deve ser validado antes da abordagem.',modelPlan:{discovery:agentModels.prospectDiscovery,decision:agentModels.prospectDecision},approvalRequired:true,contactStarted:false,candidates});
  }catch{return NextResponse.json({error:'Não foi possível pesquisar prospects agora.'},{status:500})}
}
