import { useStoreUserEffect } from "./hooks/useStoreUserEffect";
import MainPage from "./pages/MainPage";
import { SignIn } from "./SignIn";

export default function App() {
  const { isAuthenticated, isLoading } = useStoreUserEffect();

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
        <div className="loader ease-linear rounded-full border-8 border-t-8 border-gray-200 h-32 w-32"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <SignIn />;
  }

  return <MainPage />;
}
