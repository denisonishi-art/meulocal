const PAID=new Set(['CHECKOUT_PAID','PAYMENT_CONFIRMED','PAYMENT_RECEIVED']);
export const supportedAsaasEvents=new Set([...PAID,'CHECKOUT_CREATED','CHECKOUT_CANCELED','CHECKOUT_EXPIRED','SUBSCRIPTION_INACTIVATED','SUBSCRIPTION_DELETED','SUBSCRIPTION_CREATED','PAYMENT_OVERDUE']);
export const paidAsaasEvents=PAID;
function text(value:any,max=256):string|null{
 if(value==null||value==='')return null;
 if(typeof value!=='string'||!value.trim()||value.length>max)throw Error('invalid_event');
 return value.trim();
}
function one(values:any[]):string|null{
 const found=values.map(value=>text(value)).filter((value):value is string=>value!==null);
 if(new Set(found).size>1)throw Error('invalid_event');
 return found[0]||null;
}
function object(value:any){if(value==null)return {};if(typeof value!=='object'||Array.isArray(value))throw Error('invalid_event');return value}
function cents(value:any):number|null{
 if(value==null)return null;
 if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1000000000||Math.abs(value*100-Math.round(value*100))>0.00001)throw Error('invalid_event');
 return Math.round(value*100);
}
export function normalizePayerEmail(value:any):string|null{
 const email=text(value,320)?.toLowerCase()||null;
 if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('invalid_event');
 return email;
}
/** Persist only immutable identifiers/financial facts; never card data or the full provider payload. */
export function normalizeAsaasEvent(raw:any){
 const input=object(raw),eventId=text(input.id),eventType=text(input.event,100);
 if(!eventId||!eventType||!/^[_A-Z]+$/.test(eventType))throw Error('invalid_event');
 const payment=object(input.payment),checkout=object(input.checkout),subscription=object(input.subscription);
 const customer=typeof payment.customer==='object'?object(payment.customer):{};
 const rootCustomer=typeof input.customer==='object'?object(input.customer):{};
 const checkoutId=text(checkout.id),paymentId=text(payment.id);
 const subscriptionId=one([subscription.id,typeof payment.subscription==='object'?object(payment.subscription).id:payment.subscription,checkout.subscription?.id]);
 const externalReference=one([checkout.externalReference,subscription.externalReference,payment.externalReference]);
 const payerEmails=[payment.customerEmail,customer.email,rootCustomer.email,checkout.customerData?.email].map(normalizePayerEmail).filter(Boolean);
 if(new Set(payerEmails).size>1)throw Error('invalid_event');
 let amountCents=cents(payment.value);
 if(checkout.items!=null){
  if(!Array.isArray(checkout.items)||checkout.items.length>100)throw Error('invalid_event');
  let total=0;
  for(const item of checkout.items){const price=cents(item?.value);if(price==null||!Number.isInteger(item?.quantity)||item.quantity<1||item.quantity>10000)throw Error('invalid_event');total+=price*item.quantity}
  if(amountCents!=null&&amountCents!==total)throw Error('invalid_event');
  amountCents=total;
 }
 if(supportedAsaasEvents.has(eventType)&&!checkoutId&&!paymentId&&!subscriptionId)throw Error('invalid_event');
 return {version:1,eventId,eventType,checkoutId,subscriptionId,paymentId,externalReference,
  status:one([payment.status,subscription.status,checkout.status]),
  paymentLink:one([payment.paymentLink,input.paymentLink,input.payment_link]),
  customerId:one([typeof payment.customer==='string'?payment.customer:customer.id,typeof checkout.customer==='string'?checkout.customer:null,typeof input.customer==='string'?input.customer:rootCustomer.id]),
  payerEmail:payerEmails[0]||null,amountCents,providerCreatedAt:text(input.dateCreated,100)};
}
