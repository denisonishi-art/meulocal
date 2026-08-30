import {createHash} from 'crypto';
import {createClient} from '@supabase/supabase-js';

function clientIp(request:Request){
  const forwarded=request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded||request.headers.get('x-real-ip')||'unknown';
}

export async function consumeRateLimit(request:Request,bucket:string,limit:number,windowSeconds=60){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)return {allowed:true,remaining:limit,mode:'fail_open' as const};
  const salt=process.env.RATE_LIMIT_SALT||process.env.ADMIN_ACCESS_KEY||'meulocal';
  const keyHash=createHash('sha256').update(`${salt}:${clientIp(request)}`).digest('hex');
  const db=createClient(url,key,{auth:{persistSession:false}});
  const {data,error}=await db.rpc('consume_api_rate_limit',{p_key_hash:keyHash,p_bucket:bucket,p_window_seconds:windowSeconds,p_limit:limit});
  if(error)return {allowed:true,remaining:limit,mode:'fail_open' as const};
  const row=Array.isArray(data)?data[0]:data;
  return {allowed:Boolean(row?.allowed),remaining:Number(row?.remaining||0),mode:'enforced' as const};
}
