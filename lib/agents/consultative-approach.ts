/**
 * Evidence-first commercial approach. Pure copy generation; never sends messages.
 * Missing evidence deliberately results in no draft, not generic promotional copy.
 */
export type ApproachInput = {
 businessName: string;
 niche: string;
 region: string;
 reviewCount?: number | null;
 competitorAverageReviews?: number | null;
 rating?: number | null;
 sourceUrl?: string | null;
 sourceObservedAt?: string | null;
};
export type ApproachDraft = {
 status: 'ready_for_review' | 'needs_evidence';
 reason: string;
 angle?: 'review_gap' | 'review_presence';
 evidence?: string;
 email?: { subject: string; body: string };
 whatsapp?: string;
};
function clean(value: string, max=100): string {
 return value.replace(/[\r\n<>]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
}
function validSource(input: ApproachInput): boolean {
 if (!input.sourceUrl || !input.sourceObservedAt) return false;
 try {
   const u=new URL(input.sourceUrl);
   const observed=Date.parse(input.sourceObservedAt);
   return (u.protocol==='https:' || u.protocol==='http:') && Number.isFinite(observed) && observed<=Date.now();
 } catch { return false; }
}
export function buildConsultativeApproach(input: ApproachInput): ApproachDraft {
 if (!validSource(input)) return {status:'needs_evidence',reason:'Fonte e data de observação verificáveis são obrigatórias.'};
 const business=clean(input.businessName), niche=clean(input.niche), region=clean(input.region);
 if (!business || !niche || !region) return {status:'needs_evidence',reason:'Empresa, nicho e região são obrigatórios.'};
 const reviews=input.reviewCount;
 if (reviews==null || !Number.isInteger(reviews) || reviews<0) return {status:'needs_evidence',reason:'Volume de avaliações não verificado.'};
 const avg=input.competitorAverageReviews;
 let evidence:string;
 let angle:ApproachDraft['angle'];
 if (avg!=null && Number.isFinite(avg) && avg>reviews) {
   evidence=`a ${business} aparece com ${reviews} avaliações, enquanto a referência comparativa informada aponta ${Math.round(avg)} avaliações em média`;
   angle='review_gap';
 } else {
   evidence=`a ${business} aparece com ${reviews} avaliações no perfil consultado`;
   angle='review_presence';
 }
 const opener=`Estava analisando empresas de ${niche} em ${region} e encontrei a ${business}.`;
 const observation=`Uma observação da consulta: ${evidence}.`;
 const insight=angle==='review_gap'
   ? 'Talvez exista uma oportunidade de fortalecer a prova social da empresa nas buscas locais.'
   : 'Esse é um dos sinais que clientes podem observar antes de entrar em contato; vale entender o contexto antes de recomendar qualquer mudança.';
 const question='Preparei uma análise inicial para contextualizar esse ponto. Posso compartilhar com você?';
 const emailBody=`Olá, tudo bem?\n\n${opener}\n\n${observation}\n\n${insight}\n\n${question}\n\nAbraço,\nEquipe MeuLocal\n\nSe preferir não receber novos contatos, responda SAIR.`;
 const whatsapp=`Olá! Tudo bem?\n\n${opener}\n\n${observation}\n\n${question}\n\nSe preferir não receber novas mensagens, responda SAIR.`;
 return { status:'ready_for_review',reason:'Mensagem gerada com base nos dados fornecidos; confirmar fonte e contexto antes de aprovar.',angle,evidence,
  email:{subject:`Uma observação sobre a presença da ${business} no Google`,body:emailBody},whatsapp};
}
