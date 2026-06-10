import { Show } from '@clerk/react';
import { Navigate, Route, Routes } from 'react-router';

import BetaFeedbackGate from './components/BetaFeedbackGate';
import BetaFeedbackLauncher from './components/BetaFeedbackLauncher';
import EmailConflictNotice from './components/EmailConflictNotice';
import OnboardingForm from './components/OnboardingForm';
import {
  RedirectIfOnboarded,
  RequireAuth,
  RequireOnboarded,
} from './components/route-guards';
import { useMe } from './hooks/useMe';
import Hero from './pages/Hero';
import History from './pages/History';
import Home from './pages/Home';
import Calibration from './pages/Calibration';
import Personalize from './pages/Personalize';
import Practice from './pages/Practice';
import SavedQuestionDetail from './pages/SavedQuestionDetail';
import SessionDetail from './pages/SessionDetail';
import SignIn from './pages/SignIn';
import SignUp from './pages/SignUp';
import SsoCallback from './pages/SsoCallback';

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
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <p className="text-eyebrow uppercase tracking-eyebrow text-text-muted">
          Loading
        </p>
      </div>
    );
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
      <Routes>
      <Route path="/" element={<HomeRoute />} />
      <Route path="/sso-callback" element={<SsoCallback />} />

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
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BetaFeedbackGate />
      <BetaFeedbackLauncher />
    </>
  );
}

export default App;
