import { Show } from '@clerk/react';
import { useState } from 'react';

import OnboardingForm from './components/OnboardingForm';
import PageMorphTransition from './components/PageMorphTransition';
import { useMe } from './hooks/useMe';
import { useMorphTransition } from './hooks/useMorphTransition';
import Hero from './pages/Hero';
import History from './pages/History';
import Home from './pages/Home';
import Personalize from './pages/Personalize';
import SessionDetail from './pages/SessionDetail';
import SignIn from './pages/SignIn';
import SignUp from './pages/SignUp';
import SsoCallback from './pages/SsoCallback';

type View = 'hero' | 'signin' | 'signup';
type SignedInView = 'home' | 'history' | 'session' | 'personalize';

function SignedInApp() {
  const { me, isReady, isLoading, refetch } = useMe();
  // Lightweight view state — the app uses Clerk's <Show> for auth gating
  // and component swaps for in-app navigation rather than a router. Keeps
  // the bundle small and matches the existing signed-out pattern.
  const [view, setView] = useState<SignedInView>('home');
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);

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

  const navigate = (next: 'home' | 'history' | 'personalize') => {
    setOpenSessionId(null);
    setView(next);
  };

  if (view === 'history') {
    return (
      <History
        onNavigate={navigate}
        onOpenSession={(id) => {
          setOpenSessionId(id);
          setView('session');
        }}
      />
    );
  }

  if (view === 'session' && openSessionId) {
    return (
      <SessionDetail
        sessionId={openSessionId}
        onBack={() => {
          setOpenSessionId(null);
          setView('history');
        }}
        onNavigate={navigate}
      />
    );
  }

  if (view === 'personalize') {
    return <Personalize onNavigate={navigate} />;
  }

  return (
    <Home
      onNavigateHistory={() => setView('history')}
      onNavigatePersonalize={() => setView('personalize')}
    />
  );
}

function SignedOutApp() {
  const [content, setContent] = useState<View>('hero');
  const { trigger, transitioning, transitionKey } = useMorphTransition();

  const swapTo = (next: View) => trigger(() => setContent(next));

  return (
    <>
      {content === 'hero' && <Hero onSignInClick={() => swapTo('signin')} />}
      {content === 'signin' && (
        <SignIn
          onBack={() => swapTo('hero')}
          onCreateAccount={() => swapTo('signup')}
        />
      )}
      {content === 'signup' && (
        <SignUp
          onBack={() => swapTo('hero')}
          onSignInClick={() => swapTo('signin')}
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
