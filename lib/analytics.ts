export const GA4_ID = 'G-09EZKSRFRM';
export const ANALYTICS_CHOICE_KEY = 'meulocal_analytics_choice_v1';
export type AnalyticsChoice = 'granted' | 'denied' | null;

const pages: Record<string, string> = {
  '/': 'MeuLocal',
  '/contratar': 'Planos MeuLocal',
  '/diagnostico': 'Diagnóstico MeuLocal',
  '/avaliacoes-google': 'Avaliações Google',
  '/reputacao-google': 'Reputação Google',
  '/seo-local': 'SEO Local',
  '/sobre': 'Sobre o MeuLocal',
  '/privacidade': 'Política de Privacidade',
  '/termos': 'Termos de Uso',
};

export function publicPage(host: string, path: string) {
  if (!['meulocal.ia.br', 'www.meulocal.ia.br'].includes(host) || !Object.hasOwn(pages, path)) return null;
  return { page_location: `https://${host}${path}`, page_title: pages[path] };
}

export function readAnalyticsChoice(raw: string | null, now = Date.now()): AnalyticsChoice {
  try {
    const saved = JSON.parse(raw || 'null');
    return saved?.expires > now && ['granted', 'denied'].includes(saved?.choice) ? saved.choice : null;
  } catch { return null; }
}

// This controller is created only in the browser. No Google code is loaded before consent.
export function createPublicAnalytics(win: Window) {
  const target = win as Window & { dataLayer?: IArguments[]; gtag?: (...args: unknown[]) => void } & Record<string, unknown>;
  let current: ReturnType<typeof publicPage> = null;
  let ready = false;
  let loading = false;
  let configured = false;
  let lastPage: string | null = null;
  const disableKey = `ga-disable-${GA4_ID}`;
  const consent = (value: 'granted' | 'denied') => ({
    analytics_storage: value, ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
  });
  function clearCookies() {
    for (const name of ['_ga', `_ga_${GA4_ID.slice(2).replace(/-/g, '')}`]) {
      for (const domain of ['', `; Domain=${win.location.hostname}`, '; Domain=.meulocal.ia.br']) {
        win.document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax${domain}`;
      }
    }
  }
  function record() {
    if (!current || !ready || target[disableKey] || lastPage === current.page_location) return;
    const previous = lastPage;
    let source = '';
    try { source = new URL(win.document.referrer).origin; } catch { /* No valid referrer. */ }
    // Fixed titles, allowlisted paths and origin-only external referrers avoid personal URL data.
    const page = { ...current, page_referrer: previous || source };
    target.gtag!('set', page);
    target.gtag!('consent', 'update', consent('granted'));
    if (!configured) {
      target.gtag!('config', GA4_ID, {
        ...page, send_page_view: false, allow_google_signals: false,
        allow_ad_personalization_signals: false, cookie_domain: 'meulocal.ia.br',
      });
      configured = true;
    }
    target.gtag!('event', 'page_view', { ...page, send_to: GA4_ID });
    lastPage = current.page_location;
  }
  return {
    sync(path: string, choice: AnalyticsChoice) {
      current = choice === 'granted' ? publicPage(win.location.hostname, path) : null;
      target[disableKey] = !current;
      if (!current) {
        lastPage = null;
        if (choice === 'denied') {
          target.gtag?.('consent', 'update', consent('denied'));
          clearCookies();
        }
        return;
      }
      if (ready) { record(); return; }
      if (loading) return;
      loading = true;
      if (!target.gtag) {
        target.dataLayer = target.dataLayer || [];
        target.gtag = function () { target.dataLayer!.push(arguments); };
        target.gtag('consent', 'default', consent('denied'));
        target.gtag('js', new Date());
      }
      const script = win.document.createElement('script');
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`;
      script.referrerPolicy = 'origin';
      script.onload = () => { ready = true; loading = false; record(); };
      script.onerror = () => { loading = false; script.remove(); };
      win.document.head.appendChild(script);
    },
  };
}
