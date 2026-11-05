const allowedResults=new Set(['deliverable','undeliverable','do_not_send','unknown','catch_all']);

export function interpretLCEmailVerification(response:unknown,expectedEmail:string){
 const r=response as Record<string,unknown>;
 const result=typeof r?.result==='string'?r.result:'unknown';
 const risk=typeof r?.risk==='string'?r.risk:'unknown';
 const address=typeof r?.address==='string'?r.address.trim().toLowerCase():'';
 const isValid=(r?.leadConnectorRecommendation as Record<string,unknown>|null)?.isEmailValid;
 if(!allowedResults.has(result)||address!==expectedEmail.toLowerCase())return {
  status:'unverified',reason:'Resultado inconclusivo do verificador. Nenhum envio autorizado.',deliverable:false
 };
 if(result==='deliverable'&&risk==='low'&&isValid!==false)return {
  status:'deliverable',reason:'Caixa postal considerada entregável pelo HighLevel; isso não garante entrega na caixa de entrada.',deliverable:true
 };
 const messages:Record<string,string>={
  undeliverable:'Endereço considerado não entregável pelo HighLevel. Não enviar.',
  do_not_send:'HighLevel recomenda não enviar para este endereço.',
  catch_all:'Domínio aceita mensagens sem confirmar esta caixa específica. Necessária confirmação manual.',
  unknown:'HighLevel não conseguiu confirmar a caixa postal.',
  deliverable:'Risco médio, alto ou indefinido. Necessária confirmação manual.'
 };
 return {status:result,reason:messages[result],deliverable:false};
}

