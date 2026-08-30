import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {syncGoogleReputation} from '@/lib/google-reputation-sync';

export async function GET(request:Request){
  const secret=process.env.CRON_SECRET;
  if(!secret||request.headers.get('authorization')!==`Bearer ${secret}`)return NextResponse.json({error:'Não autorizado.'},{status:401});
  const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL,serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!supabaseUrl||!serviceKey)return NextResponse.json({error:'Supabase não configurado.'},{status:503});
  const admin=createClient(supabaseUrl,serviceKey);
  const {data:connections}=await admin.from('google_business_connections').select('user_id,business_id,google_account_id,google_location_id,refresh_token_ciphertext').eq('status','connected');
  let synced=0,failed=0;
  for(const conn of connections||[]){
    try{
      if(!conn.refresh_token_ciphertext||!conn.google_account_id||!conn.google_location_id){failed++;continue;}
      await syncGoogleReputation(admin,conn,'cron');synced++;
    }catch{failed++;}
  }
  return NextResponse.json({ok:true,synced,failed,total:(connections||[]).length});
}
