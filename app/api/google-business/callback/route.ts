import {createHmac,timingSafeEqual} from 'crypto';
import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {encryptToken} from '@/lib/google-business-server';

function verifyState(state:string,secret:string){const [raw,sig]=state.split('.');if(!raw||!sig)return null;const expected=createHmac('sha256',secret).update(raw).digest('base64url');const a=Buffer.from(sig),b=Buffer.from(expected);if(a.length!==b.length||!timingSafeEqual(a,b))return null;try{return JSON.parse(Buffer.from(raw,'base64url').toString('utf8')) as {uid:string;bid:string;ts:number}}catch{return null}}

export async function GET(request:Request){
 const url=new URL(request.url);const code=url.searchParams.get('code');const state=url.searchParams.get('state');const error=url.searchParams.get('error');const appUrl=process.env.NEXT_PUBLIC_APP_URL||url.origin;
 if(error)return NextResponse.redirect(`${appUrl}/onboarding?google=denied`);
 const clientId=process.env.GOOGLE_BUSINESS_CLIENT_ID,clientSecret=process.env.GOOGLE_BUSINESS_CLIENT_SECRET,serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY,supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;
 if(!code||!state||!clientId||!clientSecret||!serviceKey||!supabaseUrl)return NextResponse.redirect(`${appUrl}/onboarding?google=error`);
 const parsed=verifyState(state,clientSecret);if(!parsed||Date.now()-parsed.ts>10*60*1000)return NextResponse.redirect(`${appUrl}/onboarding?google=expired`);
 const tokenRes=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:clientId,client_secret:clientSecret,redirect_uri:`${appUrl}/api/google-business/callback`,grant_type:'authorization_code'}),cache:'no-store'});
 if(!tokenRes.ok)return NextResponse.redirect(`${appUrl}/onboarding?google=error`);
 const token=await tokenRes.json() as {access_token:string;refresh_token?:string;expires_in:number;scope?:string};
 const supabase=createClient(supabaseUrl,serviceKey);
 const existing=await supabase.from('google_business_connections').select('refresh_token_ciphertext').eq('user_id',parsed.uid).eq('business_id',parsed.bid).maybeSingle();
 const encrypted=token.refresh_token?encryptToken(token.refresh_token):existing.data?.refresh_token_ciphertext||null;
 await supabase.from('google_business_connections').upsert({user_id:parsed.uid,business_id:parsed.bid,refresh_token_ciphertext:encrypted,token_expires_at:new Date(Date.now()+token.expires_in*1000).toISOString(),status:'pending',connected_at:new Date().toISOString()},{onConflict:'user_id,business_id'});
 return NextResponse.redirect(`${appUrl}/onboarding?google=connected`);
}
