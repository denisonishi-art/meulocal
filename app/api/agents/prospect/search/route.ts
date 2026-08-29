import {NextResponse} from 'next/server';
import {agentModels,agentPolicies} from '@/lib/agents/config';

type Place={id:string;displayName?:{text?:string};formattedAddress?:string;rating?:number;userRatingCount?:number;primaryType?:string;websiteUri?:string};

export async function POST(req:Request){
  try{
    const {niche,location}=await req.json();
    if(!niche||!location)return NextResponse.json({error:'Informe nicho e região.'},{status:400});
    const key=process.env.GOOGLE_PLACES_API_KEY;
    if(!key)return NextResponse.json({error:'Google Places não configurado.'},{status:503});

    const query=`${niche} em ${location}`;
    const response=await fetch('https://places.googleapis.com/v1/places:searchText',{
      method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.primaryType,places.websiteUri'},
      body:JSON.stringify({textQuery:query,languageCode:'pt-BR',regionCode:'BR',maxResultCount:agentPolicies.prospecting.maxCandidatesPerSearch}),cache:'no-store'
    });
    const payload=await response.json();
    if(!response.ok)return NextResponse.json({error:payload?.error?.message||'Falha na busca.'},{status:response.status});

    const candidates=(payload.places||[]).map((p:Place)=>{
      const reviews=typeof p.userRatingCount==='number'?p.userRatingCount:0;
      const rating=typeof p.rating==='number'?p.rating:null;
      const reviewScore=Math.min(100,Math.round((reviews/300)*100));
      const ratingScore=rating==null?50:Math.max(0,Math.min(100,Math.round(((rating-3)/2)*100)));
      const score=Math.round(reviewScore*0.7+ratingScore*0.3);
      return {id:p.id,name:p.displayName?.text||'',address:p.formattedAddress||'',rating,reviews,website:p.websiteUri||null,score,priority:score<35?'muito_alta':score<55?'alta':score<70?'media':'baixa'};
    }).filter((c:any)=>c.rating==null||c.rating>=agentPolicies.prospecting.minimumGoogleRating)
      .sort((a:any,b:any)=>a.score-b.score);

    return NextResponse.json({query,modelPlan:{discovery:agentModels.prospectDiscovery,decision:agentModels.prospectDecision},approvalRequired:true,contactStarted:false,candidates});
  }catch{return NextResponse.json({error:'Não foi possível pesquisar prospects agora.'},{status:500})}
}
