import {NextResponse} from 'next/server';
import {z} from 'zod';
import {isAdminRequest} from '@/lib/admin-auth';
import {runMeuLocalAgent} from '@/lib/agents/runtime';
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
  const prompt={nicho:parsed.data.niche,regiao:parsed.data.region,empresa:c.name,endereco:c.address||''};
  let obj:any;
  try{
   const reply=await runMeuLocalAgent('prospecting',JSON.stringify({task:'draft_first_contact',rules:'Retorne APENAS JSON com message e rationale. 220 a 420 caracteres. Apresente-se exatamente como Denis, fundador da MeuLocal. Não cite quantidades de avaliações, notas, ausência de avaliações, posição nas buscas ou efeitos sobre confiança/visibilidade. Esses dados não foram verificados. Faça uma pergunta sobre a rotina atual, sem diagnóstico negativo; use apenas evidencias fornecidas, sem resultados inventados, sem pedido de reuniao. Uma pergunta consultiva e opt-out ao final. Nunca execute envio, escrita CRM ou ferramentas externas.',prospect:prompt}));
   obj=JSON.parse(reply);
  }catch{return NextResponse.json({error:'Agente comercial indisponível ou resposta inválida. Nenhum envio realizado.'},{status:502})}
  if(typeof obj.message!=='string'||obj.message.length<150||obj.message.length>550||typeof obj.rationale!=='string')return NextResponse.json({error:'Mensagem não passou na validação'},{status:502});
  if(/(?:\d+[.,]?\d*\s*(?:avalia|estrela)|(?:sem|zero|nenhuma|poucas?)\s+avalia|n[aã]o\s+(?:tem|possui|t[eê]m)\s+avalia)/i.test(obj.message)||!obj.message.includes('Denis, fundador da MeuLocal'))return NextResponse.json({error:'Rascunho contém afirmações não verificadas ou identificação inválida. Nenhum envio realizado.'},{status:502});
  results.push({id:c.id,name:c.name,message:obj.message,rationale:obj.rationale,status:'pending_review',contactAllowed:false});
 }
 return NextResponse.json({drafts:results,source:'meulocal_agent_sdk_prospecting',sent:0,crmWrites:0},{headers:{'Cache-Control':'no-store'}});
}
