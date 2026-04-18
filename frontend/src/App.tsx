import './App.css'
import { Show, UserButton } from '@clerk/react'
import SignInPage from "./pages/SignInPage";

function App() {
  return (
    <>
      <Show when="signed-out">
        <SignInPage />
      </Show>
      <Show when="signed-in">
        <div className="p-4">
          <UserButton />
          <h1 className="text-3xl font-bold">Signed in</h1>
        </div>
      </Show>
    </>
  )
}

export default App;
