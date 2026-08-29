import type { Metadata } from 'next';
import './globals.css';
import './mobile.css';
import {siteConfig} from '@/lib/site';

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: 'MeuLocal | Mais avaliações no Google. Mais clientes locais.',
    template: '%s | MeuLocal',
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  openGraph: {
    title: 'MeuLocal | Mais avaliações no Google. Mais clientes locais.',
    description: siteConfig.description,
    type: 'website',
    locale: 'pt_BR',
    url: siteConfig.url,
    siteName: siteConfig.name,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MeuLocal | Mais avaliações no Google. Mais clientes locais.',
    description: siteConfig.description,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  verification: process.env.GOOGLE_SITE_VERIFICATION
    ? { google: process.env.GOOGLE_SITE_VERIFICATION }
    : undefined,
};

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${siteConfig.url}/#organization`,
      name: siteConfig.name,
      url: siteConfig.url,
      description: siteConfig.description,
    },
    {
      '@type': 'WebSite',
      '@id': `${siteConfig.url}/#website`,
      name: siteConfig.name,
      alternateName: 'Meu Local',
      url: siteConfig.url,
      inLanguage: 'pt-BR',
      publisher: { '@id': `${siteConfig.url}/#organization` },
    },
  ],
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
