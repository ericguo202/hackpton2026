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

// Light palette — the original values, kept verbatim.
const lightVariables = {
  colorPrimary: '#17150f',
  colorBackground: '#f4f0e7',
  colorForeground: '#17150f',
  colorMuted: '#ccc19e',
  colorMutedForeground: '#585342',
  colorNeutral: '#17150f',
  colorInputBackground: '#F1E9D2',
  colorInputForeground: '#17150f',
  colorBorder: '#ccc19e',
  colorShimmer: 'rgba(23, 21, 15, 0.06)',
}

// Dark palette — mirrors the espresso tokens in index.css (html.dark).
const darkVariables = {
  colorPrimary: '#E3D6B0',         // accent (cream); Clerk auto-contrasts text
  colorBackground: '#211E17',      // surface-raised
  colorForeground: '#ECE3CD',      // text
  colorMuted: '#2A2620',
  colorMutedForeground: '#B3A988', // text-muted
  colorNeutral: '#ECE3CD',         // neutral shades generated from light ink
  colorInputBackground: '#16140F', // surface
  colorInputForeground: '#ECE3CD',
  colorBorder: '#3A352A',
  colorShimmer: 'rgba(236, 227, 205, 0.08)',
}

// Token-class overrides — these resolve per-theme on their own, so they're
// shared across light/dark.
const elements = {
  userButtonPopoverFooter: 'hidden',
  userButtonPopoverCard:
    'border border-border shadow-[0_12px_40px_-12px_rgba(23,21,15,0.18)]',
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
