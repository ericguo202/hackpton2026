import { Show } from '@clerk/react';
import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router';

import AnalyticsConsentBanner from './components/AnalyticsConsentBanner';
import AnalyticsProvider from './components/AnalyticsProvider';
import BetaFeedbackGate from './components/BetaFeedbackGate';
import BetaFeedbackLauncher from './components/BetaFeedbackLauncher';
import EmailConflictNotice from './components/EmailConflictNotice';
import PolicyAcceptanceGate from './components/PolicyAcceptanceGate';
import {
  RedirectIfOnboarded,
  RequireAuth,
  RequireOnboarded,
} from './components/route-guards';
import { useMe } from './hooks/useMe';

// Route pages are lazy-loaded so route-specific heavy deps (recharts, MediaPipe,
// the dither shader) split into per-route async chunks instead of the main bundle.
const OnboardingForm = lazy(() => import('./components/OnboardingForm'));
const BiometricDataRetentionPolicy = lazy(
  () => import('./pages/BiometricDataRetentionPolicy'),
);
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const TermsOfService = lazy(() => import('./pages/TermsOfService'));
const Hero = lazy(() => import('./pages/Hero'));
const History = lazy(() => import('./pages/History'));
const Home = lazy(() => import('./pages/Home'));
const Calibration = lazy(() => import('./pages/Calibration'));
const Personalize = lazy(() => import('./pages/Personalize'));
const Practice = lazy(() => import('./pages/Practice'));
const SavedQuestionDetail = lazy(() => import('./pages/SavedQuestionDetail'));
const Settings = lazy(() => import('./pages/Settings'));
const SessionDetail = lazy(() => import('./pages/SessionDetail'));
const SignIn = lazy(() => import('./pages/SignIn'));
const SignUp = lazy(() => import('./pages/SignUp'));
const SsoCallback = lazy(() => import('./pages/SsoCallback'));

/** Centered loading screen shared by the route Suspense boundary and SignedInHome. */
function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <p className="text-eyebrow uppercase tracking-eyebrow text-text-muted">
        Loading
      </p>
    </div>
  );
}

/**
 * `/` is the only auth-bivalent route: signed-out users see the Hero,
 * signed-in users see the Setup form (Home). A half-onboarded user is
 * bounced to /onboarding so they can never reach Home with an empty
 * profile.
 */
function HomeRoute() {
  return (
    <>
      <Show when="signed-out">
        <Hero />
      </Show>
      <Show when="signed-in">
        <SignedInHome />
      </Show>
    </>
  );
}

function SignedInHome() {
  const { me, isReady, isLoading } = useMe();
  if (!isReady || isLoading || !me) {
    return <RouteFallback />;
  }
  // Email already claimed by another account — block before onboarding so the
  // user never fills out the form only to hit a 409 at submit.
  if (me.email_conflict) return <EmailConflictNotice />;
  if (!me.completed_registration) return <Navigate to="/onboarding" replace />;
  return <Home />;
}

function App() {
  return (
    <>
      <AnalyticsProvider />
      <Suspense fallback={<RouteFallback />}>
      <Routes>
      <Route path="/" element={<HomeRoute />} />
      <Route path="/sso-callback" element={<SsoCallback />} />
      <Route
        path="/legal/biometric-data-retention"
        element={<BiometricDataRetentionPolicy />}
      />
      <Route path="/legal/privacy" element={<PrivacyPolicy />} />
      <Route path="/legal/terms" element={<TermsOfService />} />

      <Route element={<RedirectIfOnboarded />}>
        <Route path="/sign-in" element={<SignIn />} />
        <Route path="/sign-up" element={<SignUp />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route element={<RedirectIfOnboarded />}>
          <Route path="/onboarding" element={<OnboardingForm />} />
        </Route>
        <Route path="/calibrate" element={<Calibration />} />
        <Route element={<RequireOnboarded />}>
          <Route path="/practice" element={<Practice />} />
          <Route path="/history" element={<History />} />
          <Route path="/sessions/:id" element={<SessionDetail />} />
          <Route path="/saved-question/:id" element={<SavedQuestionDetail />} />
          <Route path="/personalize" element={<Personalize />} />
          {/* Clerk <UserProfile routing="hash"> keeps the path at /settings and
              drives its subnav via the URL hash, so no splat is needed. */}
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
      <PolicyAcceptanceGate />
      <BetaFeedbackGate />
      <BetaFeedbackLauncher />
      <AnalyticsConsentBanner />
    </>
  );
}

export default App;
