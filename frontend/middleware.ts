// Vercel Edge Middleware (framework-agnostic; runs in front of the static SPA).
//
// Sole job: surface the visitor's country to client JS so analytics can pick the
// right consent posture (EU strict opt-in vs. US/AU/NZ/SG notice + opt-out) BEFORE
// any gtag loads. Vercel's network injects `x-vercel-ip-country`; we copy it into a
// non-HttpOnly `ip_country` cookie that `src/lib/analytics.ts` reads. No IP is sent
// anywhere — the lookup is Vercel's, and only the 2-letter country code is exposed.
//
// Absent country (local dev, or Vercel couldn't resolve) → no cookie → analytics
// falls back to `strict` (fail-closed). Local dev uses `VITE_GA_FORCE_REGION` instead.
import { next } from '@vercel/edge';

export const config = {
  // Page navigations only — skip the /assets bundle and any file-with-extension
  // request so we don't pay a middleware invocation per static asset.
  matcher: '/((?!assets/|.*\\.).*)',
};

export default function middleware(request: Request): Response {
  const country = request.headers.get('x-vercel-ip-country') ?? '';
  const response = next();
  if (/^[A-Za-z]{2}$/.test(country)) {
    response.headers.append(
      'Set-Cookie',
      `ip_country=${country.toUpperCase()}; Path=/; Max-Age=86400; SameSite=Lax`,
    );
  }
  return response;
}
