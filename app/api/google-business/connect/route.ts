import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';

export async function GET(request:Request){
 const clientId=process.env.GOOGLE_BUSINESS_CLIENT_ID;
 const appUrl=process.env.NEXT_PUBLIC_APP_URL||new URL(request.url).origin;
 const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const anonKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!clientId||!supabaseUrl||!anonKey)return NextResponse.json({error:'Google Business Profile ainda não está configurado.'},{status:503});
 const auth=request.headers.get('authorization');
 if(!auth?.startsWith('Bearer '))return NextResponse.json({error:'Faça login para conectar seu Google.'},{status:401});
 const supabase=createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:auth}}});
 const {data:{user}}=await supabase.auth.getUser(auth.slice(7));
 if(!user)return NextResponse.json({error:'Sessão inválida.'},{status:401});
 const state=Buffer.from(JSON.stringify({uid:user.id,ts:Date.now()})).toString('base64url');
 const params=new URLSearchParams({client_id:clientId,redirect_uri:`${appUrl}/api/google-business/callback`,response_type:'code',scope:'https://www.googleapis.com/auth/business.manage',access_type:'offline',prompt:'consent',state});
 return NextResponse.json({url:`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`});
}
