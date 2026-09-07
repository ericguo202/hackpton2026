/**
 * Build-time prerenderer for the public marketing/legal pages.
 *
 * WHAT IT BUYS:
 * Vite emits a single `index.html` whose <body> is an empty `<div id="root">`.
 * Crawlers that don't execute JavaScript (Bing, Slack/LinkedIn/X unfurlers, and
 * most AI crawlers) therefore saw no content and no per-route metadata — every
 * URL served the homepage's title and description. This renders each public
 * route to HTML and writes it to its own file, with that route's real <head>.
 *
 * HOW (and what it replaced): a `renderToString` pass in plain Node over
 * `src/prerender/entry.tsx`, which mounts each page directly under
 * `StaticRouter`, bypassing the client-only app shell. This used to drive a
 * headless Chromium over a `vite preview` server. That failed on Vercel for a
 * structural reason: Vercel restores its build cache — covering `node_modules`
 * — BEFORE the install step, so `npm install` no-ops for puppeteer and its
 * postinstall never downloads Chrome, while the browser itself lives outside
 * the (non-configurable) cached path set. Warm cache meant puppeteer present,
 * browser absent, permanently. Node-side rendering has no browser, no system
 * libraries and no cache interaction — and runs in ~2s instead of ~29s.
 *
 * Because `main.tsx` uses `createRoot()` (not `hydrateRoot()`), React clears
 * `#root` on mount and re-renders from scratch. The prerendered markup is a
 * crawler-only artifact — there is no hydration-mismatch surface to worry about.
 * Do not "optimize" that to `hydrateRoot` without understanding the trade.
 *
 * Runs as the final step of `npm run build`.
 *
 * PRERENDER_SKIP=1 degrades to METADATA-ONLY: per-route <head> tags are still
 * written, bodies are not. A future breakage then costs body text rather than
 * everything. Its one limit: it still builds the SSR bundle, because the
 * metadata is read from it — that is the price of `lib/routeMetadata.ts` being a
 * single source of truth shared with `RouteSeo.tsx`. If the bundle itself won't
 * build, the deploy fails, which is the correct outcome.
 */

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { build } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const SSR_OUT = path.join(ROOT, 'dist-ssr');
const SSR_ENTRY = path.join(ROOT, 'src', 'prerender', 'entry.tsx');
const CLERK_STUB = path.join(ROOT, 'src', 'prerender', 'clerk-stub.tsx');
const SSR_BUNDLE = path.join(SSR_OUT, 'entry.mjs');

const METADATA_ONLY = process.env.PRERENDER_SKIP === '1';

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

/**
 * Bundles `src/prerender/entry.tsx` for Node.
 *
 * The `@clerk/react` alias is passed INLINE here and deliberately never written
 * into `vite.config.ts`, so it applies to this pass only and cannot leak into
 * the client build. Vite merges inline config over the config file with
 * `mergeConfig`, which merges object-form aliases key-by-key — so the `'@'`
 * alias declared in `vite.config.ts` survives alongside this one.
 */
