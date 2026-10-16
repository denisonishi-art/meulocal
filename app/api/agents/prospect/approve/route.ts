import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {z} from 'zod';
import {agentPolicies} from '@/lib/agents/config';
import {isAdminRequest} from '@/lib/admin-auth';
const optionalText=(limit:number)=>z.string().max(limit).nullish();
const prospectSchema=z.object({
 id:z.string().trim().min(1).max(300),name:z.string().trim().min(1).max(240),score:z.number().int().min(0).max(100),
 address:optionalText(1000),rating:z.number().min(0).max(5).nullish(),reviews:z.number().int().min(0).max(100000000).optional(),
 website:optionalText(2000),phone:optionalText(100),competitorAverageReviews:z.number().min(0).max(100000000).nullish(),
 niche:optionalText(200),region:optionalText(200),competitionMode:z.enum(['local_radius','city_region','search_market']).optional(),competitionLabel:optionalText(500),searchIntent:optionalText(1000)
});
const bodySchema=z.object({approved:z.array(prospectSchema).optional(),prospects:z.array(prospectSchema).optional(),niche:optionalText(200),location:optionalText(200),competitionMode:z.enum(['local_radius','city_region','search_market']).optional(),competitionLabel:optionalText(500),searchIntent:optionalText(1000)});
export async function POST(req:Request){
 if(!await isAdminRequest(req))return NextResponse.json({error:'Não autorizado.'},{status:401});
 const body=bodySchema.safeParse(await req.json().catch(()=>null));
 if(!body.success)return NextResponse.json({error:'Dados inválidos para preparar os diagnósticos.'},{status:400});
 const items=body.data.prospects||body.data.approved||[];
 if(!items.length||items.length>agentPolicies.prospecting.maxApprovedBatch||new Set(items.map(p=>p.id)).size!==items.length)return NextResponse.json({error:'Selecione de 1 a '+agentPolicies.prospecting.maxApprovedBatch+' empresas distintas.'},{status:400});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return NextResponse.json({error:'Banco não configurado.',contactStarted:0},{status:503});
 try{
  const db=createClient(url,key,{auth:{persistSession:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(10000)})}});
  const {data,error}=await db.rpc('prepare_prospect_diagnostics',{p_items:items.map(p=>({...p,niche:p.niche||body.data.niche,region:p.region||body.data.location,competitionMode:p.competitionMode||body.data.competitionMode,competitionLabel:p.competitionLabel||body.data.competitionLabel,searchIntent:p.searchIntent||body.data.searchIntent}))});
  if(error||!Array.isArray(data?.diagnostics)){
   const conflict=['prospect_diagnostic_ambiguous','prospect_lead_ambiguous','prospect_lead_scope_conflict'].includes(error?.message||'');
   return NextResponse.json({error:conflict?'Há vínculos anteriores que exigem conferência antes de preparar o diagnóstico.':'Não foi possível salvar os diagnósticos. Tente novamente.',contactStarted:0},{status:conflict?409:503});
  }
  return NextResponse.json({ok:true,status:'prepared_for_review',contactStarted:0,dispatched:[],diagnostics:data.diagnostics.map((d:any)=>({...d,url:'/d/'+d.public_token}))},{headers:{'Cache-Control':'private, no-store'}});
 }catch{return NextResponse.json({error:'Não foi possível salvar os diagnósticos. Tente novamente.',contactStarted:0},{status:503})}
}
