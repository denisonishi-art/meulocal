import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isAdminRequest } from '@/lib/admin-auth';

export const dynamic='force-dynamic';
export async function GET(request:Request) {
 if(!await isAdminRequest(request))return NextResponse.json({error:'Não autorizado.'},{status:401});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL;
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return NextResponse.json({error:'Banco não configurado.'},{status:503});
 const db=createClient(url,key,{auth:{persistSession:false}});
 const [diagnostics,leads,events,enrollments]=await Promise.all([
  db.from('prospect_diagnostics').select('id,status,score,competitor_avg_reviews,first_contact_at,diagnostic_opened_at,cta_clicked_at,converted_at,created_at').order('created_at',{ascending:false}).limit(1000),
  db.from('leads').select('id,last_reply_at,lifecycle_stage,ghl_contact_id').order('created_at',{ascending:false}).limit(1000),
  db.from('outreach_events').select('id,channel,event_type,external_id,created_at').order('created_at',{ascending:false}).limit(1000),
  db.from('automation_enrollments').select('id,status,step,next_run_at').order('started_at',{ascending:false}).limit(1000)
 ]);
 const failures=[diagnostics.error,leads.error,events.error,enrollments.error].filter(Boolean);
 if(failures.length)return NextResponse.json({error:'Falha ao ler indicadores; números não foram calculados.'},{status:502});
 const d=diagnostics.data||[],l=leads.data||[],e=events.data||[],a=enrollments.data||[];
 const byChannel=(channel:string)=>({
  queued:e.filter(x=>x.channel===channel&&x.event_type==='queued').length,
  sent:e.filter(x=>x.channel===channel&&x.event_type==='sent').length,
  sentWithProviderId:e.filter(x=>x.channel===channel&&x.event_type==='sent'&&Boolean(x.external_id)).length,
  repliedEvents:e.filter(x=>x.channel===channel&&x.event_type==='replied').length,
  failed:e.filter(x=>x.channel===channel&&x.event_type==='failed').length,
 });
 const now=Date.now();
 const metrics={
  diagnostics:d.length,diagnosticsContacted:d.filter(x=>x.status==='contacted').length,
  diagnosticOpened:d.filter(x=>x.diagnostic_opened_at).length,
  diagnosticClicked:d.filter(x=>x.cta_clicked_at).length,
  converted:d.filter(x=>x.converted_at||x.status==='converted').length,
  withCompetitorComparison:d.filter(x=>x.competitor_avg_reviews!=null).length,
  leads:l.length, leadsWithGhlContact:l.filter(x=>x.ghl_contact_id).length,
  repliesInLeads:l.filter(x=>x.last_reply_at).length,
  qualified:l.filter(x=>x.lifecycle_stage==='conversation').length,
  activeAutomations:a.filter(x=>x.status==='active').length,
  overdueAutomations:a.filter(x=>x.status==='active'&&x.next_run_at&&new Date(x.next_run_at).getTime()<now).length,
  email:byChannel('email'),whatsapp:byChannel('whatsapp')
 };
 return NextResponse.json({
  asOf:new Date().toISOString(),metrics,
  limitations:['Fila não comprova envio','ID do provedor não comprova entrega','Aberturas/cliques podem depender de instrumentação','Respostas GHL não estão conciliadas nesta consulta'],
  sampleTruncated:[d,l,e,a].some(rows=>rows.length>=1000)
 },{headers:{'Cache-Control':'no-store'}});
}