async function buildSsrBundle() {
  await rm(SSR_OUT, { recursive: true, force: true });
  await build({
    root: ROOT,
    logLevel: 'warn',
    resolve: { alias: { '@clerk/react': CLERK_STUB } },
    build: {
      ssr: SSR_ENTRY,
      outDir: SSR_OUT,
      emptyOutDir: true,
      minify: false,
      rollupOptions: { output: { entryFileNames: 'entry.mjs' } },
    },
  });
  return import(new URL(`file://${SSR_BUNDLE.split(path.sep).join('/')}`).href);
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Replaces a single <head> tag, asserting it matched EXACTLY once.
 *
 * The assertion is the point. A silent no-match would leave the template's
 * homepage title/description on every route — which is precisely the bug this
 * script exists to fix, and it would ship green.
 */
function replaceOnce(html, pattern, replacement, label, route) {
  const matches = html.match(pattern);
  if (!matches || matches.length !== 1) {
    throw new Error(
      `${route}: expected exactly 1 "${label}" tag in dist/index.html, found `
        + `${matches ? matches.length : 0}. The template changed — update the `
        + 'matcher in scripts/prerender.mjs.',
    );
  }
  return html.replace(pattern, () => replacement);
}

/** Writes one route's metadata into a copy of the built index.html template. */
function injectHead(template, route, meta) {
  const title = escapeHtml(meta.title);
  const description = escapeHtml(meta.description);
  const ogUrl = escapeHtml(meta.ogUrl);

  // Mirrors exactly the tag set RouteSeo.tsx writes at runtime. Change one,
  // change the other.
  const edits = [
    ['title', /<title>[\s\S]*?<\/title>/g, `<title>${title}</title>`],
    [
      'meta[name=description]',
      /<meta\s[^>]*name="description"[^>]*>/g,
      `<meta name="description" content="${description}" />`,
    ],
    [
      'meta[name=robots]',
      /<meta\s[^>]*name="robots"[^>]*>/g,
      `<meta name="robots" content="${escapeHtml(meta.robots)}" />`,
    ],
    [
      'meta[property=og:title]',
      /<meta\s[^>]*property="og:title"[^>]*>/g,
      `<meta property="og:title" content="${title}" />`,
    ],
    [
      'meta[property=og:description]',
      /<meta\s[^>]*property="og:description"[^>]*>/g,
      `<meta property="og:description" content="${description}" />`,
    ],
    [
      'meta[property=og:url]',
      /<meta\s[^>]*property="og:url"[^>]*>/g,
      `<meta property="og:url" content="${ogUrl}" />`,
    ],
    [
      'meta[name=twitter:title]',
      /<meta\s[^>]*name="twitter:title"[^>]*>/g,
      `<meta name="twitter:title" content="${title}" />`,
    ],
    [
      'meta[name=twitter:description]',
      /<meta\s[^>]*name="twitter:description"[^>]*>/g,
      `<meta name="twitter:description" content="${description}" />`,
    ],
  ];

  let html = template;
  for (const [label, pattern, replacement] of edits) {
    html = replaceOnce(html, pattern, replacement, label, route);
  }

  // Canonical is the one tag that can legitimately be absent (account-only
  // routes have none), so it is handled outside the exactly-once set. Every
  // route we prerender comes from the sitemap and is therefore public.
  const canonicalTag = `<link rel="canonical" href="${escapeHtml(
    meta.canonical ?? meta.ogUrl,
  )}" />`;
  html = replaceOnce(
    html,
    /<link\s[^>]*rel="canonical"[^>]*>/g,
    canonicalTag,
    'link[rel=canonical]',
    route,
  );

  return html;
}

/** Drops the rendered page HTML into the empty `<div id="root">`. */
function injectBody(html, body, route) {
  return replaceOnce(
    html,
    /<div id="root"><\/div>/g,
    `<div id="root">${body}</div>`,
    'div#root',
    route,
  );
}

/**
 * The template MUST be the untouched shell vite emitted.
 *
 * `/` is written back to `dist/index.html`, so a second run over the same dist/
 * would otherwise read an already-rendered page as its template and stamp the
 * HOMEPAGE's body onto every route. The full path happens to catch that (its
 * `div#root` replacement finds no match and throws), but metadata-only mode has
 * no body step and would ship the wrong copy silently — so assert it up front,
 * for both modes.
 */
function assertPristineTemplate(html) {
  if ((html.match(/<div id="root"><\/div>/g) || []).length === 1) return;
  throw new Error(
    'dist/index.html is not a pristine build shell — its <div id="root"> is '
      + 'already filled in, so it has been prerendered before.\n'
      + '  → Re-run `vite build` (or `npm run build`) before prerendering; this '
      + 'script needs the empty shell as its template.',
  );
}

async function main() {
  const routes = await routesFromSitemap();

  // Read the template BEFORE anything is written: `/` overwrites
  // dist/index.html, so reading it later would pick up an already-rendered page.
  const template = await readFile(path.join(DIST, 'index.html'), 'utf8');
  assertPristineTemplate(template);

  const { PRERENDER_PAGES, renderRoute, resolveRouteMetadata } =
    await buildSsrBundle();

  // Fail loud on drift. Adding a public page means touching sitemap.xml,
  // lib/routeMetadata.ts AND entry.tsx's page map; nothing else in the codebase
  // notices when one of the three is missed.
  const missing = routes.flatMap((route) => {
    const problems = [];
    if (!resolveRouteMetadata(route).isPublic) {
      problems.push(`${route} → no entry in src/lib/routeMetadata.ts`);
    }
    if (!PRERENDER_PAGES[route]) {
      problems.push(`${route} → no entry in src/prerender/entry.tsx`);
    }
    return problems;
  });
  if (missing.length > 0) {
    throw new Error(
      `sitemap.xml lists routes the prerenderer can't render:\n  ${missing.join(
        '\n  ',
      )}`,
    );
  }

  // Render everything before writing anything, so a failure halfway through
  // leaves dist/ untouched rather than half-updated.
  const results = routes.map((route) => {
    const meta = resolveRouteMetadata(route);
    let html = injectHead(template, route, meta);
    let words = 0;
    if (!METADATA_ONLY) {
      const body = renderRoute(route);
      html = injectBody(html, body, route);
      words = body.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length;
    }
    return { route, html, title: meta.title, words };
  });

  for (const { route, html } of results) {
    const outputPath = outputPathFor(route);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, html, 'utf8');
  }

  for (const { route, title, words } of results) {
    const size = METADATA_ONLY ? 'metadata only' : `${words} words`;
    console.log(`[prerender] ${route.padEnd(34)} ${size.padEnd(14)} ${title}`);
  }
  console.log(
    `[prerender] wrote ${results.length} pages`
      + `${METADATA_ONLY ? ' (PRERENDER_SKIP=1 — no body copy)' : ''}.`,
  );
}

main().catch((error) => {
  // Loud, not soft. A silent skip leaves us believing the public pages are
  // indexable when they've quietly gone back to shipping an empty <div>.
  console.error(`[prerender] FAILED: ${error.message}`);
  process.exit(1);
});
