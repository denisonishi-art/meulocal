import {NextResponse} from 'next/server';
import {z} from 'zod';
import {createClient} from '@supabase/supabase-js';
import {isAdminRequest} from '@/lib/admin-auth';
import {evaluateBusinessEmailAttribution} from '@/lib/acquisition/recipient-attribution';
import {manualRecipientReadiness} from '@/lib/acquisition/manual-prospect';

export const runtime='nodejs';
export const maxDuration=45;
const schema=z.object({
  placeId:z.string().min(8).max(190),
  email:z.string().email().max(254),
  sourceUrl:z.string().url().max(800)
}).strict();
const json=(payload:unknown,status=200)=>NextResponse.json(payload,{status,headers:{'Cache-Control':'private, no-store'}});
const normalId=(raw:string)=>raw.startsWith('places/')?raw.slice(7):raw;

/** Same-host link to the business website returned by Google, not an arbitrary
 * URL chosen by the operator. No operator-supplied URL is fetched server-side. */
export function officialSourceMatches(sourceUrl:string,website:string):boolean{
  try{
    const source=new URL(sourceUrl),official=new URL(website);
    if(source.protocol!=='https:'||!['https:','http:'].includes(official.protocol))return false;
    if(source.username||source.password||source.port||official.username||official.password||official.port)return false;
    const host=(url:URL)=>url.hostname.toLowerCase().replace(/^www\./,'').replace(/\.$/,'');
    return host(source)===host(official);
  }catch{return false}
}

/** Operator submits only an address printed on the official unit site.
 * No provider writes, GHL contact creation, paid checks or sends occur here. */
export async function POST(req:Request){
  if(!await isAdminRequest(req))return json({error:'Não autorizado.'},401);
  const raw=await req.text().catch(()=>'');
  if(raw.length>2200)return json({error:'Dados muito grandes.'},413);
  let params;
  try{params=schema.parse(JSON.parse(raw))}catch{return json({error:'Informe um e-mail válido e o link oficial onde foi publicado.'},400)}
  const placeId=normalId(params.placeId);
  if(!/^[A-Za-z0-9_-]{8,180}$/.test(placeId))return json({error:'Empresa selecionada inválida.'},400);
  const apiKey=process.env.GOOGLE_PLACES_API_KEY;
  if(!apiKey)return json({error:'Google Places indisponível.'},503);
  let business:any;
  try{
    const r=await fetch('https://places.googleapis.com/v1/places/'+encodeURIComponent(placeId),{
      headers:{'X-Goog-Api-Key':apiKey,'X-Goog-FieldMask':'id,displayName,websiteUri,formattedAddress,businessStatus'},
      cache:'no-store',redirect:'error',signal:AbortSignal.timeout(7000)
    });
    if(!r.ok)return json({error:'Não foi possível confirmar a empresa no Google. Nenhum contato liberado.'},502);
    business=await r.json();
  }catch{return json({error:'O Google Places não respondeu. Nenhum contato liberado.'},502)}
  if(business?.id!==placeId||business.businessStatus&&business.businessStatus!=='OPERATIONAL'||
    !business?.websiteUri||!business?.displayName?.text){
    return json({error:'Empresa ou site oficial não confirmado no Google Places.'},422);
  }
  if(!officialSourceMatches(params.sourceUrl,business.websiteUri)){
    return json({error:'O link fornecido não pertence ao site que o Google associa a essa unidade. Confirme o site correto antes de prosseguir.'},422);
  }
  const email=params.email.trim().toLowerCase();
  const attribution=evaluateBusinessEmailAttribution(email,business.websiteUri);
  if(!attribution.allowed)return json({error:attribution.reason},422);
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)return json({error:'Banco indisponível para verificar as restrições de contato.'},503);
  const db=createClient(url,key,{auth:{persistSession:false}});
  const target={
    id:placeId,
    name:String(business.displayName.text),
    address:String(business.formattedAddress||''),
    website:String(business.websiteUri),
    channel:'email' as const,
    recipient:email
  };
  const readiness=await manualRecipientReadiness(db,target);
  if(!readiness.canSend||!readiness.sendToken)return json({
    status:'blocked',name:target.name,recipient:email,canSend:false,
    emailVerifyToken:null,reason:readiness.reason,contactAuthorized:false,dispatched:0
  },409);
  return json({
    status:'awaiting_mailbox_verification',
    name:target.name,recipient:email,channel:'email',website:target.website,
    sourceUrl:params.sourceUrl,emailVerifyToken:readiness.sendToken,
    canSend:false,reason:'E-mail do domínio oficial conferido e restrições de contato verificadas. Valide a caixa pelo HighLevel antes do envio.',
    contactAuthorized:false,dispatched:0,chargeInitiated:false
  });
}
