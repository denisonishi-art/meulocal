import {NextResponse} from 'next/server';
import {z} from 'zod';
import {isAdminRequest} from '@/lib/admin-auth';
export const runtime='nodejs';
const item=z.object({id:z.string().min(5).max(180),name:z.string().min(2).max(180),message:z.string().min(100).max(900),channel:z.enum(['email','whatsapp','blocked']),eligibilityStatus:z.string().optional(),eligibilityReasons:z.array(z.string()).max(20).optional()}).strict();
const input=z.object({items:z.array(item).min(1).max(5)}).strict();
export async function POST(req:Request){
 if(!await isAdminRequest(req))return NextResponse.json({error:'Não autorizado'},{status:401});
 let raw='';try{raw=await req.text();if(raw.length>12000)return NextResponse.json({error:'Payload muito grande'},{status:413})}catch{return NextResponse.json({error:'Leitura inválida'},{status:400})}
 let body;try{body=input.parse(JSON.parse(raw))}catch{return NextResponse.json({error:'Dados inválidos'},{status:400})}
 const seen=new Set<string>();
 const results=body.items.map(x=>{
  const duplicate=seen.has(x.id);seen.add(x.id);
  const reasons=[...new Set([...(x.eligibilityReasons||[]),...(duplicate?['duplicate_in_batch']:[]),...(x.channel==='blocked'?['contact_not_found']:[]),'recipient_consent_and_channel_not_verified','dispatch_not_authorized'])];
  return {id:x.id,name:x.name,channel:x.channel,status:'BLOCKED',reasons,messagePreserved:true,attempted:false};
 });
 return NextResponse.json({mode:'dry_run',results,attempted:0,sent:0,crmWrites:0,unlocked:false},{headers:{'Cache-Control':'no-store'}});
}
