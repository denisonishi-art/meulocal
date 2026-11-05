/** Protects first-contact outreach from emails harvested off unrelated websites
 * or placeholder domains. A valid MX record alone is not owner verification. */
export type EmailAttribution={
  allowed:boolean;
  reason:string;
  domain:string|null;
};
const PLACEHOLDER_DOMAINS=new Set([
 'email.com','example.com','example.org','example.net','teste.com','test.com','domain.com','sample.com'
]);
export function evaluateBusinessEmailAttribution(email:string,website:string|null|undefined):EmailAttribution{
 const mail=String(email||'').trim().toLowerCase();
 const at=mail.lastIndexOf('@');
 const domain=at>=0?mail.slice(at+1):null;
 const blocked=(reason:string):EmailAttribution=>({allowed:false,reason,domain});
 if(!domain||!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain))return blocked('E-mail não confirmado.');
 if(PLACEHOLDER_DOMAINS.has(domain))return blocked('Endereço de exemplo ou domínio genérico. Confirme o contato real da unidade.');
 if(!website)return blocked('Site oficial da unidade indisponível para verificar vínculo do e-mail.');
 let hostname:string;
 try{
  const uri=new URL(website);
  if(!['https:','http:'].includes(uri.protocol))return blocked('Site da empresa não verificável.');
  hostname=uri.hostname.toLowerCase().replace(/^www\./,'').replace(/\.$/,'');
 }catch{return blocked('Site da empresa não verificável.')}
 if(hostname===domain||hostname.endsWith('.'+domain)||domain.endsWith('.'+hostname))
  return {allowed:true,reason:'Domínio do e-mail corresponde ao site público da empresa; confirmar a caixa e o responsável antes do envio.',domain};
 return blocked('E-mail encontrado, mas domínio diferente do site da unidade. Confirmar vínculo antes de enviar.');
}
