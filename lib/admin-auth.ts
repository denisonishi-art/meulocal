export async function adminSessionToken(secret:string){
  const data=new TextEncoder().encode(`meulocal-admin:${secret}`);
  const digest=await crypto.subtle.digest('SHA-256',data);
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

export async function isAdminRequest(request:Request){
  const secret=process.env.ADMIN_ACCESS_KEY;
  if(!secret)return false;
  const cookie=request.headers.get('cookie')||'';
  const match=cookie.match(/(?:^|;\s*)meulocal_admin=([^;]+)/);
  return Boolean(match&&decodeURIComponent(match[1])===await adminSessionToken(secret));
}
