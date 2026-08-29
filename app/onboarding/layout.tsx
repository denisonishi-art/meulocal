import type {Metadata} from 'next';
import './onboarding.css';

export const metadata:Metadata={title:'Onboarding',robots:{index:false,follow:false}};

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
