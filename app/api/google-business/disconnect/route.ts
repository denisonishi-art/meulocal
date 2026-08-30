import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';

export async function POST(request:Request){
  const auth=request.headers.get('authorization');
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,service=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!auth?.startsWith('Bearer ')||!url||!anon||!service)return NextResponse.json({error:'Não autorizado.'},{status:401});
  const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}});const {data:{user}}=await userClient.auth.getUser(auth.slice(7));
  if(!user)return NextResponse.json({error:'Sessão inválida.'},{status:401});
  const admin=createClient(url,service);
  const {error}=await admin.from('google_business_connections').update({status:'revoked',refresh_token_ciphertext:null,last_sync_status:null,last_sync_error:null}).eq('user_id',user.id);
  if(error)return NextResponse.json({error:'Não foi possível desconectar agora.'},{status:500});
  return NextResponse.json({ok:true});
}
