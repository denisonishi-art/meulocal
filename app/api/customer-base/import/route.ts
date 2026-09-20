import {NextResponse} from 'next/server';
import * as XLSX from 'xlsx';
import {customerContext,requireActiveAccount} from '@/lib/customer-context';

const NAME_KEYS=['nome','name','cliente','customer'];
const EMAIL_KEYS=['email','e-mail','mail'];
const PHONE_KEYS=['telefone','phone','celular','whatsapp','mobile'];
const DATE_KEYS=['ultima_compra','última_compra','last_purchase','last_purchase_at','data_compra','purchase_date'];

function key(v:any){return String(v??'').trim().toLowerCase()}
function findValue(row:Record<string,any>,keys:string[]){
  const entries=Object.entries(row);
  for(const wanted of keys){
    const found=entries.find(([k])=>key(k)===wanted);
    if(found&&String(found[1]??'').trim())return String(found[1]).trim();
  }
  return '';
}
function normalizeEmail(v:string){const s=v.trim().toLowerCase();return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)?s:''}
function normalizePhone(v:string){const d=v.replace(/\D/g,'');if(d.length<10||d.length>13)return '';return d.startsWith('55')?d:'55'+d}
function parseDate(v:string){if(!v)return null;const d=new Date(v);return Number.isNaN(d.getTime())?null:d.toISOString()}
function contactKey(email:string,phone:string){return email?'email:'+email:phone?'phone:'+phone:''}

export const runtime='nodejs';

export async function POST(req:Request){
  const c=await customerContext(req);
  if(!c)return NextResponse.json({error:'Não autorizado.'},{status:401});
  if(!requireActiveAccount(c.account))return NextResponse.json({error:'Assinatura ativa necessária para importar a base.'},{status:403});
  try{
    const form=await req.formData();
    const file=form.get('file');
    if(!(file instanceof File))return NextResponse.json({error:'Selecione um arquivo CSV ou Excel.'},{status:400});
    const lower=file.name.toLowerCase();
    if(!lower.endsWith('.csv')&&!lower.endsWith('.xlsx')&&!lower.endsWith('.xls'))return NextResponse.json({error:'Formato não suportado. Use CSV, XLSX ou XLS.'},{status:400});
    if(file.size>8*1024*1024)return NextResponse.json({error:'Arquivo muito grande. O limite atual é 8 MB.'},{status:400});

    const bytes=await file.arrayBuffer();
    const workbook=XLSX.read(bytes,{type:'array',cellDates:true});
    const sheet=workbook.Sheets[workbook.SheetNames[0]];
    const raw=XLSX.utils.sheet_to_json<Record<string,any>>(sheet,{defval:''});
    if(!raw.length)return NextResponse.json({error:'A planilha está vazia.'},{status:400});
    if(raw.length>10000)return NextResponse.json({error:'Para o MVP, envie no máximo 10.000 contatos por arquivo.'},{status:400});

    const parsed=raw.map((row,index)=>{
      const name=findValue(row,NAME_KEYS);
      const email=normalizeEmail(findValue(row,EMAIL_KEYS));
      const whatsapp=normalizePhone(findValue(row,PHONE_KEYS));
      const lastPurchase=parseDate(findValue(row,DATE_KEYS));
      const ck=contactKey(email,whatsapp);
      return {index:index+2,name,email,whatsapp,lastPurchase,contactKey:ck,valid:Boolean(ck)};
    });

    const seen=new Set<string>();let duplicateRows=0;let invalidRows=0;
    const candidates=parsed.filter(x=>{
      if(!x.valid){invalidRows++;return false}
      if(seen.has(x.contactKey)){duplicateRows++;return false}
      seen.add(x.contactKey);return true;
    });

    const keys=candidates.map(x=>x.contactKey);
    const existingKeys=new Set<string>();
    for(let i=0;i<keys.length;i+=250){
      const chunk=keys.slice(i,i+250);
      const {data:existing,error:existingError}=await c.admin.from('customer_contacts').select('contact_key').eq('business_id',c.account!.business_id).in('contact_key',chunk);
      if(existingError)throw existingError;
      for(const row of existing||[])existingKeys.add((row as any).contact_key);
    }
    duplicateRows+=candidates.filter(x=>existingKeys.has(x.contactKey)).length;
    const fresh=candidates.filter(x=>!existingKeys.has(x.contactKey));

    const {data:imp,error:impError}=await c.admin.from('customer_imports').insert({
      business_id:c.account!.business_id,user_id:c.user.id,file_name:file.name,status:'ready',
      total_rows:raw.length,valid_rows:fresh.length,invalid_rows:invalidRows,duplicate_rows:duplicateRows
    }).select('id').single();
    if(impError)throw impError;

    for(let i=0;i<fresh.length;i+=500){
      const chunk=fresh.slice(i,i+500).map(x=>({
        business_id:c.account!.business_id,import_id:imp.id,name:x.name||null,email:x.email||null,whatsapp:x.whatsapp||null,
        last_purchase_at:x.lastPurchase,contact_key:x.contactKey,status:'imported'
      }));
      const {error:insertError}=await c.admin.from('customer_contacts').insert(chunk);
      if(insertError)throw insertError;
    }

    return NextResponse.json({
      ok:true,importId:imp.id,fileName:file.name,totalRows:raw.length,validRows:fresh.length,
      invalidRows,duplicateRows,
      preview:fresh.slice(0,8).map(x=>({name:x.name||'Sem nome',email:x.email||null,whatsapp:x.whatsapp||null,lastPurchaseAt:x.lastPurchase}))
    });
  }catch(error:any){
    return NextResponse.json({error:error?.message||'Não foi possível processar a base.'},{status:500});
  }
}