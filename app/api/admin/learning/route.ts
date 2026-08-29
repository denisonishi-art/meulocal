import {NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {createClient} from '@supabase/supabase-js';

async function sessionToken(secret:string){const data=new TextEncoder().encode(`meulocal-admin:${secret}`);const digest=await crypto.subtle.digest('SHA-256',data);return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('')}
async function isAdmin(){const secret=process.env.ADMIN_ACCESS_KEY;if(!secret)return false;const store=await cookies();return store.get('meulocal_admin')?.value===await sessionToken(secret)}
function n(v:any){return Number(v||0)}

export async function GET(){
  if(!await isAdmin())return NextResponse.json({error:'Não autorizado.'},{status:401});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)return NextResponse.json({error:'Dados ainda não configurados.'},{status:503});
  const db=createClient(url,key);
  const [nicheRes,channelRes,messageRes]=await Promise.all([
    db.from('prospecting_learning_by_niche').select('*').order('contact_to_conversion_pct',{ascending:false}),
    db.from('prospecting_learning_by_channel').select('*').order('conversion_rate_pct',{ascending:false}),
    db.from('prospecting_learning_by_message').select('*').order('conversion_rate_pct',{ascending:false}),
  ]);
  const niches=(nicheRes.data||[]).map((r:any)=>({label:r.niche||'Sem nicho',contacts:n(r.contacts),positiveReplies:n(r.positive_replies),conversions:n(r.conversions),conversionRate:n(r.contact_to_conversion_pct)}));
  const channels=(channelRes.data||[]).map((r:any)=>({label:r.channel||'Sem canal',contacts:n(r.contacts),positiveReplies:n(r.positive_replies),conversions:n(r.conversions),conversionRate:n(r.conversion_rate_pct)}));
  const messages=(messageRes.data||[]).map((r:any)=>({label:`Mensagem ${r.message_index||0}${r.message_variant?` · ${r.message_variant}`:''} · ${r.channel||''}`,contacts:n(r.sends),positiveReplies:n(r.positive_replies),conversions:n(r.conversions),conversionRate:n(r.conversion_rate_pct)}));
  const totals=niches.reduce((a:any,r:any)=>({contacts:a.contacts+r.contacts,positiveReplies:a.positiveReplies+r.positiveReplies,conversions:a.conversions+r.conversions}),{contacts:0,positiveReplies:0,conversions:0});
  return NextResponse.json({niches,channels,messages,totals:{...totals,conversionRate:totals.contacts?totals.conversions/totals.contacts*100:0}});
}
