import {NextResponse} from 'next/server';

export async function GET(){
  const required={
    supabase:Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY&&process.env.SUPABASE_SERVICE_ROLE_KEY),
    google:Boolean(process.env.GOOGLE_BUSINESS_CLIENT_ID&&process.env.GOOGLE_BUSINESS_CLIENT_SECRET&&process.env.GOOGLE_TOKEN_ENCRYPTION_KEY),
    openai:Boolean(process.env.OPENAI_API_KEY),
    admin:Boolean(process.env.ADMIN_ACCESS_KEY),
    cron:Boolean(process.env.CRON_SECRET),
    asaas:Boolean(process.env.ASAAS_API_KEY&&process.env.ASAAS_WEBHOOK_TOKEN),
    highlevel:Boolean(process.env.GHL_API_KEY||process.env.GHL_WEBHOOK_SECRET),
  };
  const coreReady=required.supabase&&required.google&&required.admin&&required.cron;
  return NextResponse.json({ok:coreReady,status:coreReady?'ready':'partial',integrations:required,externalActivationRequired:{asaas:!required.asaas,highlevel:!required.highlevel}},{status:coreReady?200:503});
}
