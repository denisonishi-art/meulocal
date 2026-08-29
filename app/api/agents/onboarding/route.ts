import {NextResponse} from 'next/server';
import {agentModels,agentPolicies} from '@/lib/agents/config';

const steps={
  welcome:{title:'Vamos configurar seu MeuLocal',next:'confirm_business'},
  confirm_business:{title:'Confirme seu negócio',next:'provision_ghl'},
  provision_ghl:{title:'Preparando sua operação',next:'connect_google'},
  connect_google:{title:'Conecte seu Google Business Profile',next:'connect_whatsapp'},
  connect_whatsapp:{title:'Conecte seu WhatsApp Business',next:'import_customers'},
  import_customers:{title:'Traga seus clientes',next:'review_activation'},
  review_activation:{title:'Revise antes de ativar',next:'done'},
  done:{title:'Tudo pronto',next:null},
} as const;

type Step=keyof typeof steps;

export async function POST(req:Request){
  try{
    const {step='welcome',context={}}=await req.json() as {step?:Step;context?:Record<string,unknown>};
    if(!(step in steps))return NextResponse.json({error:'Etapa inválida.'},{status:400});
    const current=steps[step];
    return NextResponse.json({
      agent:'onboarding',model:agentModels.onboarding,step,current:current.title,nextStep:current.next,
      context,
      provisioning: step==='provision_ghl'?{
        action:'create_or_queue_ghl_subaccount',
        customerVisibleLabel:'Preparando sua operação',
        highLevelVisible:false,
        endpoint:'/api/ghl/provision',
      }:null,
      rules:{
        highLevelVisible:!agentPolicies.onboarding.neverExposeHighLevel,
        customerMessagesEnabled:false,
        requiresFinalConfirmation:agentPolicies.onboarding.neverSendCustomerMessagesBeforeFinalConfirmation,
        importCanBeSkipped:agentPolicies.onboarding.allowImportSkip,
        dedicatedWorkspacePerCustomer:true,
        neverBlockCustomerOnManualProvisioning:true,
      },
    });
  }catch{return NextResponse.json({error:'Não foi possível continuar o onboarding agora.'},{status:500})}
}
