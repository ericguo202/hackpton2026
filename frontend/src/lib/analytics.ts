type AnalyticsParams = Record<string, string | number | boolean | null | undefined>;

type GtagCommand =
  | ['js', Date]
  | ['config', string, AnalyticsParams?]
  | ['event', string, AnalyticsParams?]
  | ['consent', 'default' | 'update', Record<string, string>]
  | ['set', AnalyticsParams];

declare global {
  interface Window {
    dataLayer?: IArguments[];
    gtag?: (...args: GtagCommand) => void;
    __ipAnalyticsDebug?: () => {
      enabled: boolean;
      measurementId: string | null;
      consent: 'granted' | 'denied' | null;
      scriptSrc: string | null;
      dataLayer: unknown[];
    };
  }
}

export const ANALYTICS_CONSENT_STORAGE_KEY = 'interviewpie_analytics_consent';

const MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;
const SCRIPT_ID = 'interviewpie-ga4';

let initialized = false;
const DEBUG_ANALYTICS = import.meta.env.VITE_GA_DEBUG === 'true';

export function analyticsEnabled(): boolean {
  return Boolean(MEASUREMENT_ID);
}

export function normalizeAnalyticsPath(pathname: string): string {
  return pathname
    .replace(
      /\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?=\/|$)/gi,
      '/[id]',
    )
    .replace(/\/sessions\/[^/]+/g, '/sessions/[id]')
    .replace(/\/saved-question\/[^/]+/g, '/saved-question/[id]');
}

function sanitizeParams(params: AnalyticsParams = {}): AnalyticsParams {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null),
  );
}

function gtag(...args: GtagCommand) {
  window.dataLayer = window.dataLayer ?? [];
  window.gtag = window.gtag ?? function gtagShim() {
    // Match Google's install snippet shape so Tag Assistant sees normal gtag commands.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer?.push(arguments);
  };
  if (DEBUG_ANALYTICS) {
    console.debug('[analytics]', args);
  }
  window.gtag(...args);
}

function configureAnalytics() {
  if (!MEASUREMENT_ID) return;
  gtag('config', MEASUREMENT_ID, { send_page_view: false });
}

function storedConsentGranted(): boolean {
  try {
    return window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY) === 'granted';
  } catch {
    return false;
  }
}

export function initAnalytics() {
  if (!MEASUREMENT_ID || initialized || typeof window === 'undefined') return;
  initialized = true;

  gtag('consent', 'default', {
    analytics_storage: storedConsentGranted() ? 'granted' : 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });
  gtag('js', new Date());
  configureAnalytics();

  if (!document.getElementById(SCRIPT_ID)) {
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
    document.head.appendChild(script);
  }

  if (import.meta.env.DEV) {
    window.__ipAnalyticsDebug = () => ({
      enabled: analyticsEnabled(),
      measurementId: MEASUREMENT_ID ?? null,
      consent: getAnalyticsConsent(),
      scriptSrc: document.getElementById(SCRIPT_ID) instanceof HTMLScriptElement
        ? (document.getElementById(SCRIPT_ID) as HTMLScriptElement).src
        : null,
      dataLayer: Array.from(window.dataLayer ?? []).slice(-25),
    });
  }
}

export function setAnalyticsConsent(granted: boolean) {
  if (!analyticsEnabled() || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      ANALYTICS_CONSENT_STORAGE_KEY,
      granted ? 'granted' : 'denied',
    );
  } catch {
    // Keep consent denied if the browser refuses local persistence.
    granted = false;
  }
  initAnalytics();
  gtag('consent', 'update', {
    analytics_storage: granted ? 'granted' : 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });
  if (granted) configureAnalytics();
}

export function getAnalyticsConsent(): 'granted' | 'denied' | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY);
    return value === 'granted' || value === 'denied' ? value : null;
  } catch {
    return 'denied';
  }
}

export function trackPageView(pathname: string, params: AnalyticsParams = {}) {
  if (!MEASUREMENT_ID) return;
  initAnalytics();
  const pagePath = normalizeAnalyticsPath(pathname);
  gtag('event', 'page_view', sanitizeParams({
    send_to: MEASUREMENT_ID,
    page_path: pagePath,
    page_location: `${window.location.origin}${pagePath}`,
    page_title: document.title,
    ...params,
  }));
}

export function trackEvent(name: string, params: AnalyticsParams = {}) {
  if (!MEASUREMENT_ID) return;
  initAnalytics();
  gtag('event', name, sanitizeParams({
    send_to: MEASUREMENT_ID,
    ...params,
  }));
}

export function trackUiClick(params: AnalyticsParams = {}) {
  trackEvent('ui_click', params);
}
