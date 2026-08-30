import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {decryptToken} from '@/lib/google-business-server';

export async function POST(request:Request){
  const auth=request.headers.get('authorization');
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,service=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!auth?.startsWith('Bearer ')||!url||!anon||!service)return NextResponse.json({error:'Não autorizado.'},{status:401});
  const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}});const {data:{user}}=await userClient.auth.getUser(auth.slice(7));
  if(!user)return NextResponse.json({error:'Sessão inválida.'},{status:401});
  const admin=createClient(url,service);
  const {data:connections}=await admin.from('google_business_connections').select('id,refresh_token_ciphertext').eq('user_id',user.id).neq('status','revoked');
  for(const conn of connections||[]){
    if(conn.refresh_token_ciphertext){
      try{
        const token=decryptToken(conn.refresh_token_ciphertext);
        await fetch('https://oauth2.googleapis.com/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token}),cache:'no-store'});
      }catch{/* local disconnect must still proceed */}
    }
  }
  const {error}=await admin.from('google_business_connections').update({status:'revoked',refresh_token_ciphertext:null,last_sync_status:null,last_sync_error:null}).eq('user_id',user.id);
  if(error)return NextResponse.json({error:'Não foi possível desconectar agora.'},{status:500});
  return NextResponse.json({ok:true});
}
