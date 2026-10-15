/** Server-only: verify absence before requesting an invitation. */
export async function findCustomerUser(admin:any,email:string){
 const normalized=email.trim().toLowerCase();
 if(!normalized||!normalized.includes('@'))throw Error('customer_email_invalid');
 const seen=new Set<string>();
 const deadline=Date.now()+15000;
 for(let page=1;page<=20;page++){
  if(Date.now()>=deadline)throw Error('customer_user_lookup_budget_exhausted');
  let response:any;
  try{response=await admin.auth.admin.listUsers({page,perPage:1000})}catch{throw Error('customer_user_lookup_failed')}
  if(response.error||!Array.isArray(response.data?.users))throw Error('customer_user_lookup_failed');
  const users=response.data.users;
  for(const user of users){
   if(typeof user?.id!=='string'||!user.id||seen.has(user.id))throw Error('customer_user_pagination_unverified');
   seen.add(user.id);
   if(typeof user.email==='string'&&user.email.trim().toLowerCase()===normalized)return user;
  }
  // Compute the next page ourselves: the installed SDK truncates multi-digit Link page numbers.
  const hasMore=users.length===1000||Number(response.data.total)>seen.size||response.data.nextPage!=null;
  if(!hasMore)return null;
  if(!users.length)throw Error('customer_user_pagination_unverified');
 }
 throw Error('customer_user_pagination_unverified');
}

/** Caller must also hold the durable business/event lease before enabling invitation. */
export async function ensureCustomerUser(admin:any,email:string,redirectTo:string,authorizeInvite:()=>Promise<boolean>=async()=>true){
 const normalized=email.trim().toLowerCase();
 const existing=await findCustomerUser(admin,normalized);
 if(existing)return {user:existing,status:'linked' as const};
 if(!await authorizeInvite()){
  const reconciled=await findCustomerUser(admin,normalized);
  if(reconciled)return {user:reconciled,status:'linked' as const};
  throw Error('customer_invitation_reconciliation_required');
 }
 try{
  const invited=await admin.auth.admin.inviteUserByEmail(normalized,{redirectTo});
  const user=invited.data?.user;
  if(!invited.error&&typeof user?.id==='string'&&user.id&&typeof user.email==='string'&&user.email.trim().toLowerCase()===normalized)return {user,status:'invited' as const};
 }catch{/* An ambiguous response must be reconciled before deciding whether access exists. */}
 const reconciled=await findCustomerUser(admin,normalized);
 if(reconciled)return {user:reconciled,status:'linked' as const};
 throw Error('customer_user_creation_unverified');
}
