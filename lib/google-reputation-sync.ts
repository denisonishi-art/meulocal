import {decryptToken,refreshGoogleAccessToken} from './google-business-server';
import {calculateReputationScore} from './reputation-score';

type AdminClient=any;
type Connection={user_id:string;business_id:string;google_account_id:string;google_location_id:string;refresh_token_ciphertext:string};

async function fetchAllReviews(accessToken:string,accountId:string,locationId:string){
  const all:any[]=[]; let pageToken:string|undefined; let totalReviewCount=0; let averageRating:number|null=null; let pages=0;
  do{
    const u=new URL(`https://mybusiness.googleapis.com/v4/${accountId}/${locationId}/reviews`);
    u.searchParams.set('pageSize','50');u.searchParams.set('orderBy','updateTime desc');if(pageToken)u.searchParams.set('pageToken',pageToken);
    const res=await fetch(u,{headers:{Authorization:`Bearer ${accessToken}`},cache:'no-store'});const payload=await res.json();
    if(!res.ok)throw new Error(payload?.error?.message||'GOOGLE_REVIEWS_FETCH_FAILED');
    all.push(...(payload.reviews||[]));totalReviewCount=Number(payload.totalReviewCount||totalReviewCount||all.length);averageRating=payload.averageRating==null?averageRating:Number(payload.averageRating);pageToken=payload.nextPageToken;pages++;
  }while(pageToken&&pages<20);
  return {reviews:all,totalReviewCount,averageRating,pages,truncated:Boolean(pageToken)};
}

export async function syncGoogleReputation(admin:AdminClient,conn:Connection,source:'manual'|'cron'|'onboarding'){
  try{
    const refreshed=await refreshGoogleAccessToken(decryptToken(conn.refresh_token_ciphertext));
    const fetched=await fetchAllReviews(refreshed.access_token,conn.google_account_id,conn.google_location_id);
    const since=Date.now()-30*86400000;
    const recent=fetched.reviews.filter(r=>new Date(r.createTime||r.updateTime||0).getTime()>=since).length;
    const answered=fetched.reviews.filter(r=>Boolean(r.reviewReply)).length;
    const responseRate=fetched.reviews.length?Math.round(answered/fetched.reviews.length*100):null;

    const {data:diag}=await admin.from('diagnostics').select('id').eq('business_id',conn.business_id).order('created_at',{ascending:false}).limit(1).maybeSingle();
    let competitorAvgReviews:number|null=null;
    if(diag?.id){const {data:comps}=await admin.from('competitors').select('google_review_count').eq('diagnostic_id',diag.id);const valid=(comps||[]).map((c:any)=>Number(c.google_review_count||0)).filter((n:number)=>n>0);if(valid.length)competitorAvgReviews=valid.reduce((a:number,b:number)=>a+b,0)/valid.length;}
    const {data:previous}=await admin.from('score_snapshots').select('review_count').eq('business_id',conn.business_id).order('snapshot_date',{ascending:false}).limit(1).maybeSingle();
    const result=calculateReputationScore({reviewCount:fetched.totalReviewCount,competitorAvgReviews,rating:fetched.averageRating,responseRate,reviewsLast30d:recent,previousReviewCount:previous?.review_count??null});
    const snapshot={business_id:conn.business_id,score:result.score,band:result.band,review_count:fetched.totalReviewCount,google_rating:fetched.averageRating,response_rate:responseRate,reviews_last_30d:recent,competitor_avg_reviews:competitorAvgReviews,competitor_avg_score:null,score_version:result.version,score_factors:{...result.factors,reviews_truncated:fetched.truncated},snapshot_date:new Date().toISOString().slice(0,10)};
    const {error:snapshotError}=await admin.from('score_snapshots').upsert(snapshot,{onConflict:'business_id,snapshot_date'});if(snapshotError)throw snapshotError;
    await admin.from('google_business_connections').update({last_sync_at:new Date().toISOString(),last_sync_status:'success',last_sync_error:null,token_expires_at:new Date(Date.now()+refreshed.expires_in*1000).toISOString()}).eq('user_id',conn.user_id).eq('business_id',conn.business_id);
    await admin.from('google_sync_logs').insert({business_id:conn.business_id,user_id:conn.user_id,source,status:'success',review_count:fetched.totalReviewCount,pages_fetched:fetched.pages,score:result.score,score_version:result.version});
    return {...snapshot,pagesFetched:fetched.pages,reviewsTruncated:fetched.truncated};
  }catch(error:any){
    const message=error?.message||'SYNC_FAILED';
    await admin.from('google_business_connections').update({last_sync_status:'failed',last_sync_error:message.slice(0,500)}).eq('user_id',conn.user_id).eq('business_id',conn.business_id);
    await admin.from('google_sync_logs').insert({business_id:conn.business_id,user_id:conn.user_id,source,status:'failed',error_code:'google_sync_failed',error_message:message.slice(0,500)});
    throw error;
  }
}
