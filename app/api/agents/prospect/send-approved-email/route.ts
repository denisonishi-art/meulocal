import {NextResponse} from 'next/server';
import {z} from 'zod';
import {isAdminRequest} from '@/lib/admin-auth';
import {sendOperationalMessage} from '@/lib/highlevel-operational';
export const runtime='nodejs';
const schema=z.object({name:z.string().min(2).max(180),email:z.string().email().max(250),message:z.string().min(50).max(1800),confirmed:z.literal(true)}).strict();
export async function POST(req:Request){
 if(!await isAdminRequest(req))return NextResponse.json({error:'Não autorizado'},{status:401});
 const parsed=schema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:'Dados inválidos'},{status:400});
 const {name,email,message}=parsed.data;
 const token=process.env.GHL_API_KEY,locationId=process.env.GHL_LOCATION_ID;
 if(!token||!locationId)return NextResponse.json({error:'HighLevel não configurado'},{status:503});
 const headers={Authorization:'Bearer '+token,Version:'2021-07-28','Content-Type':'application/json'};
 // Never create a contact or guess one by name; accept only an existing exact email match.
 const response=await fetch('https://services.leadconnectorhq.com/contacts/search',{method:'POST',headers,body:JSON.stringify({locationId,query:email,page:1,pageLimit:20}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(6000)}).catch(()=>null);
 if(!response?.ok)return NextResponse.json({error:'Não foi possível verificar o destinatário no HighLevel'},{status:409});
 const body=await response.json().catch(()=>null);
 if(!Array.isArray(body?.contacts)||body.contacts.length>20)return NextResponse.json({error:'Resposta de contatos inválida'},{status:409});
 const matches=body.contacts.filter((c:any)=>c.locationId===locationId&&String(c.email||'').toLowerCase()===email.toLowerCase());
 if(matches.length!==1)return NextResponse.json({error:'Exige um contato único já cadastrado com e-mail confirmado'},{status:409});
 const contact=matches[0];
 if(contact.dnd===true||contact.dndSettings?.Email?.status==='active'||contact.dndSettings?.email?.status==='active')return NextResponse.json({error:'DND ativo — envio bloqueado'},{status:409});
 // A user selecting an email does not establish that it belongs to the intended business.
 const contactName=String(contact.companyName||contact.name||[contact.firstName,contact.lastName].filter(Boolean).join(' '));
 const norm=(s:string)=>s.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/[^a-z0-9]/gi,'').toLowerCase();
 if(norm(contactName)!==norm(name))return NextResponse.json({error:'Identidade do contato não corresponde à empresa'},{status:409});
 const id=String(contact.id||'');if(!id)return NextResponse.json({error:'ID de contato inválido'},{status:409});
 const sent=await sendOperationalMessage({token,contactId:id,channel:'email',message,subject:'Uma ideia para as avaliações da '+name,email}).catch(()=>null);
 if(!sent?.messageId)return NextResponse.json({error:'HighLevel não confirmou ID da mensagem; verifique a conversa antes de tentar novamente'},{status:502});
 return NextResponse.json({ok:true,status:'accepted_by_highlevel',messageId:sent.messageId,conversationId:sent.conversationId,contactId:id},{headers:{'Cache-Control':'no-store'}});
}
