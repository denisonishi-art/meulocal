/** A primeira abordagem pede permissão antes de compartilhar o diagnóstico pronto. */
export function initialAcquisitionMessage(name:string,_token:string){
 return 'Olá, tudo bem?\n\n'+
  'Sou Denis, fundador do MeuLocal, uma empresa criada para ajudar negócios locais a melhorar sua performance nas avaliações do Google e transformar uma boa reputação em mais oportunidades de conquistar clientes.\n\n'+
  'Ao pesquisar negócios locais, encontrei '+name+'. A reputação no Google pode influenciar a escolha de novos clientes; queremos ajudar a aproveitar melhor esse potencial.\n\n'+
  'Posso preparar e enviar uma análise gratuita comparando a presença de '+name+' no Google com negócios que disputam o mesmo público, incluindo oportunidades práticas de melhoria?\n\n'+
  'Se não quiser receber novos contatos, responda SAIR.';
}
