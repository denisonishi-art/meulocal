import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {isAdminRequest} from '@/lib/admin-auth';

export async function GET(request:Request){
  if(!await isAdminRequest(request))return NextResponse.json({error:'Não autorizado.'},{status:401});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)return NextResponse.json({error:'Banco ainda não configurado.'},{status:503});
  const db=createClient(url,key);
  const {data,error}=await db.from('prospect_diagnostics')
    .select('id,business_name,niche,region,score,rating,review_count,status,approved_at,first_contact_at,diagnostic_opened_at,cta_clicked_at,converted_at,created_at')
    .order('created_at',{ascending:false}).limit(100);
  if(error)return NextResponse.json({error:'Não foi possível carregar o histórico.'},{status:500});
  const prospects=(data||[]).map((row:any)=>({...row,stage:row.converted_at?'Convertido':row.cta_clicked_at?'CTA acessado':row.diagnostic_opened_at?'Diagnóstico aberto':row.first_contact_at?'Contato enviado':'Diagnóstico pronto'}));
  return NextResponse.json({prospects});
}
