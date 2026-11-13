/** Limite diário de envios manuais (fuso America/Sao_Paulo). Aplicado no servidor. */
export function manualDailyCap():number{
 const n=Number(process.env.MEULOCAL_MANUAL_DAILY_CAP);
 return Number.isInteger(n)&&n>=1&&n<=50?n:10;
}
