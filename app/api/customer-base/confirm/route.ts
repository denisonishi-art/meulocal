import {NextResponse} from 'next/server';
import {customerContext,requireActiveAccount} from '@/lib/customer-context';

export async function POST(req:Request){
 try{
  const c=await customerContext(req);
  if(!c)return NextResponse.json({error:'Não autorizado.'},{status:401});
  if(!requireActiveAccount(c.account))return NextResponse.json({error:'Assinatura ativa necessária.'},{status:403});
  const body=await req.json().catch(()=>null),id=body?.importId;
  if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return NextResponse.json({error:'Importação inválida.'},{status:400});
  const {data,error}=await c.admin.rpc('confirm_customer_import',{p_business_id:c.account!.business_id,p_user_id:c.user.id,p_import_id:id});
  if(error){const reason=String(error.message);if(reason.includes('customer_import_not_found'))return NextResponse.json({error:'Importação não encontrada.'},{status:404});if(reason.includes('customer_import_not_ready')||reason.includes('customer_import_incomplete'))return NextResponse.json({error:'A importação ainda não está pronta para confirmação. Reenvie o arquivo para conferência.'},{status:409});throw Error('confirmation_unavailable')}
  if(!data?.ok)throw Error('confirmation_unverified');
  return NextResponse.json(data);
 }catch{return NextResponse.json({error:'Não foi possível confirmar a base. Tente novamente.'},{status:503})}
}
