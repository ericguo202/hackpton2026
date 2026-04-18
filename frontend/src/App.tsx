import { Show } from '@clerk/react';
import { useState } from 'react';

import OnboardingForm from './components/OnboardingForm';
import PageMorphTransition from './components/PageMorphTransition';
import { useMe } from './hooks/useMe';
import Hero from './pages/Hero';
import Home from './pages/Home';
import SignIn from './pages/SignIn';
import SignUp from './pages/SignUp';
import SsoCallback from './pages/SsoCallback';

type View = 'hero' | 'signin' | 'signup';
const TRANSITION_MS = 900;
const SWAP_AT_MS = 450;

function SignedInApp() {
  const { me, isReady, isLoading, refetch } = useMe();

  if (!isReady || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <p className="text-eyebrow uppercase tracking-eyebrow text-text-muted">
          Loading
        </p>
      </div>
    );
  }

  if (me && !me.completed_registration) {
    return <OnboardingForm onDone={refetch} />;
  }

  return <Home />;
}

function SignedOutApp() {
  const [content, setContent] = useState<View>('hero');
  const [transitioning, setTransitioning] = useState(false);
  const [transitionKey, setTransitionKey] = useState(0);

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const trigger = (next: View) => {
    if (transitioning) return;
    if (prefersReducedMotion) {
      setContent(next);
      return;
    }
    setTransitioning(true);
    setTransitionKey((k) => k + 1);
    window.setTimeout(() => setContent(next), SWAP_AT_MS);
    window.setTimeout(() => setTransitioning(false), TRANSITION_MS);
  };

  return (
    <>
      {content === 'hero' && <Hero onSignInClick={() => trigger('signin')} />}
      {content === 'signin' && (
        <SignIn
          onBack={() => trigger('hero')}
          onCreateAccount={() => trigger('signup')}
        />
      )}
      {content === 'signup' && (
        <SignUp
          onBack={() => trigger('hero')}
          onSignInClick={() => trigger('signin')}
        />
      )}
      {transitioning && <PageMorphTransition key={transitionKey} />}
    </>
  );
}

function App() {
  if (typeof window !== 'undefined' && window.location.pathname === '/sso-callback') {
    return <SsoCallback />;
  }

  return (
    <>
      <Show when="signed-out">
        <SignedOutApp />
      </Show>
      <Show when="signed-in">
        <SignedInApp />
      </Show>
    </>
  );
}

export default App;
