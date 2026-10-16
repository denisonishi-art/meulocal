import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {paymentPlans} from '@/lib/payments/plans';
export const dynamic='force-dynamic';
export async function GET(){
 const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return json({error:'Contratação indisponível.'},503);
 try{
  const db=createClient(url,key,{auth:{persistSession:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(5000)})}});
  const {data,error}=await db.from('payment_plan_catalog').select('id,amount_cents,cycle,checkout_enabled').in('id',Object.keys(paymentPlans));
  if(error||data?.length!==2)throw Error();
  const plans=Object.values(paymentPlans).map(plan=>{const row=data.find(r=>r.id===plan.id);if(!row||row.amount_cents!==plan.amountCents||row.cycle!=='MONTHLY')throw Error();return {id:plan.id,name:plan.name,amountCents:row.amount_cents,cycle:row.cycle,checkoutEnabled:row.checkout_enabled===true}});
  return json({plans});
 }catch{return json({error:'Contratação indisponível. Os valores precisam ser conferidos.'},503)}
}
