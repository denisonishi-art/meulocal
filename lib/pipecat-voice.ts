export type PipecatVoiceCallInput = {
  phoneNumber: string;
  leadId: string;
  prospectDiagnosticId?: string | null;
  businessName?: string | null;
  requestedText?: string | null;
};

export type PipecatVoiceCallResult =
  | {ok:true; status:'started'; callId:string|null}
  | {ok:false; status:'disabled'|'not_configured'|'failed'; reason:string};

export function pipecatVoiceEnabled(){
  return process.env.PIPECAT_VOICE_ENABLED === 'true';
}

export function pipecatVoiceConfigured(){
  return Boolean(process.env.PIPECAT_VOICE_BASE_URL && process.env.PIPECAT_VOICE_TOKEN);
}

export async function startPipecatVoiceCall(input:PipecatVoiceCallInput):Promise<PipecatVoiceCallResult>{
  if(!pipecatVoiceEnabled())return {ok:false,status:'disabled',reason:'Pipecat voice está desativado.'};

  const baseUrl=process.env.PIPECAT_VOICE_BASE_URL?.replace(/\/$/,'');
  const token=process.env.PIPECAT_VOICE_TOKEN;
  if(!baseUrl||!token)return {ok:false,status:'not_configured',reason:'Pipecat voice ainda não está configurado.'};

  try{
    const response=await fetch(`${baseUrl}/start`,{
      method:'POST',
      headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
      body:JSON.stringify({
        phone_number:input.phoneNumber,
        body:{
          source:'meulocal',
          lead_id:input.leadId,
          prospect_diagnostic_id:input.prospectDiagnosticId||null,
          business_name:input.businessName||null,
          customer_requested_voice:true,
          requested_text:input.requestedText?.slice(0,500)||null,
        },
      }),
      cache:'no-store',
      signal:AbortSignal.timeout(12000),
    });

    const data=await response.json().catch(()=>({}));
    if(!response.ok){
      return {ok:false,status:'failed',reason:String(data?.detail||data?.error||`HTTP ${response.status}`).slice(0,300)};
    }

    return {
      ok:true,
      status:'started',
      callId:String(data?.call_id||data?.call_sid||data?.call_control_id||'')||null,
    };
  }catch(error:any){
    return {ok:false,status:'failed',reason:String(error?.message||error).slice(0,300)};
  }
}
