import {NextResponse} from 'next/server';
import {z} from 'zod';
import {isAdminRequest} from '@/lib/admin-auth';
import {runMeuLocalAgent} from '@/lib/agents/runtime';
import {buildFirstContactDraft,isSafeFirstContactDraft} from '@/lib/agents/first-contact-copy';
export const runtime='nodejs';
export const maxDuration=60;
const candidate=z.object({id:z.string().min(2).max(200),name:z.string().min(2).max(180),address:z.string().max(300).optional(),rating:z.number().min(0).max(5).nullable(),reviews:z.number().int().min(0).max(1000000).nullable(),score:z.number().min(0).max(100).nullable().optional()}).strict();
const schema=z.object({niche:z.string().min(2).max(80),region:z.string().min(2).max(100),companies:z.array(candidate).min(1).max(5)}).strict();
export async function POST(req:Request){
 if(!await isAdminRequest(req))return NextResponse.json({error:'Não autorizado'},{status:401});
 const raw=await req.text().catch(()=>'');
 if(raw.length>12000)return NextResponse.json({error:'Solicitação muito grande'},{status:413});
 let parsed;try{parsed=schema.safeParse(JSON.parse(raw))}catch{return NextResponse.json({error:'JSON inválido'},{status:400})}
 if(!parsed.success)return NextResponse.json({error:'Empresas inválidas'},{status:400});
 const key=process.env.OPENAI_API_KEY;
 if(!key)return NextResponse.json({error:'Chave de IA não configurada para a preparação de mensagens'},{status:503});
 const results=[];
 for(const c of parsed.data.companies){
  // Google Places supplied these observations for a company explicitly selected by
  // the operator. Score is intentionally not used as an external performance claim.
  const reference=buildFirstContactDraft({name:c.name,niche:parsed.data.niche,rating:c.rating,reviews:c.reviews});
  let message=reference.message;
  let rationale=reference.rationale;
  let copySource:'agent'|'evidence_template'='evidence_template';
  try{
   // The model can improve readability, but it cannot alter the verified snapshot,
   // value proposition, permission-based CTA or unsubscribe sentence.
   const reply=await runMeuLocalAgent('prospecting',JSON.stringify({
    task:'refine_first_contact',
    rules:[
     'Retorne APENAS JSON com message e rationale (sem markdown).',
     'A proposta comercial é aumentar o potencial de escolha do negócio por meio de uma reputação mais forte no Google. Não venda somente coleta de avaliações.',
     'Preserve LITERALMENTE as frases de apresentação do MeuLocal, evidência da pesquisa, CTA e opt-out da mensagem de referência.',
     'Pode melhorar apenas as frases de contexto e oportunidade, mantendo uma abordagem breve e consultiva.',
     'Não pergunte como o empresário organiza avaliações, não peça reunião e não apresente preço no primeiro contato.',
     'Não afirme diferenças competitivas não medidas, não invente métricas ou concorrentes, não prometa matrículas, clientes ou receita.',
     'A análise comparativa é um convite para PREPARAR e enviar após resposta positiva; não afirme que já foi concluída.',
     'Não execute envios, não escreva no CRM e não use ferramentas externas.'
    ],
    prospect:{nicho:parsed.data.niche,regiao:parsed.data.region,empresa:c.name,endereco:c.address||'',googleRating:c.rating,googleReviewCount:c.reviews},
    referenceMessage:reference.message
   }));
   const parsedReply=JSON.parse(reply);
   if(isSafeFirstContactDraft(parsedReply?.message,reference)){
    message=parsedReply.message;
    rationale=typeof parsedReply.rationale==='string'&&parsedReply.rationale.length<=600?parsedReply.rationale:reference.rationale;
    copySource='agent';
   }
  }catch{
   // Safe baseline remains usable when the model is unavailable or ignores the
   // evidence contract. Draft creation never implies permission to contact.
  }
  results.push({id:c.id,name:c.name,message,rationale,copySource,status:'pending_review',contactAllowed:false});
 }
 return NextResponse.json({drafts:results,source:'meulocal_value_first_prospecting',sent:0,crmWrites:0},{headers:{'Cache-Control':'no-store'}});
}
