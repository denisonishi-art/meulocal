import {createHmac,timingSafeEqual} from 'node:crypto';
import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {reconcileControlledInbox} from '@/lib/ghl-controlled-reconciliation';
import {drainOpenDotsOutbox} from '@/lib/agents/opendots-outbox';
import {recoverAsaasEvents} from '@/lib/payments/asaas-processing';
import {processNextReviewDelivery} from '@/lib/reviews/delivery';

export const maxDuration=60;
const DOMAIN='POST\n/api/internal/opendots/recover\n';

/** Backend-only recovery. The request cannot select a tenant, job or send action. */
export async function POST(request:Request){
 const secret=process.env.OPENDOTS_COMMERCIAL_SECRET;
 if(!secret||secret.length<24)return NextResponse.json({error:'recovery_not_configured'},{status:503});
 if(request.headers.has('origin'))return NextResponse.json({error:'unauthorized'},{status:401});
 const raw=await request.text();
 if(Buffer.byteLength(raw)>1024)return NextResponse.json({error:'payload_too_large'},{status:413});
 const expected=Buffer.from('sha256='+createHmac('sha256',secret).update(DOMAIN+raw).digest('hex'));
 const provided=Buffer.from(request.headers.get('x-meulocal-recovery-signature')||'');
 if(expected.length!==provided.length||!timingSafeEqual(expected,provided))return NextResponse.json({error:'unauthorized'},{status:401});
 let payload:any;try{payload=JSON.parse(raw)}catch{return NextResponse.json({error:'invalid_payload'},{status:400})}
 if(!payload||typeof payload!=='object'||Array.isArray(payload)||payload.version!==1||Object.keys(payload).length!==2||typeof payload.timestamp!=='number'||!Number.isSafeInteger(payload.timestamp))return NextResponse.json({error:'invalid_payload'},{status:400});
 if(Math.abs(Date.now()-payload.timestamp)>90000)return NextResponse.json({error:'expired_signature'},{status:401});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return NextResponse.json({error:'server_not_configured'},{status:503});
 const db=createClient(url,key,{auth:{persistSession:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(5000)})}});
 // Independent stages share durable leases, not a volatile queue. One provider cannot starve the others.
 const safely=async(run:()=>Promise<any>,error:string)=>{try{return await run()}catch{return {ok:false,error}}};
 const [inbox,payments,queue,reviews]=await Promise.all([
  safely(()=>reconcileControlledInbox(db),'inbox_recovery_failed'),
  safely(()=>recoverAsaasEvents(db),'payment_recovery_failed'),
  safely(()=>drainOpenDotsOutbox(db),'queue_recovery_failed'),
  safely(()=>processNextReviewDelivery(db),'review_recovery_failed'),
 ]);
 const ok=inbox.ok===true&&payments.ok===true&&queue.ok===true&&reviews.ok===true;
 console.info(JSON.stringify({stage:'supervised_recovery',ok,ingested:inbox.ingested||0,completed:queue.completed||0,pending:queue.pending||0,paymentCompleted:payments.completed||0,paymentPending:payments.pending||0,reviewProcessed:reviews.processed||0,reviewPending:reviews.pending||0,reviewBlocked:reviews.blocked||0,error:inbox.error||payments.error||queue.error||reviews.error||null}));
 return NextResponse.json({ok,inbox,payments,queue,reviews},{status:ok?200:503});
}
