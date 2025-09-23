import { useStoreUserEffect } from "./hooks/useStoreUserEffect";
import MainPage from "./pages/MainPage";
import { SignIn } from "./SignIn";
import { useTheme } from "./hooks/useTheme";
import { ErrorBoundary } from "./components/ErrorBoundary";
import CookieConsentBanner from "./components/CookieConsentBanner";

export default function App() {
  const { isAuthenticated, isLoading } = useStoreUserEffect();

  const { theme } = useTheme();
  const gradient = ['#667EEA', '#764BA2'];
  const gradientTarget = theme === "dark" ? "#000" : "#fff";
  if (isLoading) {
    return (
      <div
        className="min-h-screen transition-colors overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${gradientTarget}, ${gradient[0]}, ${gradient[1]}, ${gradientTarget})`
        }}
      >
      </div>
    );
  }

 /* if (!isAuthenticated) {
    return <SignIn />;
  }*/

  return (
    <ErrorBoundary>
      <MainPage />
      <CookieConsentBanner />
    </ErrorBoundary>
  );
}
