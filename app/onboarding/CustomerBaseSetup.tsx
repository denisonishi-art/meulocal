'use client';
import {useState} from 'react';
import {createClient} from '@supabase/supabase-js';
import {Check,FileSpreadsheet,ShieldCheck,Upload,Workflow} from 'lucide-react';

const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

type ImportSummary={importId:string;fileName:string;totalRows:number;validRows:number;invalidRows:number;duplicateRows:number;preview:any[]};
type Activation={queued:number;firstActivationDate:string;lastActivationDate:string;day1:number;day2:number;steadyLimit:number};

export default function CustomerBaseSetup({onReady}:{onReady?:(ready:boolean)=>void}){
  const[file,setFile]=useState<File|null>(null);const[summary,setSummary]=useState<ImportSummary|null>(null);
  const[confirmed,setConfirmed]=useState(false);const[activation,setActivation]=useState<Activation|null>(null);
  const[busy,setBusy]=useState(false);const[error,setError]=useState('');

  async function token(){if(!url||!key)return null;const sb=createClient(url,key);return (await sb.auth.getSession()).data.session?.access_token||null}
  async function upload(){
    if(!file)return;setBusy(true);setError('');
    try{const t=await token();if(!t){window.location.href='/login';return}const form=new FormData();form.append('file',file);
      const r=await fetch('/api/customer-base/import',{method:'POST',headers:{Authorization:'Bearer '+t},body:form});const j=await r.json();if(!r.ok)throw new Error(j.error||'Falha na importação');setSummary(j);setConfirmed(false);setActivation(null);onReady?.(false);
    }catch(e:any){setError(e.message)}finally{setBusy(false)}
  }
  async function confirm(){
    if(!summary)return;setBusy(true);setError('');
    try{const t=await token();if(!t)return;const r=await fetch('/api/customer-base/confirm',{method:'POST',headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'},body:JSON.stringify({importId:summary.importId})});const j=await r.json();if(!r.ok)throw new Error(j.error||'Falha ao confirmar a base');setConfirmed(true)}
    catch(e:any){setError(e.message)}finally{setBusy(false)}
  }
  async function activate(){
    setBusy(true);setError('');
    try{const t=await token();if(!t)return;const r=await fetch('/api/customer-base/activate',{method:'POST',headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'},body:JSON.stringify({confirmed:true})});const j=await r.json();if(!r.ok)throw new Error(j.error||'Falha ao ativar');setActivation(j);onReady?.(true)}
    catch(e:any){setError(e.message)}finally{setBusy(false)}
  }

  return <div className="baseSetup">
    <div className="flywheel">
      <span>COMO O MEULOCAL FUNCIONA</span>
      <div><b>1</b><strong>Base</strong><small>Você envia seus clientes</small></div>
      <i>→</i><div><b>2</b><strong>Validação</strong><small>Validamos e deduplicamos</small></div>
      <i>→</i><div><b>3</b><strong>Ativação</strong><small>30 → 40 → 50/dia</small></div>
      <i>→</i><div><b>4</b><strong>Avaliações</strong><small>Pedido e lembretes</small></div>
      <i>→</i><div><b>5</b><strong>Reputação</strong><small>Mais confiança local</small></div>
    </div>

    {!summary&&<div className="baseUpload">
      <FileSpreadsheet size={28}/><strong>Envie sua base de clientes</strong>
      <p>CSV, XLSX ou XLS. Use colunas como Nome, E-mail, Telefone/WhatsApp e, se tiver, Data da última compra.</p>
      <label className="filePicker"><Upload size={17}/><span>{file?.name||'Selecionar planilha'}</span><input type="file" accept=".csv,.xlsx,.xls" onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
      <button className="primary" type="button" disabled={!file||busy} onClick={upload}>{busy?'Processando...':'Validar minha base'}</button>
    </div>}

    {summary&&!confirmed&&<div className="baseReview">
      <div className="baseNumbers"><article><span>Recebidos</span><strong>{summary.totalRows}</strong></article><article><span>Válidos</span><strong>{summary.validRows}</strong></article><article><span>Duplicados</span><strong>{summary.duplicateRows}</strong></article><article><span>Inválidos</span><strong>{summary.invalidRows}</strong></article></div>
      <div className="protectionNote"><ShieldCheck/><div><strong>Nada será enviado ainda.</strong><span>Primeiro você confirma a base. A automação só começa depois de uma segunda confirmação explícita.</span></div></div>
      <button className="primary" type="button" disabled={busy||summary.validRows===0} onClick={confirm}>{busy?'Confirmando...':'Confirmar esta base'} <Check size={17}/></button>
    </div>}

    {summary&&confirmed&&!activation&&<div className="activationRule">
      <div className="protectionNote"><Workflow/><div><strong>Ativação protegida</strong><span>Dia 1: 30 clientes · Dia 2: 40 · Dia 3 em diante: até 50 por dia útil. Cada contato recebe no máximo 3 tentativas: D0, D+3 e D+7. Opt-out encerra a régua imediatamente.</span></div></div>
      <p>Essa distribuição gradual ajuda a preservar a reputação dos seus canais e evita comportamento de disparo em massa.</p>
      <button className="primary" type="button" disabled={busy} onClick={activate}>{busy?'Ativando...':'Ativar automação de avaliações'}</button>
    </div>}

    {activation&&<div className="activationDone"><Check size={24}/><div><strong>Automação ativada.</strong><span>{activation.queued} clientes foram organizados na fila protegida. A ativação começa em {new Date(activation.firstActivationDate+'T12:00:00').toLocaleDateString('pt-BR')} e a base atual está prevista até {new Date(activation.lastActivationDate+'T12:00:00').toLocaleDateString('pt-BR')}.</span></div></div>}
    {error&&<div className="loginError">{error}</div>}
  </div>;
}