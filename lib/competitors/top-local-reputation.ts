/**
 * Local reputation benchmark for the MeuLocal diagnostic.
 * Scores are MeuLocal's ranking method, NOT Google's ranking.
 * Missing rating, count or geometry disqualifies a place from a "top" claim.
 */
export const LOCAL_COMPETITOR_RADIUS_METERS=3000;
export const EXTENDED_COMPETITOR_RADIUS_METERS=5000;
export const LOCAL_COMPETITOR_LIMIT=3;
export const MIN_RELIABLE_REVIEWS=5;
const PRIOR_RATING=4;
const PRIOR_REVIEWS=25;

export type GeoPoint={latitude:number;longitude:number};
export type LocalGooglePlace={
 id?:string;
 displayName?:{text?:string};
 formattedAddress?:string;
 location?:GeoPoint;
 rating?:number;
 userRatingCount?:number;
 websiteUri?:string;
 primaryType?:string;
 types?:string[];
 businessStatus?:string;
};
export type RankedLocalCompetitor={
 id:string;
 name:string;
 address:string;
 rating:number;
 reviewCount:number;
 website:string|null;
 category:string|null;
 reviewDataReliable:true;
 distanceKm:number;
 reputationRankScore:number;
};

export function isGeoPoint(value:unknown):value is GeoPoint{
 if(!value||typeof value!=='object')return false;
 const p=value as Partial<GeoPoint>;
 return typeof p.latitude==='number'&&Number.isFinite(p.latitude)&&Math.abs(p.latitude)<=90&&
   typeof p.longitude==='number'&&Number.isFinite(p.longitude)&&Math.abs(p.longitude)<=180;
}

export function distanceMeters(from:GeoPoint,to:GeoPoint){
 const toRadians=(n:number)=>n*Math.PI/180;
 const dLat=toRadians(to.latitude-from.latitude);
 const dLon=toRadians(to.longitude-from.longitude);
 const angle=Math.sin(dLat/2)**2+Math.cos(toRadians(from.latitude))*Math.cos(toRadians(to.latitude))*Math.sin(dLon/2)**2;
 return 6371000*2*Math.atan2(Math.sqrt(angle),Math.sqrt(Math.max(0,1-angle)));
}

/** A 5.0 rating backed by 2 reviews cannot outrank a strong, well-reviewed competitor by default. */
export function weightedReputationRating(rating:number,reviews:number){
 return (rating*reviews+PRIOR_RATING*PRIOR_REVIEWS)/(reviews+PRIOR_REVIEWS);
}

/**
 * Picks up to 3 strongest comparable results within the configured capped radius, using a volume-adjusted rating.
 * Google Nearby Search is capped at 20 results per request, so these are top candidates
 * among returned places, not a claim of an exhaustive market ranking.
 */
export function selectTopLocalCompetitors(args:{
 businessId:string;
 center:GeoPoint;
 businessCategory:string;
 places:LocalGooglePlace[];
 radiusMeters?:3000|5000;
 requireCategory?:boolean;
}):RankedLocalCompetitor[]{
 const {businessId,center,businessCategory,places,radiusMeters=LOCAL_COMPETITOR_RADIUS_METERS,requireCategory=true}=args;
 if(!isGeoPoint(center))return [];
 const byId=new Map<string,RankedLocalCompetitor>();
 for(const place of places){
  if(!place.id||place.id===businessId||!place.displayName?.text?.trim()||!isGeoPoint(place.location))continue;
  if(place.businessStatus&&place.businessStatus!=='OPERATIONAL')continue;
  if(requireCategory&&place.primaryType!==businessCategory&&!place.types?.includes(businessCategory))continue;
  const rating=place.rating;
  const reviewCount=place.userRatingCount;
  if(typeof rating!=='number'||!Number.isFinite(rating)||rating<=0||rating>5||
    typeof reviewCount!=='number'||!Number.isInteger(reviewCount)||reviewCount<MIN_RELIABLE_REVIEWS)continue;
  const distance=distanceMeters(center,place.location);
  if(distance>radiusMeters)continue;
  byId.set(place.id,{
   id:place.id,name:place.displayName.text.trim(),address:place.formattedAddress||'',
   rating,reviewCount,website:place.websiteUri||null,category:place.primaryType||null,
   reviewDataReliable:true,distanceKm:Number((distance/1000).toFixed(2)),
   reputationRankScore:Number(weightedReputationRating(rating,reviewCount).toFixed(4))
  });
 }
 return [...byId.values()].sort((a,b)=>b.reputationRankScore-a.reputationRankScore||
   b.reviewCount-a.reviewCount||b.rating-a.rating||a.distanceKm-b.distanceKm||a.id.localeCompare(b.id))
  .slice(0,LOCAL_COMPETITOR_LIMIT);
}
