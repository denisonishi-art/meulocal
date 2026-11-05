import {buildFirstContactDraft} from '../agents/first-contact-copy';

/** First contact requests permission before sending a completed diagnostic link. */
export function initialAcquisitionMessage(name:string,_token:string){
 const draft=buildFirstContactDraft({name,niche:'negócios locais',rating:null,reviews:null});
 return draft.message.replace('Se preferir não receber contatos, é só me avisar.','Se não quiser receber novos contatos, responda SAIR.');
}
