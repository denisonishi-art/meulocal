import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {agentPolicies} from '@/lib/agents/config';
import {isAdminRequest} from '@/lib/admin-auth';

type ApprovedProspect={id:string;name:string;address?:string;rating?:number|null;reviews?:number;score:number;competitorAverageReviews?:number|null;niche?:string;region?:string;competitionMode?:'local_radius'|'city_region'|'search_market';competitionLabel?:string|null;searchIntent?:string|null};

export async function POST(req:Request){
  if(!await isAdminRequest(req))return NextResponse.json({error:'Não autorizado.'},{status:401});
  try{
    const body=await req.json();
    const approved:ApprovedProspect[]=Array.isArray(body.approved)?body.approved:[];
    const approvedIds:string[]=Array.isArray(body.approvedIds)?body.approvedIds:[];
    const count=approved.length||approvedIds.length;
    if(count===0)return NextResponse.json({error:'Selecione pelo menos um prospect.'},{status:400});
    if(count>agentPolicies.prospecting.maxApprovedBatch)return NextResponse.json({error:`Aprovação limitada a ${agentPolicies.prospecting.maxApprovedBatch} prospects por lote.`},{status:400});
    if(approved.length===0)return NextResponse.json({ok:true,approvedIds,status:'approved_for_enrichment',contactStarted:false,next:'send_full_approved_objects_to_generate_diagnostics'});

    const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
    const appUrl=process.env.NEXT_PUBLIC_APP_URL||new URL(req.url).origin;
    if(!supabaseUrl||!serviceKey)return NextResponse.json({error:'Banco ainda não configurado para diagnósticos.'},{status:503});
    const admin=createClient(supabaseUrl,serviceKey);
    const ids=approved.map(p=>p.id);
    const {data:existing}=await admin.from('prospect_diagnostics').select('place_id,status').in('place_id',ids).in('status',['approved','contacted','converted']);
    const blocked=new Set((existing||[]).map((x:any)=>x.place_id));
    const fresh=approved.filter(p=>!blocked.has(p.id));
    if(fresh.length===0)return NextResponse.json({ok:true,status:'deduped',contactStarted:false,diagnostics:[],skippedDuplicatePlaceIds:ids});

    const rows=fresh.map(p=>({
      place_id:p.id,business_name:p.name,address:p.address||null,rating:p.rating??null,review_count:p.reviews||0,score:p.score,
      competitor_avg_reviews:p.competitorAverageReviews==null?null:Math.round(p.competitorAverageReviews),
      review_gap:p.competitorAverageReviews==null?null:Math.max(0,Math.round(p.competitorAverageReviews-(p.reviews||0))),
      niche:p.niche||body.niche||null,region:p.region||body.location||null,status:'approved',
      competition_mode:p.competitionMode||body.competitionMode||'city_region',
      competition_label:p.competitionLabel||body.competitionLabel||null,
      search_intent:p.searchIntent||body.searchIntent||null
    }));
    const {data,error}=await admin.from('prospect_diagnostics').insert(rows).select('id,public_token,place_id,business_name,score,review_count,competitor_avg_reviews,review_gap,competition_mode,competition_label,search_intent');
    if(error)return NextResponse.json({error:'Não foi possível gerar os diagnósticos.',detail:error.message},{status:500});
    const diagnostics=(data||[]).map(d=>({...d,url:`${appUrl}/d/${d.public_token}`}));
    return NextResponse.json({ok:true,status:'approved',contactStarted:false,diagnostics,skippedDuplicatePlaceIds:[...blocked],next:'prepare_message_1_with_diagnostic_url'});
  }catch{return NextResponse.json({error:'Não foi possível aprovar a lista agora.'},{status:500})}
}
