import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {drainOpenDotsOutbox} from '@/lib/agents/opendots-outbox';
export const maxDuration=60;
export async function GET(request:Request){
 const secret=process.env.CRON_SECRET;
 if(!secret||request.headers.get('authorization')!=='Bearer '+secret)return NextResponse.json({error:'unauthorized'},{status:401});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return NextResponse.json({error:'not_configured'},{status:503});
 const result=await drainOpenDotsOutbox(createClient(url,key,{auth:{persistSession:false}}));
 return NextResponse.json(result,{status:result.ok?200:503});
}
