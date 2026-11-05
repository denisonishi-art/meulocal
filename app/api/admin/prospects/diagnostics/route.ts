import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {isAdminRequest} from '@/lib/admin-auth';
import {diagnosticContactStatus,DiagnosticContactEvent} from '@/lib/agents/diagnostic-contact-status';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
type DiagnosticRow={
 id:string;public_token:string;place_id:string;business_name:string;
 niche:string|null;region:string|null;status:string;created_at:string;
};
type ReportRow={diagnostic_id:string;google_place_id:string;expires_at:string;snapshot:any};
export async function GET(req:Request){
 if(!await isAdminRequest(req))return json({error:'Não autorizado.'},401);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL;
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return json({error:'Banco não configurado.'},503);
 try{
  const db=createClient(url,key,{auth:{persistSession:false}});
  const {data:diagnostics,error:diagnosticsError}=await db.from('prospect_diagnostics')
   .select('id,public_token,place_id,business_name,niche,region,status,created_at')
   .order('created_at',{ascending:false}).limit(500);
  if(diagnosticsError||!Array.isArray(diagnostics))return json({error:'Histórico de diagnósticos indisponível.'},503);
  if(!diagnostics.length)return json({diagnostics:[],total:0,contactSource:'highlevel_outreach_events'});
  // Strictly correlate any outbound evidence to the lead linked to this
  // diagnostic. A saved analysis is not evidence of a message being sent.
  const ids=(diagnostics as DiagnosticRow[]).map(d=>d.id);
  const {data:leads,error:leadError}=await db.from('leads')
   .select('id,prospect_diagnostic_id').in('prospect_diagnostic_id',ids).limit(1500);
  if(leadError||!Array.isArray(leads))return json({error:'Não foi possível verificar o histórico de contato.'},503);
  const leadIds=leads.map(l=>l.id);
  const [eventsResult,reportsResult]=await Promise.all([
   leadIds.length?db.from('outreach_events')
    .select('lead_id,event_type,channel,provider,created_at')
    .in('lead_id',leadIds).order('created_at',{ascending:false}).limit(3000)
    :Promise.resolve({data:[],error:null}),
   db.from('prospect_comparison_reports')
    .select('diagnostic_id,google_place_id,expires_at,snapshot')
    .in('diagnostic_id',ids).limit(500)
  ]);
  if(eventsResult.error||reportsResult.error||!Array.isArray(eventsResult.data)||!Array.isArray(reportsResult.data)
     ||leads.length>=1500||eventsResult.data.length>=3000)return json({error:'Histórico incompleto: não é possível afirmar o status do envio.'},503);
  const eventsByLead=new Map<string,DiagnosticContactEvent[]>();
  for(const event of eventsResult.data){
   const list=eventsByLead.get(event.lead_id)||[];
   list.push(event as DiagnosticContactEvent);
   eventsByLead.set(event.lead_id,list);
  }
  const leadsByDiagnostic=new Map<string,string[]>();
  for(const lead of leads){
   const list=leadsByDiagnostic.get(lead.prospect_diagnostic_id)||[];
   list.push(lead.id);leadsByDiagnostic.set(lead.prospect_diagnostic_id,list);
  }
  const reportByDiagnostic=new Map((reportsResult.data as ReportRow[]).map(r=>[r.diagnostic_id,r]));
  const rows=(diagnostics as DiagnosticRow[]).map(d=>{
   const linkedLeads=leadsByDiagnostic.get(d.id)||[];
   const recorded=linkedLeads.flatMap(leadId=>eventsByLead.get(leadId)||[]);
   const contact=linkedLeads.length>1
    ?{state:'saved' as const,label:'Vínculo ambíguo — verificar manualmente',evidenceAt:null,channel:null}
    :diagnosticContactStatus(recorded);
   const report=reportByDiagnostic.get(d.id);
   const snapshot=report?.snapshot;
   const reportReady=Boolean(report&&report.google_place_id===d.place_id
    &&Date.parse(report.expires_at)>Date.now()&&['meulocal_top3_v1','meulocal_top3_v2'].includes(snapshot?.version)
    &&[3000,5000].includes(snapshot?.radiusMeters)&&Array.isArray(snapshot?.competitors)
    &&snapshot.competitors.length>=1&&snapshot.competitors.length<=3);
   return {
    id:d.id,business_name:d.business_name,niche:d.niche,region:d.region,status:d.status,
    created_at:d.created_at,url:'/d/'+d.public_token,
    contact,reportReady,
    reportCount:reportReady?snapshot.competitors.length:0
   };
  });
  return json({diagnostics:rows,total:rows.length,contactSource:'highlevel_outreach_events'});
 }catch{
  return json({error:'Não foi possível verificar o histórico do MeuLocal.'},503);
 }
}
