/**
 * Controlled, evidence-first commercial introduction.
 * Only Google Places values supplied by the operator's selected search result
 * may be mentioned. No competitor gap or sales uplift is inferred.
 */
export type FirstContactProspect={
  name:string;
  niche:string;
  rating:number|null;
  reviews:number|null;
};

export const FIRST_CONTACT_INTRO='Sou Denis, fundador do MeuLocal, uma empresa criada para ajudar negócios locais a melhorar sua performance nas avaliações do Google e transformar uma boa reputação em mais oportunidades de conquistar clientes.';
export const FIRST_CONTACT_OPTOUT='Se preferir não receber contatos, é só me avisar.';

function segmentContext(niche:string){
  const normalized=niche.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(/escola|ingles|idioma|curso de lingua|cursos de lingua/.test(normalized))return {
    decision:'Quando alguém procura uma escola de idiomas, as avaliações de outros alunos podem ajudar na decisão de matrícula.',
    peers:'outras escolas que disputam a atenção dos mesmos alunos',
    benefit:'atrair novos alunos e gerar mais oportunidades de matrícula'
  };
  if(/clinica|medic|dentista|odontolog|fisioterap|psicolog/.test(normalized))return {
    decision:'Ao buscar uma clínica, as avaliações ajudam pacientes a avaliar confiança antes do agendamento.',
    peers:'outras clínicas que atendem o mesmo público',
    benefit:'atrair novos pacientes e oportunidades de agendamento'
  };
  if(/restaurante|bar|cafe|pizzaria|hamburguer/.test(normalized))return {
    decision:'Quem escolhe onde comer costuma consultar as avaliações no Google antes de decidir.',
    peers:'outros estabelecimentos que disputam o mesmo público',
    benefit:'atrair mais clientes e oportunidades de reservas'
  };
  return {
    decision:'Quem procura um negócio local costuma comparar as avaliações no Google antes de escolher.',
    peers:'outros negócios que disputam o mesmo público',
    benefit:'fortalecer a confiança e gerar novas oportunidades comerciais'
  };
}

function observation(p:FirstContactProspect){
  const who='o perfil de '+p.name;
  if(p.rating!==null&&p.reviews!==null){
    const rating=p.rating.toFixed(1).replace('.',',');
    const reviews=p.reviews+' '+(p.reviews===1?'avaliação':'avaliações');
    return 'Na consulta que fizemos ao Google, '+who+' aparecia com nota '+rating+' e '+reviews+'.';
  }
  if(p.reviews!==null)return 'Na consulta que fizemos ao Google, '+who+' aparecia com '+p.reviews+' '+(p.reviews===1?'avaliação':'avaliações')+'.';
  if(p.rating!==null)return 'Na consulta que fizemos ao Google, '+who+' aparecia com nota '+p.rating.toFixed(1).replace('.',',')+'.';
  return 'Encontramos '+p.name+' em nosso levantamento de negócios no Google.';
}

export function buildFirstContactDraft(p:FirstContactProspect){
  const context=segmentContext(p.niche);
  const evidence=observation(p);
  const opportunity=p.reviews!==null&&p.reviews<15
    ? 'Existe uma oportunidade de potencializar a presença de experiências positivas de clientes satisfeitos e, com isso, '+context.benefit+'.'
    : 'Uma gestão consistente das avaliações pode reforçar essa confiança e ajudar a '+context.benefit+'.';
  const cta='Posso preparar e enviar uma análise gratuita comparando a presença de '+p.name+' no Google com '+context.peers+', incluindo oportunidades práticas de melhoria?';
  const message=[
    'Olá, tudo bem?',
    FIRST_CONTACT_INTRO,
    context.decision,
    evidence,
    opportunity,
    cta,
    FIRST_CONTACT_OPTOUT
  ].join('\n\n');
  const rationale='Abordagem baseada na presença da empresa no Google, com apresentação do MeuLocal, benefício comercial potencial e convite sem compromisso para análise comparativa futura. Dados de concorrentes e ganhos de vendas não foram presumidos.';
  return {message,rationale,identity:FIRST_CONTACT_INTRO,evidence,cta,optout:FIRST_CONTACT_OPTOUT};
}

/** Fail closed if the model alters any fixed fact, invents a number or guarantees an outcome. */
export function isSafeFirstContactDraft(message:unknown,reference:ReturnType<typeof buildFirstContactDraft>){
  if(typeof message!=='string'||message.length<320||message.length>1400)return false;
  if(![reference.identity,reference.evidence,reference.cta,reference.optout].every(s=>message.includes(s)))return false;
  const freeText=message
    .replace(reference.identity,'')
    .replace(reference.evidence,'')
    .replace(reference.cta,'')
    .replace(reference.optout,'');
  if(/\d/.test(freeText)||/https?:\/\/|www\.|@/.test(freeText))return false;
  if(/garantid|garantimos|resultado comprovado|vendas comprovadas|já comparamos|já analisamos concorrentes|os concorrentes (?:têm|possuem)|está atrás de|aumentará as vendas|vai aumentar as vendas/i.test(message))return false;
  return true;
}
