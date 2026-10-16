type Intent={leadId:string;channel:'email'|'whatsapp';message:string};
export type ManualAttempt={key:string;requestId:string};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Persist before HTTP; an unknown result must reuse the same intent after reload. */
export async function getManualAttempt(storage:Storage,intent:Intent):Promise<ManualAttempt>{
 const bytes=new TextEncoder().encode(JSON.stringify([intent.leadId,intent.channel,intent.message]));
 const digest=await crypto.subtle.digest('SHA-256',bytes);
 const key='meulocal-manual-intent-v1:'+Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
 const previous=storage.getItem(key);
 if(previous!==null&&!uuid.test(previous))throw Error('Tentativa local inválida. Confira o registro antes de reenviar.');
 const requestId=previous||crypto.randomUUID();
 if(!previous)storage.setItem(key,requestId);
 if(storage.getItem(key)!==requestId)throw Error('Não foi possível preservar a tentativa. Nenhum envio iniciado.');
 return {key,requestId};
}
export function clearManualAttempt(storage:Storage,attempt:ManualAttempt){if(storage.getItem(attempt.key)===attempt.requestId)storage.removeItem(attempt.key)}
export function requireAcquisitionReceipt(result:{ok?:boolean;messageId?:unknown;stopped?:unknown}){
 if(result.ok!==true||typeof result.messageId!=='string'||!result.messageId.trim()||result.stopped)throw Error('Sem recibo de aceite. Confira a supervisão e reconcilie antes de reenviar.');
}
export function acquisitionFailure(code?:string){
 if(code==='acquisition_reconciliation_required')return 'Resultado incerto. Confira o provedor e o recibo na supervisão; reconciliação necessária antes de reenviar.';
 if(code==='acquisition_preparation_unavailable'||code==='acquisition_not_eligible_or_busy')return 'Preparação indisponível ou contato inelegível. Confira as pendências e tente novamente com a mesma mensagem.';
 if(code==='acquisition_stopped')return 'Contato encerrado. Confira resposta ou opt-out; não reative a cadência.';
 return code||'Resultado não confirmado. Confira a supervisão antes de tentar novamente.';
}
