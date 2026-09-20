import {NextResponse} from 'next/server';
import {customerContext,requireActiveAccount} from '@/lib/customer-context';

export async function POST(req:Request){
  const c=await customerContext(req);
  if(!c)return NextResponse.json({error:'Não autorizado.'},{status:401});
  if(!requireActiveAccount(c.account))return NextResponse.json({error:'Assinatura ativa necessária.'},{status:403});
  try{
    const {importId}=await req.json();
    if(!importId)return NextResponse.json({error:'Importação inválida.'},{status:400});
    const {data:imp}=await c.admin.from('customer_imports').select('id,status,business_id,valid_rows,total_rows,invalid_rows,duplicate_rows').eq('id',importId).eq('business_id',c.account!.business_id).maybeSingle();
    if(!imp)return NextResponse.json({error:'Importação não encontrada.'},{status:404});
    if(imp.status==='confirmed')return NextResponse.json({ok:true,alreadyConfirmed:true,summary:imp});
    if(imp.status!=='ready')return NextResponse.json({error:'Esta importação ainda não está pronta para confirmação.'},{status:409});

    const now=new Date().toISOString();
    const {error:contactsError}=await c.admin.from('customer_contacts').update({status:'eligible',updated_at:now}).eq('import_id',importId).eq('business_id',c.account!.business_id).eq('status','imported');
    if(contactsError)throw contactsError;
    const {data:confirmed,error:importError}=await c.admin.from('customer_imports').update({status:'confirmed',confirmed_at:now}).eq('id',importId).eq('business_id',c.account!.business_id).select('id,total_rows,valid_rows,invalid_rows,duplicate_rows,confirmed_at').single();
    if(importError)throw importError;
    return NextResponse.json({ok:true,summary:confirmed});
  }catch(error:any){
    return NextResponse.json({error:error?.message||'Não foi possível confirmar a base.'},{status:500});
  }
}