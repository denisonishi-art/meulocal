/** Same-host link to the business website returned by Google, not an arbitrary
 * URL chosen by the operator. No operator-supplied URL is fetched server-side. */
export function officialSourceMatches(sourceUrl:string,website:string):boolean{
  try{
    const source=new URL(sourceUrl),official=new URL(website);
    if(source.protocol!=='https:'||!['https:','http:'].includes(official.protocol))return false;
    if(source.username||source.password||source.port||official.username||official.password||official.port)return false;
    const host=(url:URL)=>url.hostname.toLowerCase().replace(/^www\./,'').replace(/\.$/,'');
    return host(source)===host(official);
  }catch{return false}
}

