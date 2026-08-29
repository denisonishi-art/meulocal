import {NextResponse} from 'next/server';

export async function POST(req:Request){
  try{
    const {key}=await req.json();
    const configured=process.env.ADMIN_ACCESS_KEY;
    if(!configured)return NextResponse.json({error:'Admin não configurado.'},{status:503});
    if(typeof key!=='string'||key!==configured)return NextResponse.json({error:'Acesso inválido.'},{status:401});
    const res=NextResponse.json({ok:true});
    res.cookies.set('meulocal_admin',configured,{httpOnly:true,secure:true,sameSite:'strict',path:'/',maxAge:60*60*8});
    return res;
  }catch{return NextResponse.json({error:'Falha ao autenticar.'},{status:400})}
}

export async function DELETE(){
  const res=NextResponse.json({ok:true});
  res.cookies.set('meulocal_admin','',{httpOnly:true,secure:true,sameSite:'strict',path:'/',maxAge:0});
  return res;
}
