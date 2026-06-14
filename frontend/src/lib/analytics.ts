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
      region: AnalyticsRegion;
      mode: AnalyticsMode;
      gpc: boolean;
      measurementId: string | null;
      consent: 'granted' | 'denied' | null;
      noticeAck: boolean;
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
// Records that a default-on (us/implied) visitor saw the notice and dismissed it
// WITHOUT opting out, so we don't re-nag. Distinct from the explicit-choice key
// above — acking the notice never means "granted" and never upgrades the mode.
export const ANALYTICS_NOTICE_ACK_KEY = 'interviewpie_analytics_notice_ack';

const MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;
const SCRIPT_ID = 'interviewpie-ga4';

const DEBUG_ANALYTICS = import.meta.env.VITE_GA_DEBUG === 'true';
// Dev-only override so we can exercise each jurisdiction bucket without a VPN
// (the real region comes from the `ip_country` cookie set by the Vercel edge,
// which never exists under `vite dev`). Accepts a bucket name or a country code.
const FORCE_REGION = (import.meta.env.VITE_GA_FORCE_REGION as string | undefined)
  ?.trim()
  .toLowerCase();

/**
 * Jurisdiction bucket that decides the *default* (pre-choice) analytics posture:
 * - `strict`   — EU/EEA, UK, India, every other country, AND unknown (fail-closed):
 *                nothing loads until the user explicitly opts in.
 * - `us`       — notice + opt-out; full GA4 (cookies/IDs) on by default.
 * - `implied`  — AU/NZ/SG; notice + opt-out; cookieless aggregate pings on by default.
 *
 * `strict` is the fallback, so we only enumerate the two permissive buckets — any
 * country we don't recognize (or a missing cookie) lands on `strict`.
 */
export type AnalyticsRegion = 'us' | 'implied' | 'strict';

/** Resolved per-region default vs. explicit choice. The single dispatch gate. */
export type AnalyticsMode = 'off' | 'full' | 'cookieless';

const IMPLIED_CONSENT_COUNTRIES = new Set(['AU', 'NZ', 'SG']);

let initializedMode: AnalyticsMode | null = null;
let cachedRegion: AnalyticsRegion | null = null;

export function analyticsEnabled(): boolean {
  return Boolean(MEASUREMENT_ID);
}

function readCountryCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)ip_country=([A-Za-z]{2})\b/);
  return match ? match[1].toUpperCase() : null;
}

function regionForCountry(country: string): AnalyticsRegion {
  if (country === 'US') return 'us';
  if (IMPLIED_CONSENT_COUNTRIES.has(country)) return 'implied';
  return 'strict';
}

/**
 * The visitor's jurisdiction bucket. Sourced from the `ip_country` cookie the
 * Vercel edge middleware sets from `x-vercel-ip-country`; absent/unknown →
 * `strict` (fail-closed). Cached for the page's lifetime.
 */
export function getAnalyticsRegion(): AnalyticsRegion {
  if (cachedRegion) return cachedRegion;

  if (FORCE_REGION) {
    if (FORCE_REGION === 'us' || FORCE_REGION === 'implied' || FORCE_REGION === 'strict') {
      cachedRegion = FORCE_REGION;
    } else {
      cachedRegion = regionForCountry(FORCE_REGION.toUpperCase());
    }
    return cachedRegion;
  }

  const country = readCountryCookie();
  cachedRegion = country ? regionForCountry(country) : 'strict';
  return cachedRegion;
}

