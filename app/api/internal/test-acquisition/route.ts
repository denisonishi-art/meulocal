import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {getLocationAccessToken,sendOperationalMessage,upsertOperationalContact} from '@/lib/highlevel-operational';

const TEST_TOKEN='meulocal-e2e-20260920-1710';
const TEST_EMAIL='denis@meulocal.ia.br';
const LOCATION_ID='uNh3KsM7WFuLeTN8Q583';

export async function GET(req:Request){
  const u=new URL(req.url);
  if(u.searchParams.get('token')!==TEST_TOKEN)return NextResponse.json({error:'Não autorizado.'},{status:401});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)return NextResponse.json({error:'Banco não configurado.'},{status:503});
  try{
    const db=createClient(url,key,{auth:{persistSession:false}});
    const token=await getLocationAccessToken(LOCATION_ID);
    const contact=await upsertOperationalContact({token,locationId:LOCATION_ID,name:'Denis Onishi - Teste MeuLocal',email:TEST_EMAIL});
    const sent=await sendOperationalMessage({
      token,contactId:contact.id,channel:'email',email:TEST_EMAIL,
      subject:'[TESTE] Régua de aquisição MeuLocal',
      message:'Olá Denis! Este é um teste controlado da régua de aquisição do MeuLocal. Se você recebeu este e-mail, o envio pela operação interna está funcionando. Responda TESTE OK para validarmos também o retorno pelo webhook.'
    });
    await db.from('ghl_events').insert({
      external_event_id:'controlled-test-'+Date.now(),event_type:'controlled_acquisition_test',ghl_location_id:LOCATION_ID,contact_id:contact.id,
      conversation_id:sent.conversationId||null,message_id:sent.messageId||null,direction:'outbound',channel:'email',normalized_status:'sent',opted_out:false,conversion:false,
      payload_meta:{source:'controlled_test',email:TEST_EMAIL}
    });
    return NextResponse.json({ok:true,contactId:contact.id,messageId:sent.messageId||null,conversationId:sent.conversationId||null});
  }catch(error:any){return NextResponse.json({ok:false,error:String(error?.message||error)},{status:502})}
}