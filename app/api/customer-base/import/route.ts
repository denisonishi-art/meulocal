import {NextResponse} from 'next/server';
import * as XLSX from 'xlsx';
import {createHash} from 'node:crypto';
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
function normalizePhone(v:string){const d=v.replace(/\D/g,'');if(d.length===10||d.length===11)return '55'+d;return (d.length===12||d.length===13)&&d.startsWith('55')?d:''}
function parseDate(v:string){if(!v)return null;const d=new Date(v);return Number.isNaN(d.getTime())?null:d.toISOString()}
function contactKey(email:string,phone:string){return email?'email:'+email:phone?'phone:'+phone:''}

export const runtime='nodejs';
export const maxDuration=60;

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
    if(file.size>4*1024*1024)return NextResponse.json({error:'Arquivo muito grande. Envie até 4 MB por arquivo.'},{status:400});
    if(file.name.length>255)return NextResponse.json({error:'Use um nome de arquivo com até 255 caracteres.'},{status:400});

    const bytes=await file.arrayBuffer();
    const workbook=XLSX.read(bytes,{type:'array',cellDates:true,sheetRows:10002,sheets:0});
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
      return {index:index+2,name,email,whatsapp,lastPurchase,contactKey:ck,valid:Boolean(ck)&&name.length<=200&&email.length<=320};
    });

    const seen=new Set<string>();const seenPhones=new Set<string>();let duplicateRows=0;let invalidRows=0;
    const candidates=parsed.filter(x=>{
      if(!x.valid){invalidRows++;return false}
      if(seen.has(x.contactKey)||(x.whatsapp&&seenPhones.has(x.whatsapp))){duplicateRows++;return false}
      seen.add(x.contactKey);if(x.whatsapp)seenPhones.add(x.whatsapp);return true;
    });

    const {data,error}=await c.admin.rpc('import_customer_base',{
      p_business_id:c.account!.business_id,p_user_id:c.user.id,p_file_hash:createHash('sha256').update(Buffer.from(bytes)).digest('hex'),
      p_file_name:file.name,p_rows:candidates.map(({name,email,whatsapp,lastPurchase})=>({name,email,whatsapp,lastPurchase})),
      p_total_rows:raw.length,p_invalid_rows:invalidRows,p_duplicate_rows:duplicateRows
    });
    if(error||!data?.ok||!data.importId)return NextResponse.json({error:'Não foi possível salvar a importação. Tente novamente com o mesmo arquivo.'},{status:503});
    return NextResponse.json(data);
  }catch{
    return NextResponse.json({error:'Não foi possível processar a base. Confira o arquivo e tente novamente.'},{status:503});
  }
}
