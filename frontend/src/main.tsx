import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import { ClerkProvider } from '@clerk/react';
import App from './App.tsx'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!PUBLISHABLE_KEY) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in environment')
}

const clerkAppearance = {
  variables: {
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
    borderRadius: '12px',
    fontFamily:
      '"Geist", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    fontFamilyButtons:
      '"Geist", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    fontSize: '0.875rem',
  },
  elements: {
    userButtonPopoverFooter: 'hidden',
    userButtonPopoverCard:
      'border border-border shadow-[0_12px_40px_-12px_rgba(23,21,15,0.18)]',
    userButtonAvatarBox: 'ring-1 ring-border-strong',
    userButtonPopoverActionButton: 'hover:bg-surface-sunken',
  },
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      afterSignOutUrl="/"
      appearance={clerkAppearance}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ClerkProvider>
  </StrictMode>,
)
