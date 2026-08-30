const ASAAS_API_BASE = process.env.ASAAS_ENV === 'production'
  ? 'https://api.asaas.com/v3'
  : 'https://api-sandbox.asaas.com/v3';

export type CreateRecurringCheckoutInput = {
  externalReference: string;
  name: string;
  description: string;
  valueBRL: number;
  successUrl: string;
  cancelUrl: string;
  expiredUrl: string;
  customerData?: {
    name?: string;
    email?: string;
    cpfCnpj?: string;
    phone?: string;
  };
};

export function ensureAsaasConfigured(): string {
  const key = process.env.ASAAS_API_KEY;
  if (!key) throw new Error('ASAAS_API_KEY_NOT_CONFIGURED');
  return key;
}

export async function createRecurringCheckout(input: CreateRecurringCheckoutInput) {
  const accessToken = ensureAsaasConfigured();
  const nextDueDate = new Date(Date.now() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');

  const response = await fetch(`${ASAAS_API_BASE}/checkouts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      access_token: accessToken,
      'User-Agent': 'MeuLocal/1.0',
    },
    body: JSON.stringify({
      billingTypes: ['CREDIT_CARD', 'PIX'],
      chargeTypes: ['RECURRENT'],
      minutesToExpire: 60,
      externalReference: input.externalReference,
      callback: {
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
        expiredUrl: input.expiredUrl,
      },
      items: [
        {
          name: input.name,
          description: input.description,
          quantity: 1,
          value: input.valueBRL,
        },
      ],
      subscription: {
        cycle: 'MONTHLY',
        nextDueDate,
      },
      ...(input.customerData ? { customerData: input.customerData } : {}),
    }),
    cache: 'no-store',
  });

  const payload = await response.json();
  if (!response.ok) {
    const message = payload?.errors?.[0]?.description || payload?.message || 'Falha ao criar checkout no Asaas.';
    throw new Error(message);
  }

  if (!payload?.id) throw new Error('ASAAS_CHECKOUT_ID_MISSING');

  return {
    id: payload.id as string,
    url: `https://asaas.com/checkoutSession/show?id=${encodeURIComponent(payload.id)}`,
  };
}
