import type {Metadata} from 'next';

export const metadata: Metadata = {
  title: 'Ativar MeuLocal',
  robots: { index: false, follow: false },
};

export default function ContratarLayout({children}:{children:React.ReactNode}){
  return children;
}
