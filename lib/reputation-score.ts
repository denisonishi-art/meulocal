export const REPUTATION_SCORE_VERSION = 'reputation_v1';

type Input = {
  reviewCount: number;
  competitorAvgReviews: number | null;
  rating: number | null;
  responseRate: number | null;
  reviewsLast30d: number | null;
  previousReviewCount?: number | null;
};

const clamp = (n:number,min=0,max=100)=>Math.max(min,Math.min(max,n));

export function calculateReputationScore(input:Input){
  const reviewCount=Math.max(0,input.reviewCount||0);
  const competitorAvg=input.competitorAvgReviews&&input.competitorAvgReviews>0?input.competitorAvgReviews:null;
  const rating=input.rating==null?null:clamp(((input.rating-3.5)/1.5)*100);
  const response=input.responseRate==null?null:clamp(input.responseRate);
  const velocityBase=Math.max(1, Math.round((input.previousReviewCount??reviewCount)/12));
  const velocity=input.reviewsLast30d==null?null:clamp((input.reviewsLast30d/velocityBase)*50);
  const volume=competitorAvg?clamp((reviewCount/competitorAvg)*100):clamp(Math.log10(reviewCount+1)/3*100);

  const rawFactors:[string,number|null,number][]=[
    ['review_volume',volume,40],
    ['google_rating',rating,25],
    ['review_velocity',velocity,20],
    ['response_rate',response,15],
  ];
  const available=rawFactors.filter(([,value])=>value!=null) as [string,number,number][];
  const totalWeight=available.reduce((s,[,,w])=>s+w,0)||1;
  const weighted=available.reduce((s,[,value,w])=>s+value*(w/totalWeight),0);
  const score=Math.round(clamp(weighted));
  const band=score>=76?'strong':score>=56?'competitive':score>=36?'weak':'critical';
  const factors=Object.fromEntries(available.map(([name,value,w])=>[name,{score:Math.round(value),weight:Math.round(w/totalWeight*100)}]));
  return {score,band,version:REPUTATION_SCORE_VERSION,factors};
}
