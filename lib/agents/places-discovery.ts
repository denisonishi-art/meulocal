/** Shared existing Google Text Search; one bounded read, no database/CRM writes. */
export async function discoverGooglePlaces(query:string,limit:number,key:string,transport:typeof fetch=fetch){
 if(!key)throw Error('google_places_not_configured');
 if(!Number.isInteger(limit)||limit<1||limit>20||query.length<3||query.length>180)throw Error('query_invalid');
 const fields=['places.id','places.displayName','places.formattedAddress','places.addressComponents','places.location','places.rating','places.userRatingCount','places.websiteUri','places.nationalPhoneNumber','places.primaryType','places.googleMapsUri','places.businessStatus'].join(',');
 const response=await transport('https://places.googleapis.com/v1/places:searchText',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':fields},body:JSON.stringify({textQuery:/\b(brasil|brazil)\b/i.test(query)?query:`${query} Brasil`,languageCode:'pt-BR',regionCode:'BR',pageSize:limit}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error('google_http_'+response.status);const payload=await response.json();if(payload.places!==undefined&&!Array.isArray(payload.places))throw Error('google_schema_invalid');
 const observedAt=new Date().toISOString();
 const places=(payload.places||[]).slice(0,limit).filter((p:any)=>p.addressComponents?.some((c:any)=>c.types?.includes('country')&&c.shortText==='BR')).map((p:any)=>({id:p.id,name:p.displayName?.text||'',address:p.formattedAddress||'',addressComponents:p.addressComponents,latitude:p.location?.latitude??null,longitude:p.location?.longitude??null,rating:p.rating??null,reviewCount:p.userRatingCount??null,website:p.websiteUri||null,phone:p.nationalPhoneNumber||null,category:p.primaryType||null,googleMapsUri:p.googleMapsUri||null,businessStatus:p.businessStatus||null}));
 return {contract:'meulocal.places.v1',source:'google_places',observedAt,places};
}
