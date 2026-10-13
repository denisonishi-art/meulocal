import { qualifyLead, rankLeads, validateJob, type BusinessLead } from "./prospect-intelligence";
const check=(condition:boolean,message:string)=>{if(!condition)throw new Error(message)};
const base:BusinessLead={externalId:"g:1",name:"Empresa A",segment:"geradores",city:"Sao Paulo",state:"SP",evidence:[]};
const empty=qualifyLead(base);
check(empty.score===0&&empty.priority==="sem_evidencias"&&empty.approvalStatus==="pending_review","no evidence must score zero");
check(qualifyLead({...base,evidence:[{signal:"few_reviews",url:"https://example.com",observedAt:"2026-10-12",description:"unverified",verified:false}]}).score===0,"unverified evidence must be ignored");
const evidence={signal:"few_reviews" as const,url:"https://example.com",observedAt:"2026-10-12",description:"Observed count",verified:true};
check(rankLeads([{...base,evidence:[evidence,evidence]},base]).length===1,"lead deduplication");
check(qualifyLead({...base,evidence:[evidence,evidence]}).score===30,"evidence deduplication");
let refused=false;try{validateJob({segment:"geradores",city:"Sao Paulo",state:"SP",requestedLimit:10,mode:"send" as "research_only"})}catch{refused=true}
check(refused,"outbound mode must be refused");

for (const segment of ['buffet infantil','pizzarias','escolas','despachantes','academias','aluguel de geradores']) {
  const job=validateJob({segment,city:'Sao Paulo',state:'SP',requestedLimit:5,mode:'research_only'});
  check(job.segment===segment,'multisector segment accepted: '+segment);
}
for (const segment of ['', 'a'.repeat(81)]) {
  let invalid=false;
  try {validateJob({segment,city:'Sao Paulo',state:'SP',requestedLimit:5,mode:'research_only'});} catch {invalid=true;}
  check(invalid,'invalid segment refused');
}
