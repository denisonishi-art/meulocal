import {NextResponse} from 'next/server';
import type {NextRequest} from 'next/server';

export function middleware(req:NextRequest){
  const path=req.nextUrl.pathname;
  if(!path.startsWith('/admin')) return NextResponse.next();

  const configured=process.env.ADMIN_ACCESS_KEY;
  if(!configured){
    return NextResponse.json({error:'Admin ainda não configurado.'},{status:503});
  }

  const provided=req.cookies.get('meulocal_admin')?.value;
  if(provided===configured) return NextResponse.next();

  const loginUrl=req.nextUrl.clone();
  loginUrl.pathname='/admin-login';
  loginUrl.searchParams.set('next',path);
  return NextResponse.redirect(loginUrl);
}

export const config={matcher:['/admin/:path*']};
