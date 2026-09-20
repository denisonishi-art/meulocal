import {createClient} from '@supabase/supabase-js';

export async function customerContext(req:Request){
  const auth=req.headers.get('authorization');
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL;
  const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!auth?.startsWith('Bearer ')||!url||!anon||!service)return null;
  const token=auth.slice(7);
  const client=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
  const {data:{user}}=await client.auth.getUser(token);
  if(!user)return null;
  const admin=createClient(url,service,{auth:{persistSession:false}});
  const {data:account}=await admin.from('customer_accounts')
    .select('id,business_id,onboarding_status,payment_status')
    .eq('user_id',user.id).maybeSingle();
  if(!account)return {user,admin,account:null};
  return {user,admin,account};
}

export function requireActiveAccount(account:any){
  return Boolean(account&&account.payment_status==='active');
}
