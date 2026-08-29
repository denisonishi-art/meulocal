import type {Metadata} from 'next';

export const metadata: Metadata = {
  title: 'Diagnóstico gratuito de presença no Google',
  description: 'Encontre sua empresa no Google e compare avaliações, reputação e presença local com negócios da sua região.',
  alternates: { canonical: '/diagnostico' },
  openGraph: {
    title: 'Diagnóstico gratuito de presença no Google | MeuLocal',
    description: 'Descubra como sua empresa está comparada aos concorrentes locais no Google.',
    url: '/diagnostico',
  },
};

export default function DiagnosticoLayout({children}:{children:React.ReactNode}){
  return children;
}
