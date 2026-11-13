import {adminSessionToken} from '@/lib/admin-auth';
export const DAILY_QUEUE_SIZE=10;
export const DAILY_REGION='São Paulo, SP';
/** Rodízio diário dos três nichos. */
export const DAILY_NICHES=['clínica odontológica','restaurante','oficina mecânica'] as const;
export const normalizePlaceId=(id:string)=>String(id||'').replace(/^places\//,'');
/** Dia da fila (YYYY-MM-DD) no fuso America/Sao_Paulo. */
export function queueDate(now=new Date()):string{
 return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
export function nicheForDate(date:string):string{
 const day=Math.floor(Date.parse(date+'T00:00:00Z')/86400000);
 return DAILY_NICHES[((day%DAILY_NICHES.length)+DAILY_NICHES.length)%DAILY_NICHES.length];
}
/** Só entram empresas com site (o e-mail precisa vir da página oficial) e ainda não vistas. */
export function pickFreshCandidates<T extends {id:string;website?:string|null}>(candidates:T[],seen:Set<string>,limit:number):T[]{
 const out:T[]=[],local=new Set<string>();
 for(const c of candidates){
  const id=normalizePlaceId(c.id);
  if(!id||!c.website||seen.has(id)||local.has(id))continue;
  local.add(id);out.push(c);if(out.length>=limit)break;
 }
 return out;
}
export async function adminCookieHeader():Promise<string>{
 const secret=process.env.ADMIN_ACCESS_KEY;
 if(!secret)throw Error('admin_key_missing');
 return 'meulocal_admin='+encodeURIComponent(await adminSessionToken(secret));
}
export type CallResult={ok:boolean;status:number;json:any};
export type Caller=(path:string,body:unknown)=>Promise<CallResult>;
/** Chama as rotas administrativas do próprio app com a sessão administrativa derivada da chave. */
export async function appCaller():Promise<Caller>{
 const base=(process.env.NEXT_PUBLIC_APP_URL||'https://meulocal.ia.br').replace(/\/$/,''),cookie=await adminCookieHeader();
 return async(path,body)=>{
  const res=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',cookie},body:JSON.stringify(body),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(120000)});
  return {ok:res.ok,status:res.status,json:await res.json().catch(()=>null)};
 };
}
