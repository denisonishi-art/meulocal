import {NextResponse} from 'next/server';
import {z} from 'zod';
import {researchAuthorized,researchRateLimit,boundedResearchJson} from '@/lib/agents/research-security';
import {discoverGooglePlaces} from '@/lib/agents/places-discovery';
export const runtime='nodejs';
const schema=z.object({query:z.string().trim().min(3).max(180),limit:z.number().int().min(1).max(20).default(5)}).strict();
/** Dedicated read-only worker discovery. No broader CRON_SECRET or CRM writes. */
export async function POST(req:Request){
 if(!researchAuthorized(req))return NextResponse.json({error:'unauthorized'},{status:401});
 if(process.env.MEULOCAL_RESEARCH_ENABLED!=='true')return NextResponse.json({error:'research_disabled'},{status:423});
 const rate=await researchRateLimit(req,'prospector_discovery');
 if(rate.mode!=='enforced')return NextResponse.json({error:'rate_limit_unavailable'},{status:503});
 if(!rate.allowed)return NextResponse.json({error:'rate_limited'},{status:429,headers:{'Retry-After':'60'}});
 let raw:unknown;try{raw=await boundedResearchJson(req)}catch(error){return NextResponse.json({error:'invalid_payload'},{status:error instanceof Error&&error.message==='payload_too_large'?413:400})}
 const parsed=schema.safeParse(raw);if(!parsed.success)return NextResponse.json({error:'invalid_payload'},{status:400});
 const key=process.env.GOOGLE_PLACES_API_KEY;if(!key)return NextResponse.json({error:'google_places_not_configured'},{status:503});
 try{return NextResponse.json({...await discoverGooglePlaces(parsed.data.query,parsed.data.limit,key),actions:{crmWrite:false,outboundMessages:false,humanReviewRequired:true}},{headers:{'Cache-Control':'no-store'}})}catch(error){const code=error instanceof Error?error.message:'';return NextResponse.json({error:/^google_http_\d+$/.test(code)?code:'source_unavailable'},{status:502})}
}
