// Public catalog. Provider IDs are not credentials. Purchase eligibility lives in the database.
export const paymentPlans = {
 essencial: {id:'essencial',name:'Essencial',amountCents:18900,paymentLinkId:'hkztixnoy3z2jxn0',adminId:'4756927'},
 inteligencia: {id:'inteligencia',name:'Inteligência',amountCents:28900,paymentLinkId:'71k8chmbik8gy1ph',adminId:'4756949'},
} as const;
export type PaymentPlanId=keyof typeof paymentPlans;
export function getPaymentPlan(id:unknown){return typeof id==='string'&&Object.prototype.hasOwnProperty.call(paymentPlans,id)?paymentPlans[id as PaymentPlanId]:null}
export function sharedLinkForEvent(link:unknown){return Object.values(paymentPlans).some(p=>p.paymentLinkId===link)?String(link):(process.env.ASAAS_SHARED_PAYMENT_LINK_ID||'lay9mi0r83n79lzn')}
