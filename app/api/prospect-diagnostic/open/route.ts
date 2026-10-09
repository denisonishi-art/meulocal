import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';

const BOT_RE=/bot|crawler|spider|preview|facebookexternalhit|whatsapp|slackbot|telegrambot|discordbot|linkedinbot|google-inspectiontool|headless/i;

export async function POST(req:Request){
  try{
    const marker=req.headers.get('x-meulocal-view');
    if(marker!=='human-client-v1')return NextResponse.json({ok:false},{status:400});
    const fetchSite=req.headers.get('sec-fetch-site');
    if(fetchSite&&fetchSite!=='same-origin')return NextResponse.json({ok:false},{status:403});
    const ua=req.headers.get('user-agent')||'';
    if(BOT_RE.test(ua))return NextResponse.json({ok:true,ignored:true});

    const body=await req.json().catch(()=>({}));
    const token=String(body?.token||'').trim();
    if(!token)return NextResponse.json({ok:false},{status:400});

    const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
    if(!url||!key)return NextResponse.json({ok:false},{status:503});

    const db=createClient(url,key,{auth:{persistSession:false}});
    const {data}=await db.from('prospect_diagnostics').select('id,diagnostic_opened_at').eq('public_token',token).maybeSingle();
    if(!data)return NextResponse.json({ok:false},{status:404});
    if(!data.diagnostic_opened_at){
      await db.from('prospect_diagnostics').update({diagnostic_opened_at:new Date().toISOString()}).eq('id',data.id);
    }
    return NextResponse.json({ok:true});
  }catch{
    return NextResponse.json({ok:false},{status:500});
  }
}
