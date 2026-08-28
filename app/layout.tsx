import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MeuLocal | Mais presença no Google. Mais clientes locais.',
  description: 'Avaliações automáticas, SEO Local e autoridade para pequenos negócios aparecerem mais no Google e conquistarem mais clientes na sua região.',
  metadataBase: new URL('https://meulocal.vercel.app'),
  openGraph: {
    title: 'MeuLocal | Crescimento local no Google',
    description: 'Mais avaliações. Mais presença no Google. Mais clientes locais.',
    type: 'website',
    locale: 'pt_BR'
  },
  robots: { index: true, follow: true }
};

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'MeuLocal',
  description: 'Plataforma de crescimento local para pequenos negócios.',
  serviceType: ['Gestão de avaliações', 'SEO Local', 'Autoridade Local']
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
        {children}
      </body>
    </html>
  );
}
