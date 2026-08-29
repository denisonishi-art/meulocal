import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';

export async function GET(req:Request){
  const url=new URL(req.url);
  const token=url.searchParams.get('token');
  const appUrl=process.env.NEXT_PUBLIC_APP_URL||url.origin;
  if(!token)return NextResponse.redirect(`${appUrl}/`);
  const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(supabaseUrl&&serviceKey){
    const admin=createClient(supabaseUrl,serviceKey);
    const {data}=await admin.from('prospect_diagnostics').select('id,niche,region').eq('public_token',token).maybeSingle();
    if(data){
      await admin.from('prospect_diagnostics').update({cta_clicked_at:new Date().toISOString(),status:'clicked'}).eq('id',data.id);
      const target=new URL('/',appUrl);
      target.searchParams.set('utm_source','meulocal_prospecting');
      target.searchParams.set('utm_medium','diagnostic');
      target.searchParams.set('utm_campaign','outbound');
      target.searchParams.set('prospect_id',token);
      if(data.niche)target.searchParams.set('niche',data.niche);
      if(data.region)target.searchParams.set('region',data.region);
      return NextResponse.redirect(target);
    }
  }
  return NextResponse.redirect(`${appUrl}/?utm_source=meulocal_prospecting&utm_medium=diagnostic&utm_campaign=outbound`);
}
