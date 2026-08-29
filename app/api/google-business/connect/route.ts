import {createHmac} from 'crypto';
import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';

function signState(payload:string,secret:string){return createHmac('sha256',secret).update(payload).digest('base64url')}

export async function GET(request:Request){
 const clientId=process.env.GOOGLE_BUSINESS_CLIENT_ID;
 const clientSecret=process.env.GOOGLE_BUSINESS_CLIENT_SECRET;
 const appUrl=process.env.NEXT_PUBLIC_APP_URL||new URL(request.url).origin;
 const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const anonKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!clientId||!clientSecret||!supabaseUrl||!anonKey)return NextResponse.json({error:'Google Business Profile ainda não está configurado.'},{status:503});
 const auth=request.headers.get('authorization');
 if(!auth?.startsWith('Bearer '))return NextResponse.json({error:'Faça login para conectar seu Google.'},{status:401});
 const token=auth.slice(7);
 const supabase=createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:auth}}});
 const {data:{user}}=await supabase.auth.getUser(token);
 if(!user)return NextResponse.json({error:'Sessão inválida.'},{status:401});
 const {data:account}=await supabase.from('customer_accounts').select('business_id').eq('user_id',user.id).maybeSingle();
 if(!account?.business_id)return NextResponse.json({error:'Conclua a identificação do seu negócio antes de conectar o Google.'},{status:409});
 const raw=Buffer.from(JSON.stringify({uid:user.id,bid:account.business_id,ts:Date.now()})).toString('base64url');
 const state=`${raw}.${signState(raw,clientSecret)}`;
 const params=new URLSearchParams({client_id:clientId,redirect_uri:`${appUrl}/api/google-business/callback`,response_type:'code',scope:'https://www.googleapis.com/auth/business.manage',access_type:'offline',prompt:'consent',include_granted_scopes:'true',state});
 return NextResponse.json({url:`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`});
}
