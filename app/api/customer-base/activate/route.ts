import {NextResponse} from 'next/server';
import {customerContext,requireActiveAccount} from '@/lib/customer-context';

export const maxDuration=60;

export async function POST(req:Request){
  try{
    const c=await customerContext(req);
    if(!c)return NextResponse.json({error:'Não autorizado.'},{status:401});
    if(!requireActiveAccount(c.account))return NextResponse.json({error:'Assinatura ativa necessária.'},{status:403});
    const {confirmed,audienceConfirmed}=await req.json().catch(()=>({}));
    if(confirmed!==true)return NextResponse.json({error:'Confirme a ativação antes de iniciar a régua.'},{status:400});
    if(audienceConfirmed!==true)return NextResponse.json({error:'Confirme que a base pode ser contatada pelos canais informados.'},{status:400});
    const {data,error}=await c.admin.rpc('activate_customer_base',{p_business_id:c.account!.business_id,p_user_id:c.user.id});
    if(error||data?.ok!==true){
      if(error?.message?.includes('customer_base_google_required'))return NextResponse.json({error:'Conecte o Google e conclua a primeira sincronização antes de ativar.'},{status:409});
      if(error?.message?.includes('customer_base_onboarding_required'))return NextResponse.json({error:'Conclua e confirme o onboarding antes de ativar.'},{status:409});
      if(error?.message?.includes('customer_base_location_required'))return NextResponse.json({error:'O canal da empresa ainda precisa ser preparado. Confira as pendências no painel.'},{status:409});
      if(error?.message?.includes('customer_base_review_destination_required'))return NextResponse.json({error:'Confirme o perfil público da empresa para gerar o link de avaliação. A conexão Google é opcional.'},{status:409});
      if(error?.message?.includes('customer_base_paused'))return NextResponse.json({error:'A régua está pausada. Retome pela gestão antes de incluir novos contatos.'},{status:409});
      if(error?.message?.includes('customer_base_no_eligible_contacts'))return NextResponse.json({error:'Não há contatos confirmados e elegíveis para ativar.'},{status:409});
      return NextResponse.json({error:'Não foi possível preparar a fila. Tente novamente.'},{status:503});
    }
    return NextResponse.json(data);
  }catch{
    return NextResponse.json({error:'Não foi possível preparar a fila. Tente novamente.'},{status:503});
  }
}
