import './App.css'
import { Show, UserButton } from '@clerk/react'
import SignInPage from "./pages/SignInPage";
import MePing from "./components/MePing";
import OnboardingForm from "./components/OnboardingForm";
import { useMe } from "./hooks/useMe";

function SignedInApp() {
  const { me, isReady, isLoading, refetch } = useMe();

  if (!isReady || isLoading) {
    return <div className="p-4 text-sm text-gray-500">Loading…</div>;
  }

  if (me && !me.completed_registration) {
    return <OnboardingForm onDone={refetch} />;
  }

  return (
    <div className="p-4 space-y-4">
      <UserButton />
      <h1 className="text-3xl font-bold">Signed in</h1>
      <MePing />
    </div>
  );
}

function App() {
  return (
    <>
      <Show when="signed-out">
        <SignInPage />
      </Show>
      <Show when="signed-in">
        <SignedInApp />
      </Show>
    </>
  )
}

export default App;
