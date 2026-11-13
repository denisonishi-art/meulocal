import {DAILY_NICHES,DAILY_QUEUE_SIZE,DAILY_REGION,nicheForDate,normalizePlaceId,pickFreshCandidates,queueDate,type Caller} from './daily-queue';
const CANDIDATE_POOL=30,CHUNK=5,SAFETY_MS=70000;
const fail=(message:string)=>{throw Error(message)};
/** A ordem de processamento segue a prioridade da ferramenta: menor score = maior chance de fechamento
 * (poucas avaliações e nota mais fraca), com score ausente por último.
 * Prepara a fila do dia reaproveitando as rotas já protegidas (search, contact-check,
 * verify-email, draft). Não envia mensagens, não cria contatos e não escreve no CRM.
 * Idempotente e retomável: cada execução continua de onde a anterior parou. */
export async function runDailyQueue({db,call,now=new Date(),deadlineMs=Date.now()+270000}:{db:any;call:Caller;now?:Date;deadlineMs?:number}){
 const date=queueDate(now),niche=nicheForDate(date);
 const claim=await db.rpc('claim_daily_prospect_run',{p_date:date,p_niche:niche,p_region:DAILY_REGION,p_lease_seconds:330});
 if(claim.error)return {date,status:'unavailable',claimed:false};
 if(!claim.data?.claimed)return {date,status:claim.data?.status||'busy',claimed:false};
 const run={niche:claim.data.niche||niche,region:claim.data.region||DAILY_REGION,searched:Boolean(claim.data.searched)};
 const release=async(patch:Record<string,unknown>)=>{await db.from('prospect_daily_runs').update({...patch,lease_until:null,updated_at:new Date().toISOString()}).eq('queue_date',date)};
 const rows=async(status:string,limit=100)=>{const r=await db.from('prospect_daily_queue').select('*').eq('queue_date',date).eq('status',status).order('score',{ascending:true,nullsFirst:false}).order('id',{ascending:true}).limit(limit);if(r.error)fail('queue_read_failed');return r.data||[]};
 try{
  // 1) Busca (uma vez por dia): região única e escolha já ordenada pela regra de prioridade existente.
  if(!run.searched){
   const seenRows=await db.from('prospect_daily_queue').select('place_id').limit(5000);
   const permRows=await db.from('manual_prospect_permissions').select('place_id').limit(5000);
   if(seenRows.error||permRows.error)fail('seen_read_failed');
   const seen=new Set<string>([...(seenRows.data||[]),...(permRows.data||[])].map((r:any)=>normalizePlaceId(r.place_id)));
   const found=await call('/api/agents/prospect/search',{niche:run.niche,location:run.region});
   if(!found.ok)fail('search_failed_'+found.status);
   const fresh=pickFreshCandidates<any>(found.json?.candidates||[],seen,CANDIDATE_POOL);
   if(fresh.length){
    const ins=await db.from('prospect_daily_queue').insert(fresh.map((c:any)=>({queue_date:date,place_id:normalizePlaceId(c.id),name:c.name,address:c.address||null,website:c.website||null,rating:c.rating??null,reviews:c.reviews??null,score:c.score??null,status:'candidate'})));
    if(ins.error)fail('queue_insert_failed');
   }
   await db.from('prospect_daily_runs').update({searched:true,found:fresh.length,updated_at:new Date().toISOString()}).eq('queue_date',date);
   run.searched=true;
  }
  // 2) E-mail oficial atribuível + validação de caixa (paga, no máximo uma por empresa e até 10 por dia).
  let verified=(await rows('verified')).length+(await rows('ready')).length;
  while(verified<DAILY_QUEUE_SIZE&&Date.now()<deadlineMs-SAFETY_MS){
   const batch=await rows('candidate',CHUNK);
   if(!batch.length)break;
   const check=await call('/api/agents/prospect/contact-check',{companies:batch.map((b:any)=>({id:b.place_id,name:b.name}))});
   if(!check.ok)fail('contact_check_failed_'+check.status);
   const byId=new Map<string,any>((check.json?.results||[]).map((r:any)=>[normalizePlaceId(r.id),r]));
   for(const row of batch){
    const patch=async(p:Record<string,unknown>)=>{await db.from('prospect_daily_queue').update({...p,updated_at:new Date().toISOString()}).eq('id',row.id)};
    const r=byId.get(row.place_id);
    if(!r||r.channel!=='email'||!r.emailVerifyToken){await patch({status:'blocked',reason:String(r?.reason||'Sem e-mail oficial atribuível ao site da empresa.').slice(0,300)});continue}
    if(verified>=DAILY_QUEUE_SIZE)continue; // sobra: permanece candidato e é apagado ao fim
    const v=await call('/api/agents/prospect/verify-email',{emailVerifyToken:r.emailVerifyToken,confirmed:true});
    if(v.ok&&v.json?.canSend&&v.json?.sendToken){await patch({status:'verified',email:String(r.recipient||r.email||'').toLowerCase(),reason:String(v.json.reason||'').slice(0,300)});verified++}
    else await patch({status:'blocked',email:String(r.recipient||r.email||'').toLowerCase()||null,reason:String(v.json?.reason||'Caixa de e-mail não confirmada.').slice(0,300)});
   }
  }
  const noMoreCandidates=(await rows('candidate',1)).length===0;
  if(verified<DAILY_QUEUE_SIZE&&!noMoreCandidates){await release({status:'processing'});return {date,niche:run.niche,status:'processing',verified,claimed:true}}
  // 3) Mensagem personalizada (mesma rota de rascunho, com a regra de cópia segura já existente).
  for(;;){
   if(Date.now()>=deadlineMs-SAFETY_MS)break;
   const pending=(await rows('verified',CHUNK));
   if(!pending.length)break;
   const drafted=await call('/api/agents/prospect/draft',{niche:run.niche,region:run.region,companies:pending.map((p:any)=>({id:p.place_id,name:p.name,address:p.address||undefined,rating:p.rating==null?null:Number(p.rating),reviews:p.reviews??null,score:p.score??null}))});
   if(!drafted.ok)fail('draft_failed_'+drafted.status);
   const byId=new Map<string,any>((drafted.json?.drafts||[]).map((d:any)=>[normalizePlaceId(d.id),d]));
   let progressed=0;
   for(const p of pending){
    const d=byId.get(p.place_id);
    if(!d||typeof d.message!=='string'||d.message.length<50)continue;
    await db.from('prospect_daily_queue').update({status:'ready',message:d.message,rationale:String(d.rationale||'').slice(0,600),updated_at:new Date().toISOString()}).eq('id',p.id);progressed++;
   }
   if(!progressed)fail('draft_empty');
  }
  const pendingDraft=(await rows('verified',1)).length;
  if(pendingDraft){await release({status:'processing'});return {date,niche:run.niche,status:'processing',verified,claimed:true}}
  const ready=(await rows('ready')).length;
  await db.from('prospect_daily_queue').delete().eq('queue_date',date).eq('status','candidate');
  await release({status:ready?'ready':'empty',ready_count:ready,last_error:null});
  return {date,niche:run.niche,status:ready?'ready':'empty',ready,claimed:true};
 }catch(error){
  const code=error instanceof Error&&/^[a-z_0-9]+$/.test(error.message)?error.message:'daily_queue_unavailable';
  await release({status:'failed',last_error:code}).catch(()=>{});
  return {date,niche:run.niche,status:'failed',error:code,claimed:true};
 }
}
export {DAILY_NICHES};
