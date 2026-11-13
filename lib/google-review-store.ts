// Persistência das avaliações do Google já baixadas pela sincronização de reputação.
const STARS:Record<string,number>={ONE:1,TWO:2,THREE:3,FOUR:4,FIVE:5};
const iso=(v:unknown)=>{const t=typeof v==='string'?Date.parse(v):NaN;return Number.isFinite(t)?new Date(t).toISOString():null};
const text=(v:unknown,max:number)=>typeof v==='string'&&v.trim()?v.trim().slice(0,max):null;
/** Converte uma avaliação da API v4 do Google. Não leva dados de quem avaliou. */
export function toStoredReview(businessId:string,review:any,seenAt:string){
 const id=typeof review?.reviewId==='string'&&review.reviewId?review.reviewId:typeof review?.name==='string'?review.name.split('/').pop():null;
 if(!id)return null;
 return {business_id:businessId,google_review_id:String(id).slice(0,300),star_rating:STARS[String(review.starRating)]??null,comment:text(review.comment,8000),reply_comment:text(review.reviewReply?.comment,8000),reply_updated_at:iso(review.reviewReply?.updateTime),review_created_at:iso(review.createTime),review_updated_at:iso(review.updateTime),last_seen_at:seenAt,removed_at:null};
}
/** Grava (upsert) as avaliações. Se a lista veio completa, marca como removidas as que sumiram do Google. */
export async function storeGoogleReviews(admin:any,businessId:string,reviews:any[],{complete}:{complete:boolean}){
 const seenAt=new Date().toISOString();
 const rows=[...new Map(reviews.map(r=>toStoredReview(businessId,r,seenAt)).filter(Boolean).map((r:any)=>[r.google_review_id,r])).values()];
 for(let i=0;i<rows.length;i+=200){
  const {error}=await admin.from('google_reviews').upsert(rows.slice(i,i+200),{onConflict:'business_id,google_review_id'});
  if(error)throw Error('google_reviews_store_failed');
 }
 let removed=0;
 if(complete){
  const {data,error}=await admin.from('google_reviews').update({removed_at:seenAt}).eq('business_id',businessId).is('removed_at',null).lt('last_seen_at',seenAt).select('google_review_id');
  if(error)throw Error('google_reviews_store_failed');
  removed=(data||[]).length;
 }
 return {stored:rows.length,removed};
}
