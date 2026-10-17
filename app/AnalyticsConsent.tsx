'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ANALYTICS_CHOICE_KEY, AnalyticsChoice, createPublicAnalytics, publicPage, readAnalyticsChoice } from '@/lib/analytics';
import styles from './analytics-consent.module.css';

export default function AnalyticsConsent() {
  const pathname = usePathname();
  const [choice, setChoice] = useState<AnalyticsChoice>(null);
  const [available, setAvailable] = useState(false);
  const [editing, setEditing] = useState(false);
  const controller = useRef<ReturnType<typeof createPublicAnalytics> | null>(null);

  useEffect(() => {
    try { setChoice(readAnalyticsChoice(localStorage.getItem(ANALYTICS_CHOICE_KEY))); } catch { /* Consent stays ungranted. */ }
    const changed = (event: StorageEvent) => {
      if (event.key === ANALYTICS_CHOICE_KEY || event.key === null) setChoice(readAnalyticsChoice(event.newValue));
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);

  useEffect(() => {
    controller.current ||= createPublicAnalytics(window);
    controller.current.sync(pathname, choice);
    setAvailable(Boolean(publicPage(window.location.hostname, pathname)));
  }, [pathname, choice]);

  function choose(value: 'granted' | 'denied') {
    // Apply immediately, including withdrawal; storage failure never grants consent on a future visit.
    controller.current?.sync(pathname, value);
    try { localStorage.setItem(ANALYTICS_CHOICE_KEY, JSON.stringify({ choice: value, expires: Date.now() + 180 * 86400000 })); } catch { /* Keep this visit's choice only. */ }
    setChoice(value);
    setEditing(false);
  }

  if (!available) return null;
  if (choice && !editing) return <button type="button" className={styles.preferences} onClick={() => setEditing(true)}>Preferências de privacidade</button>;
  return <section className={styles.notice} aria-label="Preferências de medição de visitas">
    <div><strong>Podemos medir as visitas ao site?</strong><p>Com sua permissão, usamos cookies do Google Analytics para entender os acessos às páginas públicas. Sua escolha não impede o uso do site. <a href="/privacidade">Saiba mais</a>.</p></div>
    <div className={styles.actions}>
      <button type="button" onClick={() => choose('denied')}>Recusar</button>
      <button type="button" onClick={() => choose('granted')}>Aceitar medição</button>
    </div>
  </section>;
}