/** True when the visitor's region runs analytics by default (notice + opt-out). */
export function isDefaultOnRegion(): boolean {
  return getAnalyticsRegion() !== 'strict';
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
 * The single gate every dispatch path checks, resolving region + stored choice +
 * GPC into one of three postures:
 * - `off`        — send nothing, load nothing.
 * - `full`       — load GA4 with `analytics_storage: granted` (cookies + client_id).
 * - `cookieless` — load GA4 with `analytics_storage: denied` (advanced Consent
 *                  Mode → aggregate pings, no `_ga` cookie, no per-user id).
 *
 * GPC and an explicit opt-out always win (→ off). An explicit opt-in upgrades to
 * `full` in any region. With no explicit choice, the region default applies.
 */
export function analyticsMode(): AnalyticsMode {
  if (!analyticsEnabled() || gpcOptOut()) return 'off';
  const stored = getAnalyticsConsent();
  if (stored === 'denied') return 'off';
  if (stored === 'granted') return 'full';
  // No explicit choice yet → fall back to the region default.
  const region = getAnalyticsRegion();
  if (region === 'us') return 'full';
  if (region === 'implied') return 'cookieless';
  return 'off';
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

function consentSignal(storageGranted: boolean): Record<string, string> {
  // Ads stay denied in every mode — this is measurement-only, no ad personalization.
  return {
    analytics_storage: storageGranted ? 'granted' : 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  };
}

function configureAnalytics() {
  if (!MEASUREMENT_ID) return;
  gtag('config', MEASUREMENT_ID, { send_page_view: false });
}

function installDebugHook() {
  if (!import.meta.env.DEV) return;
  window.__ipAnalyticsDebug = () => ({
    enabled: analyticsEnabled(),
    region: getAnalyticsRegion(),
    mode: analyticsMode(),
    gpc: gpcOptOut(),
    measurementId: MEASUREMENT_ID ?? null,
    consent: getAnalyticsConsent(),
    noticeAck: hasAckedNotice(),
    scriptSrc: document.getElementById(SCRIPT_ID) instanceof HTMLScriptElement
      ? (document.getElementById(SCRIPT_ID) as HTMLScriptElement).src
      : null,
    dataLayer: Array.from(window.dataLayer ?? []).slice(-25),
  });
}

export function initAnalytics() {
  if (!MEASUREMENT_ID || typeof window === 'undefined') return;
  const mode = analyticsMode();
  if (mode === 'off') return;
  // Already loaded in this exact posture — nothing to do (the provider calls this
  // on every mount/navigation).
  if (initializedMode === mode) return;

  const storageGranted = mode === 'full';

  if (initializedMode === null) {
    // First load. Consent default MUST precede gtag.js for Consent Mode to apply.
    gtag('consent', 'default', consentSignal(storageGranted));
    gtag('js', new Date());
    configureAnalytics();

    if (!document.getElementById(SCRIPT_ID)) {
      const script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
      document.head.appendChild(script);
    }
  } else {
    // Mode changed after load (e.g. cookieless → full on an explicit grant).
    gtag('consent', 'update', consentSignal(storageGranted));
    configureAnalytics();
  }

  initializedMode = mode;
  installDebugHook();
}

/**
 * Persist + apply an explicit consent choice. Returns the *effective* persisted
 * value: if the browser refuses local persistence we fall back to denied, and the
 * return lets callers sync their UI to reality instead of assuming the write took.
 *
 * An explicit grant upgrades to `full` GA4 in any region (explicit consent is the
 * highest bar). An explicit denial is a hard opt-out everywhere — it both tells an
 * already-loaded gtag to stop storage and flips `analyticsMode()` to `off`, which
 * halts every further dispatch (the same treatment GPC gets).
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
    if (initializedMode === null) {
      initAnalytics();
    } else {
      // gtag already running (e.g. cookieless in an implied region) → upgrade.
      gtag('consent', 'update', consentSignal(true));
      configureAnalytics();
      initializedMode = 'full';
    }
  } else if (initializedMode !== null) {
    // Revoking after a prior load: tell an already-loaded gtag to stop storage.
    // Further events are blocked by the `off` gate in trackPageView/trackEvent.
    gtag('consent', 'update', consentSignal(false));
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

/** Whether a default-on visitor has dismissed the notice (without opting out). */
export function hasAckedNotice(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(ANALYTICS_NOTICE_ACK_KEY) === '1';
  } catch {
    // Can't read storage → treat as un-acked; the notice simply re-shows.
    return false;
  }
}

/** Record that a default-on visitor acknowledged the notice (leaves mode on). */
export function ackAnalyticsNotice(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ANALYTICS_NOTICE_ACK_KEY, '1');
  } catch {
    // Non-fatal — without the ack the notice re-shows next load, no data impact.
  }
}

export function trackPageView(pathname: string, params: AnalyticsParams = {}) {
  if (analyticsMode() === 'off') return;
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
  if (analyticsMode() === 'off') return;
  initAnalytics();
  gtag('event', name, sanitizeParams({
    send_to: MEASUREMENT_ID,
    ...params,
  }));
}

export function trackUiClick(params: AnalyticsParams = {}) {
  trackEvent('ui_click', params);
}
