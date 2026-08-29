export const siteUrl=(process.env.NEXT_PUBLIC_APP_URL||'https://meulocal.vercel.app').replace(/\/$/,'');

export const siteConfig={
  name:'MeuLocal',
  description:'Ajude sua empresa a conquistar mais avaliações no Google, acompanhar sua reputação local e identificar oportunidades para ser mais escolhida na sua região.',
  url:siteUrl,
} as const;
