import {NextResponse} from 'next/server';
import {agentPolicies} from '@/lib/agents/config';

export async function POST(req:Request){
  try{
    const {approvedIds=[]}=await req.json();
    if(!Array.isArray(approvedIds)||approvedIds.length===0)return NextResponse.json({error:'Selecione pelo menos um prospect.'},{status:400});
    if(approvedIds.length>agentPolicies.prospecting.maxApprovedBatch)return NextResponse.json({error:`Aprovação limitada a ${agentPolicies.prospecting.maxApprovedBatch} prospects por lote.`},{status:400});
    return NextResponse.json({ok:true,approvedIds,status:'approved_for_enrichment',contactStarted:false,next:'enrich_contact_and_prepare_message'});
  }catch{return NextResponse.json({error:'Não foi possível aprovar a lista agora.'},{status:500})}
}
