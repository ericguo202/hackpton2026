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
      active: boolean;
      gpc: boolean;
      measurementId: string | null;
      consent: 'granted' | 'denied' | null;
      scriptSrc: string | null;
      dataLayer: unknown[];
    };
  }
  interface Navigator {
    // Global Privacy Control — a legally-binding opt-out signal in CA, CO, CT,
    // DE, MN, NE, NH, TX, OR and more. Not in lib.dom yet, so declared here.
    globalPrivacyControl?: boolean;
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

/**
 * True when the browser is sending a Global Privacy Control opt-out signal.
 * We honor it as a binding opt-out: it suppresses the consent banner and keeps
 * analytics inactive even over a previously stored `granted` choice.
 */
export function gpcOptOut(): boolean {
  if (typeof navigator === 'undefined') return false;
  try {
    return navigator.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

/**
 * The single gate every dispatch path checks. Strict opt-in: nothing loads or
 * fires until the user has explicitly granted consent — and GPC overrides even
 * an explicit grant.
 */
export function analyticsActive(): boolean {
  return analyticsEnabled() && !gpcOptOut() && getAnalyticsConsent() === 'granted';
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

export function initAnalytics() {
  if (!MEASUREMENT_ID || initialized || typeof window === 'undefined') return;
  // Strict opt-in: do not load gtag.js or fire anything until the user has
  // granted consent (and GPC isn't opting them out). Undecided/declined users
  // never reach Google — not even Consent Mode's cookieless pings.
  if (!analyticsActive()) return;
  initialized = true;

  gtag('consent', 'default', {
    analytics_storage: 'granted',
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
      active: analyticsActive(),
      gpc: gpcOptOut(),
      measurementId: MEASUREMENT_ID ?? null,
      consent: getAnalyticsConsent(),
      scriptSrc: document.getElementById(SCRIPT_ID) instanceof HTMLScriptElement
        ? (document.getElementById(SCRIPT_ID) as HTMLScriptElement).src
        : null,
      dataLayer: Array.from(window.dataLayer ?? []).slice(-25),
    });
  }
}

/**
 * Persist + apply the consent choice. Returns the *effective* persisted value:
 * if the browser refuses local persistence we fall back to denied, and the
 * return lets callers sync their UI to reality instead of assuming the write
 * took. (A grant we can't persist would silently re-prompt next load.)
 */
export function setAnalyticsConsent(granted: boolean): boolean {
  if (!analyticsEnabled() || typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(
      ANALYTICS_CONSENT_STORAGE_KEY,
      granted ? 'granted' : 'denied',
    );
  } catch {
    // Keep consent denied if the browser refuses local persistence.
    granted = false;
  }

  // GPC overrides an explicit grant — treat as denied, never load anything.
  if (granted && !gpcOptOut()) {
    initAnalytics();
    gtag('consent', 'update', {
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
    configureAnalytics();
  } else if (initialized) {
    // Revoking after a prior grant: tell an already-loaded gtag to stop. If
    // analytics never initialized, there is nothing loaded to update.
    gtag('consent', 'update', {
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
  }

  return granted;
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
  if (!analyticsActive()) return;
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
  if (!analyticsActive()) return;
  initAnalytics();
  gtag('event', name, sanitizeParams({
    send_to: MEASUREMENT_ID,
    ...params,
  }));
}

export function trackUiClick(params: AnalyticsParams = {}) {
  trackEvent('ui_click', params);
}
