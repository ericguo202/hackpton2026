/**
 * Build-time prerenderer for the public marketing/legal pages.
 *
 * WHY A HEADLESS BROWSER, NOT NODE-SIDE SSG:
 * The app shell is client-only by construction — `Root.tsx` hard-codes
 * `<BrowserRouter>` inside `<ClerkProvider>` (a CSR SDK), and
 * `AnalyticsConsentBanner` reads `document.cookie` / `localStorage` during
 * render. Rendering that tree through `renderToString` in Node throws. A real
 * browser sidesteps all of it, and for five pages of static copy the output is
 * identical to true SSG.
 *
 * WHAT IT BUYS:
 * Vite emits a single `index.html` whose <body> is an empty `<div id="root">`.
 * Crawlers that don't execute JavaScript (Bing, Slack/LinkedIn/X unfurlers, and
 * most AI crawlers) therefore saw no content and no per-route metadata — every
 * URL served the homepage's title and description. This walks each public route
 * in Chromium, lets the app boot so `RouteSeo.tsx` writes that route's real
 * <head> tags, and freezes the result to its own HTML file.
 *
 * Because `main.tsx` uses `createRoot()` (not `hydrateRoot()`), React clears
 * `#root` on mount and re-renders from scratch. The prerendered markup is a
 * crawler-only artifact — there is no hydration-mismatch surface to worry about.
 *
 * Run automatically as part of `npm run build`. Set PRERENDER_SKIP=1 to bypass.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { preview } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

// How long a single route gets to boot and render its <h1> before we call it a
// failure. Generous: a cold Chromium plus Clerk's async load is not fast.
const ROUTE_TIMEOUT_MS = 30_000;

/**
 * A phrase that must NEVER appear in a snapshot.
 *
 * The consent banner is the single most dangerous thing to freeze into static
 * HTML: it is long prose that renders above the fold, and it is precisely what
 * Bing was already scraping as the site's search-result description. If it
 * leaks into a snapshot we'd make that bug permanent, so this is a hard build
 * failure rather than a warning.
 */
const BANNER_GUARD_PHRASE = 'uses Google Analytics to understand page views';

/**
 * Routes come from the sitemap so the two can never drift. The sitemap is the
 * declared list of indexable URLs; prerendering exactly that set is the
 * definition of what we want.
 */
async function routesFromSitemap() {
  const xml = await readFile(path.join(DIST, 'sitemap.xml'), 'utf8');
  const routes = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((match) =>
    new URL(match[1]).pathname.replace(/\/+$/, '') || '/',
  );
  if (routes.length === 0) {
    throw new Error('No <loc> entries found in dist/sitemap.xml');
  }
  return [...new Set(routes)];
}

/** `/` → dist/index.html; `/legal/terms` → dist/legal/terms/index.html. */
function outputPathFor(route) {
  if (route === '/') return path.join(DIST, 'index.html');
  return path.join(DIST, route.replace(/^\//, ''), 'index.html');
}

async function snapshot(browser, origin, route) {
  const page = await browser.newPage();
  try {
    // The theme is written onto <html> pre-paint by the inline script in
    // index.html, reading prefers-color-scheme. Pin it light so the snapshot
    // never ships `class="dark"` to visitors whose own theme we don't know yet.
    await page.emulateMediaFeatures([
      { name: 'prefers-color-scheme', value: 'light' },
    ]);

    // Suppress the consent banner at the source. `getAnalyticsConsent() !== null`
    // short-circuits its visibility check, so it never enters the DOM at all —
    // which is stronger than deleting the node before serializing.
    await page.evaluateOnNewDocument(() => {
      try {
        localStorage.setItem('interviewpie_analytics_consent', 'denied');
        localStorage.setItem('interviewpie_analytics_notice_ack', '1');
      } catch {
        // Private-mode style failures can't happen in our own Chromium, but a
        // throw here would abort the whole page script.
      }
    });

    const response = await page.goto(`${origin}${route}`, {
      waitUntil: 'networkidle0',
      timeout: ROUTE_TIMEOUT_MS,
    });
    if (!response || !response.ok()) {
      throw new Error(`HTTP ${response ? response.status() : 'no response'}`);
    }

    // Every public page renders exactly one <h1>. Waiting on it (rather than on
    // a timer) is what makes this deterministic: it proves the lazy route chunk
    // downloaded, React committed, and RouteSeo's effect has run.
    await page.waitForSelector('#root h1', { timeout: ROUTE_TIMEOUT_MS });

    const html = await page.evaluate(
      () => `<!doctype html>\n${document.documentElement.outerHTML}`,
    );

    if (html.includes(BANNER_GUARD_PHRASE)) {
      throw new Error(
        'consent-banner copy leaked into the snapshot — it would be served as '
          + "the page's search-result description",
      );
    }
    const title = await page.title();
    return { html, title };
  } finally {
    await page.close();
  }
}

async function main() {
  if (process.env.PRERENDER_SKIP === '1') {
    console.log('[prerender] PRERENDER_SKIP=1 — skipping.');
    return;
  }

  const routes = await routesFromSitemap();

  // Imported lazily so `PRERENDER_SKIP=1` works even where Chromium is absent.
  const { default: puppeteer } = await import('puppeteer');

  const server = await preview({
    root: ROOT,
    preview: { port: 4173, strictPort: false, open: false },
    logLevel: 'warn',
  });
  const origin = server.resolvedUrls.local[0].replace(/\/$/, '');

  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    // Snapshot everything before writing anything: a file written mid-run would
    // be served by the preview server to a later route, making the build's
    // output depend on route ordering.
    const results = [];
    for (const route of routes) {
      const { html, title } = await snapshot(browser, origin, route);
      results.push({ route, html });
      console.log(`[prerender] ${route.padEnd(34)} ${title}`);
    }

    for (const { route, html } of results) {
      const outputPath = outputPathFor(route);
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, html, 'utf8');
    }
    console.log(`[prerender] wrote ${results.length} pages.`);
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((error) => {
  // Loud, not soft. A silent skip leaves us believing the public pages are
  // indexable when they've quietly gone back to shipping an empty <div>.
  console.error(`[prerender] FAILED: ${error.message}`);
  process.exit(1);
});
