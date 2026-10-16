import {timingSafeEqual} from 'node:crypto';
import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {processNextReviewDelivery} from '@/lib/reviews/delivery';

export const maxDuration=60;
export async function GET(request:Request){return run(request)}
export async function POST(request:Request){return run(request)}

async function run(request:Request){
 const secret=process.env.CRON_SECRET,provided=Buffer.from(request.headers.get('authorization')||''),expected=Buffer.from('Bearer '+(secret||''));
 if(!secret||provided.length!==expected.length||!timingSafeEqual(provided,expected))return NextResponse.json({error:'Não autorizado.'},{status:401});
 if(process.env.MEULOCAL_REVIEW_OUTREACH_ENABLED!=='true')return NextResponse.json(await processNextReviewDelivery(null));
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return NextResponse.json({ok:false,error:'review_database_not_configured'},{status:503});
 try{
  const db=createClient(url,key,{auth:{persistSession:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(5000)})}});
  const result=await processNextReviewDelivery(db);
  return NextResponse.json(result,{status:result.ok?200:503});
 }catch{return NextResponse.json({ok:false,error:'review_processing_unavailable'},{status:503})}
}
