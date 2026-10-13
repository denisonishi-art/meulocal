import {NextRequest,NextResponse} from 'next/server';
import {consumeRateLimit} from '@/lib/rate-limit';
import {discoverGooglePlaces} from '@/lib/agents/places-discovery';
export async function POST(req:NextRequest){
 const rate=await consumeRateLimit(req,'places_search',12,60);
 if(!rate.allowed)return NextResponse.json({error:'Muitas buscas em pouco tempo. Aguarde um minuto e tente novamente.'},{status:429,headers:{'Retry-After':'60'}});
 try{
  const {query}=await req.json();if(typeof query!=='string'||query.trim().length<3||query.length>180)return NextResponse.json({error:'Informe empresa e localização.'},{status:400});
  const key=process.env.GOOGLE_PLACES_API_KEY;if(!key)return NextResponse.json({error:'Google Places não configurado.'},{status:500});
  const result=await discoverGooglePlaces(query.trim(),8,key);
  if(!result.places.length)return NextResponse.json({error:'Não encontramos empresas no Brasil com essa busca. Informe também a cidade.'},{status:404});
  // Keep legacy UI projection/default; source-aware worker uses the dedicated endpoint.
  return NextResponse.json({...result,places:result.places.map((p:any)=>({...p,reviewCount:p.reviewCount??0}))},{headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({error:'Não foi possível buscar agora.'},{status:502})}
}
