import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';

export async function POST(request:Request){
 try{
  const authorization=request.headers.get('authorization');
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,service=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!authorization?.startsWith('Bearer ')||!url||!anon||!service)return NextResponse.json({error:'Não autorizado.'},{status:401});
  const boundedFetch:typeof fetch=(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(10000)});
  const client=createClient(url,anon,{global:{headers:{Authorization:authorization},fetch:boundedFetch},auth:{persistSession:false}});
  const {data,error}=await client.auth.getUser(authorization.slice(7));
  if(error||!data?.user?.email||!data.user.email_confirmed_at)return NextResponse.json({error:'Não autorizado.'},{status:401});
  const admin=createClient(url,service,{auth:{persistSession:false},global:{fetch:boundedFetch}});
  const result=await admin.rpc('claim_customer_access',{p_user_id:data.user.id});
  if(result.error)return NextResponse.json({error:'Não foi possível conferir seu acesso. Tente novamente.'},{status:503});
  const state=result.data?.state;
  if(state==='linked'&&result.data.businessId)return NextResponse.json({ok:true,linked:true,businessId:result.data.businessId});
  if(state==='unauthorized')return NextResponse.json({error:'Não autorizado.'},{status:401});
  if(state==='not_found')return NextResponse.json({error:'Não encontramos uma ativação vinculada a este e-mail.'},{status:404});
  if(state==='inactive')return NextResponse.json({error:'Este acesso já está vinculado ou a ativação ainda não foi confirmada.'},{status:409});
  return NextResponse.json({error:'Não foi possível conferir seu acesso. Tente novamente.'},{status:503});
 }catch{return NextResponse.json({error:'Não foi possível conferir seu acesso. Tente novamente.'},{status:503})}
}
