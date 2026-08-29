import {ImageResponse} from 'next/og';

export const runtime='edge';
export const alt='MeuLocal — Mais avaliações no Google. Mais clientes locais.';
export const size={width:1200,height:630};
export const contentType='image/png';

export default function Image(){
  return new ImageResponse(
    <div style={{width:'100%',height:'100%',display:'flex',flexDirection:'column',justifyContent:'space-between',padding:'72px',background:'#ffffff',color:'#111827',fontFamily:'Arial, sans-serif'}}>
      <div style={{display:'flex',alignItems:'center',gap:'18px',fontSize:42,fontWeight:800}}>
        <div style={{width:58,height:58,borderRadius:18,background:'#111827',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center'}}>M</div>
        MeuLocal
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:'18px',maxWidth:'980px'}}>
        <div style={{fontSize:68,lineHeight:1.05,fontWeight:800}}>Mais avaliações no Google.<br/>Mais clientes locais.</div>
        <div style={{fontSize:30,color:'#4b5563'}}>Reputação local, diagnóstico e evolução em um só lugar.</div>
      </div>
      <div style={{fontSize:24,color:'#6b7280'}}>MeuLocal</div>
    </div>,
    size,
  );
}
