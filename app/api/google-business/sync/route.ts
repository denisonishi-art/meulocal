import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {syncGoogleReputation} from '@/lib/google-reputation-sync';

export async function POST(request:Request){
  const auth=request.headers.get('authorization');
  const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL,anonKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!auth?.startsWith('Bearer ')||!supabaseUrl||!anonKey||!serviceKey)return NextResponse.json({error:'Não autorizado.'},{status:401});
  const userClient=createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:auth}}});
  const {data:{user}}=await userClient.auth.getUser(auth.slice(7));
  if(!user)return NextResponse.json({error:'Sessão inválida.'},{status:401});
  const admin=createClient(supabaseUrl,serviceKey);
  const {data:conn}=await admin.from('google_business_connections').select('user_id,business_id,google_account_id,google_location_id,refresh_token_ciphertext').eq('user_id',user.id).eq('status','connected').maybeSingle();
  if(!conn?.refresh_token_ciphertext||!conn.google_account_id||!conn.google_location_id)return NextResponse.json({error:'Google Business Profile ainda não está conectado.'},{status:409});
  try{
    const snapshot=await syncGoogleReputation(admin,conn,'manual');
    return NextResponse.json({ok:true,score:snapshot.score,band:snapshot.band,scoreVersion:snapshot.score_version,reviewCount:snapshot.review_count,rating:snapshot.google_rating,responseRate:snapshot.response_rate,reviewsLast30d:snapshot.reviews_last_30d,pagesFetched:snapshot.pagesFetched,reviewsTruncated:snapshot.reviewsTruncated});
  }catch(error:any){
    return NextResponse.json({error:error?.message||'Não foi possível sincronizar avaliações.'},{status:502});
  }
}
