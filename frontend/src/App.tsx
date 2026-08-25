import { Show } from '@clerk/react';
import { Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router';

import AnalyticsConsentBanner from './components/AnalyticsConsentBanner';
import AnalyticsProvider from './components/AnalyticsProvider';
import BetaFeedbackGate from './components/BetaFeedbackGate';
import BetaFeedbackLauncher from './components/BetaFeedbackLauncher';
import EmailConflictNotice from './components/EmailConflictNotice';
import PolicyAcceptanceGate from './components/PolicyAcceptanceGate';
import RouteSeo from './components/RouteSeo';
import RouteErrorBoundary from './components/RouteErrorBoundary';
import {
  RedirectIfOnboarded,
  RequireAuth,
  RequireOnboarded,
} from './components/route-guards';
import { useMe } from './hooks/useMe';
import { lazyWithRetry } from './lib/lazyWithRetry';

// Route pages are lazy-loaded so route-specific heavy deps (recharts, MediaPipe,
// the dither shader) split into per-route async chunks instead of the main
// bundle. `lazyWithRetry` hardens each import against a failed chunk download
// (transient blip → silent retry; stale filename after a deploy → one reload)
// so a code-split page can never blank-screen the app.
const OnboardingForm = lazyWithRetry(
  () => import('./components/OnboardingForm'),
  'OnboardingForm',
);
const BiometricDataRetentionPolicy = lazyWithRetry(
  () => import('./pages/BiometricDataRetentionPolicy'),
  'BiometricDataRetentionPolicy',
);
const PrivacyPolicy = lazyWithRetry(
  () => import('./pages/PrivacyPolicy'),
  'PrivacyPolicy',
);
const TermsOfService = lazyWithRetry(
  () => import('./pages/TermsOfService'),
  'TermsOfService',
);
const Hero = lazyWithRetry(() => import('./pages/Hero'), 'Hero');
const History = lazyWithRetry(() => import('./pages/History'), 'History');
const Home = lazyWithRetry(() => import('./pages/Home'), 'Home');
const Calibration = lazyWithRetry(
  () => import('./pages/Calibration'),
  'Calibration',
);
const DeliveryPlayground = lazyWithRetry(
  () => import('./pages/DeliveryPlayground'),
  'DeliveryPlayground',
);
const Personalize = lazyWithRetry(
  () => import('./pages/Personalize'),
  'Personalize',
);
const Practice = lazyWithRetry(() => import('./pages/Practice'), 'Practice');
const Pricing = lazyWithRetry(() => import('./pages/Pricing'), 'Pricing');
const SavedQuestionDetail = lazyWithRetry(
  () => import('./pages/SavedQuestionDetail'),
  'SavedQuestionDetail',
);
const Scoring = lazyWithRetry(() => import('./pages/Scoring'), 'Scoring');
const Settings = lazyWithRetry(() => import('./pages/Settings'), 'Settings');
const SessionDetail = lazyWithRetry(
  () => import('./pages/SessionDetail'),
  'SessionDetail',
);
const SignIn = lazyWithRetry(() => import('./pages/SignIn'), 'SignIn');
const SignUp = lazyWithRetry(() => import('./pages/SignUp'), 'SignUp');
const SsoCallback = lazyWithRetry(
  () => import('./pages/SsoCallback'),
  'SsoCallback',
);

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
      <RouteSeo />
      <AnalyticsProvider />
      <RouteErrorBoundary>
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
      {/* Public like the legal pages: it's the "how we grade you" transparency
          page, linked from the signed-out footer, so a visitor weighing our
          methodology can read it before making an account. Static prose — no
          user data, nothing to gate. */}
      <Route path="/scoring" element={<Scoring />} />
      {/* Also public: what the free plan gets you, which is exactly the
          question a signed-out visitor is weighing. Static prose + shared cap
          constants — no user data, nothing to gate. */}
      <Route path="/pricing" element={<Pricing />} />

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
          <Route path="/delivery-playground" element={<DeliveryPlayground />} />
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
      </RouteErrorBoundary>
      <PolicyAcceptanceGate />
      <BetaFeedbackGate />
      <BetaFeedbackLauncher />
      <AnalyticsConsentBanner />
    </>
  );
}

export default App;
