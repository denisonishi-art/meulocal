import {NextResponse} from 'next/server';
import type {NextRequest} from 'next/server';

async function sessionToken(secret:string){
  const data=new TextEncoder().encode(`meulocal-admin:${secret}`);
  const digest=await crypto.subtle.digest('SHA-256',data);
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

export async function middleware(req:NextRequest){
  const path=req.nextUrl.pathname;
  if(!path.startsWith('/admin')) return NextResponse.next();
  const configured=process.env.ADMIN_ACCESS_KEY;
  if(!configured)return NextResponse.json({error:'Admin ainda não configurado.'},{status:503});
  const provided=req.cookies.get('meulocal_admin')?.value;
  if(provided===await sessionToken(configured))return NextResponse.next();
  const loginUrl=req.nextUrl.clone();
  loginUrl.pathname='/admin-login';
  loginUrl.searchParams.set('next',path);
  return NextResponse.redirect(loginUrl);
}

export const config={matcher:['/admin/:path*']};
