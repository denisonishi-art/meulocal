import {createHash} from 'node:crypto';

export type GoogleReview = {reviewId:string;starRating:string;comment?:string;updateTime?:string;createTime?:string};
export type Verdict = 'negative'|'attention'|'clear'|'uncertain';
const stars:Record<string,number>={ONE:1,TWO:2,THREE:3,FOUR:4,FIVE:5};

/** No author name or raw comment is stored in the monitoring ledger. */
export function reviewVersion(review:GoogleReview){
 if(!review.reviewId||!stars[review.starRating])throw Error('invalid_google_review');
 return createHash('sha256').update(JSON.stringify([review.starRating,review.comment||''])).digest('hex');
}

export async function classifyReview(review:GoogleReview,analyze:(text:string)=>Promise<string>):Promise<Verdict>{
 if(!stars[review.starRating])throw Error('invalid_google_rating');
 if(stars[review.starRating]<=2)return 'negative';
 if(stars[review.starRating]===3)return 'attention';
 if(!review.comment?.trim())return 'clear';
 try{
  // A review is untrusted data. The model has no tools and cannot publish anything.
  const result=JSON.parse(await analyze(review.comment.slice(0,4000)));
  return result&&Object.keys(result).length===1&&typeof result.complaint==='boolean'?(result.complaint?'attention':'clear'):'uncertain';
 }catch{return 'uncertain'} // Model failure never silently suppresses a possible complaint.
}

export async function recordReviewObservations(db:any,businessId:string,reviews:GoogleReview[],analyze:(text:string)=>Promise<string>){
 let processed=0;
 for(const review of reviews){
  const version=reviewVersion(review);
  const old=await db.from('review_monitor_alerts').select('id,review_published_at').eq('business_id',businessId).eq('review_id',review.reviewId).eq('version',version).maybeSingle();
  if(old.error)throw Error('review_monitor_read_failed');
  const posted=typeof review.createTime==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(review.createTime)?Date.parse(review.createTime):NaN;
  const published=Number.isFinite(posted)&&posted<=Date.now()+5*60000?new Date(posted).toISOString():null;
  const timing={review_published_at:published,deadline_at:published?new Date(posted+3*3600000).toISOString():null};
  if(old.data){
   if(published&&!old.data.review_published_at){const updated=await db.from('review_monitor_alerts').update(timing).eq('id',old.data.id).eq('business_id',businessId);if(updated.error)throw Error('review_publication_time_save_failed')}
   continue;
  }
  if(processed>=5)return {complete:false,processed};
  const verdict=await classifyReview(review,analyze);
  const result=await db.from('review_monitor_alerts').insert({business_id:businessId,review_id:review.reviewId,version,rating:stars[review.starRating],...timing,error_code:published?null:'publication_time_unverified',verdict,state:verdict==='clear'?'ignored':'pending'});
  if(result.error&&result.error.code!=='23505')throw Error('review_monitor_save_failed');
  processed++;
 }
 return {complete:true,processed};
}

export function alertMessage(rating:number,verdict:Verdict){
 const reason=verdict==='negative'?'Avaliação de 1 ou 2 estrelas.':verdict==='uncertain'?'Não foi possível concluir a análise do texto. Confira a avaliação.':'Avaliação que pode exigir atenção.';
 return `MeuLocal: uma avaliação de ${rating} estrela(s) precisa da sua atenção.\n${reason}\nConfira as avaliações no seu Perfil da Empresa no Google.\nO MeuLocal não escreveu nem publicou resposta.\nAcompanhe sua conta em https://meulocal.ia.br/dashboard`;
}
