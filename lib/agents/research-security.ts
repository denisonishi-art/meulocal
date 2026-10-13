import {timingSafeEqual,createHash} from 'node:crypto';
import {consumeRateLimit} from '@/lib/rate-limit';
export function researchAuthorized(request:Request){
 const expected=process.env.MEULOCAL_PROSPECTOR_API_KEY,actual=request.headers.get('x-prospector-api-key');
 if(!expected||!actual)return false;const a=Buffer.from(actual),b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b);
}
export async function researchRateLimit(request:Request,bucket:string){
 // Bind distributed quota to the dedicated caller, never untrusted forwarding headers.
 const caller=createHash('sha256').update(process.env.MEULOCAL_PROSPECTOR_API_KEY||'').digest('hex');
 const scoped=new Request(request.url,{headers:{'x-forwarded-for':caller}});
 return consumeRateLimit(scoped,bucket,12,60);
}
export async function boundedResearchJson(request:Request){
 const reader=request.body?.getReader();if(!reader)throw Error('invalid_json');let size=0;const chunks:Uint8Array[]=[];
 for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>65536){await reader.cancel();throw Error('payload_too_large')}chunks.push(part.value)}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw Error('invalid_json')}
}
