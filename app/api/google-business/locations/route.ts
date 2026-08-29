import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {decryptToken,refreshGoogleAccessToken} from '@/lib/google-business-server';

export async function GET(request:Request){
 const auth=request.headers.get('authorization');const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL,anonKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!auth?.startsWith('Bearer ')||!supabaseUrl||!anonKey||!serviceKey)return NextResponse.json({error:'Não autorizado.'},{status:401});
 const userClient=createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:auth}}});const {data:{user}}=await userClient.auth.getUser(auth.slice(7));if(!user)return NextResponse.json({error:'Sessão inválida.'},{status:401});
 const admin=createClient(supabaseUrl,serviceKey);const {data:connection}=await admin.from('google_business_connections').select('refresh_token_ciphertext').eq('user_id',user.id).maybeSingle();if(!connection?.refresh_token_ciphertext)return NextResponse.json({error:'Google ainda não conectado.'},{status:409});
 const refreshed=await refreshGoogleAccessToken(decryptToken(connection.refresh_token_ciphertext));const headers={Authorization:`Bearer ${refreshed.access_token}`};
 const accountsRes=await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts',{headers,cache:'no-store'});const accountsPayload=await accountsRes.json();if(!accountsRes.ok)return NextResponse.json({error:accountsPayload?.error?.message||'Não foi possível acessar suas contas do Google.'},{status:accountsRes.status});
 const locations:any[]=[];
 for(const account of accountsPayload.accounts||[]){const res=await fetch(`https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title,storefrontAddress,metadata`,{headers,cache:'no-store'});if(!res.ok)continue;const payload=await res.json();for(const l of payload.locations||[])locations.push({id:l.name,accountId:account.name,title:l.title,address:[l.storefrontAddress?.addressLines?.join(', '),l.storefrontAddress?.locality,l.storefrontAddress?.administrativeArea].filter(Boolean).join(' - ')});}
 return NextResponse.json({locations});
}
