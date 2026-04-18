import { Show } from '@clerk/react';

import OnboardingForm from './components/OnboardingForm';
import { useMe } from './hooks/useMe';
import Hero from './pages/Hero';
import Home from './pages/Home';

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

function App() {
  return (
    <>
      <Show when="signed-out">
        <Hero />
      </Show>
      <Show when="signed-in">
        <SignedInApp />
      </Show>
    </>
  );
}

export default App;
