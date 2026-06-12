/**
 * App root: wraps ClerkProvider so the Clerk `appearance` can track the app
 * theme. `useTheme()` reads the `html.dark` class (set pre-paint by index.html)
 * via useSyncExternalStore, so this re-renders on toggle and Clerk re-themes
 * its mounted widgets (the UserButton popover + avatar + the SignUp CAPTCHA).
 *
 * Lives in its own file (not main.tsx) so the entry file keeps zero component
 * exports — react-refresh/only-export-components requires component files to
 * export their components.
 */

import { BrowserRouter } from 'react-router'
import { ClerkProvider } from '@clerk/react'
import App from './App.tsx'
import { useTheme } from './hooks/useTheme'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!PUBLISHABLE_KEY) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in environment')
}

// Theme-independent appearance bits.
const baseVariables = {
  borderRadius: '12px',
  fontFamily:
    '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  fontFamilyButtons:
    '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  fontSize: '0.875rem',
}

// Light palette — DESIGN.md vanilla/ink/cherry. Clerk popovers are raised
// surfaces, so the background is card white over the vanilla page.
const lightVariables = {
  colorPrimary: '#C41E3A',         // cherry; Clerk auto-contrasts to white text
  colorBackground: '#FFFFFF',      // surface-raised (card white)
  colorForeground: '#271812',      // ink
  colorMuted: '#F6EDE2',           // sunken
  colorMutedForeground: '#6E5D50', // ink-muted
  colorNeutral: '#271812',
  colorInputBackground: '#F6EDE2', // sunken
  colorInputForeground: '#271812',
  colorBorder: '#E8DCCB',          // border-warm
  colorShimmer: 'rgba(39, 24, 18, 0.06)',
}

// Dark palette — mirrors the black-cherry tokens in index.css (html.dark).
// Accent-level color uses cherry-glaze (the dark-mode accent text tone);
// raw cherry sits too close to the black-cherry surface for link text.
const darkVariables = {
  colorPrimary: '#F2697C',         // cherry-glaze; Clerk auto-contrasts text
  colorBackground: '#271A1C',      // surface-raised
  colorForeground: '#F5EADF',      // cream text
  colorMuted: '#1C1214',           // surface
  colorMutedForeground: '#C7B2A8', // cream text-muted
  colorNeutral: '#F5EADF',         // neutral shades generated from cream
  colorInputBackground: '#150D0F', // sunken
  colorInputForeground: '#F5EADF',
  colorBorder: '#3E2F30',
  colorShimmer: 'rgba(245, 234, 223, 0.08)',
}

// Token-class overrides — these resolve per-theme on their own, so they're
// shared across light/dark. Elevation is border-only (the No-Shadow Rule).
const elements = {
  userButtonPopoverFooter: 'hidden',
  userButtonPopoverCard: 'border border-border shadow-none',
  userButtonAvatarBox: 'ring-1 ring-border-strong',
  userButtonPopoverActionButton: 'hover:bg-surface-sunken',
}

export default function Root() {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const appearance = {
    variables: { ...baseVariables, ...(isDark ? darkVariables : lightVariables) },
    captcha: { theme: isDark ? ('dark' as const) : ('light' as const) },
    elements,
  }

  return (
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      afterSignOutUrl="/"
      // Point Clerk at our OWN custom auth pages. Without these, Clerk falls
      // back to its hosted Account Portal (accounts.dev) whenever a flow can't
      // complete on the current page — e.g. a Google OAuth sign-up blocked by
      // the Allowlist beta gate, which otherwise transports the user off our
      // UI entirely. With these set, that fallback stays on our domain and the
      // error surfaces on our /sign-up.
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      appearance={appearance}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ClerkProvider>
  )
}
