// import { useStoreUserEffect } from "./hooks/useStoreUserEffect";
import MainPage from "./pages/MainPage";
// import { SignIn } from "./SignIn";
import { useTheme } from "./hooks/useTheme";
import { ErrorBoundary } from "./components/ErrorBoundary";
import CookieConsentBanner from "./components/CookieConsentBanner";

export default function App() {
  // const { isAuthenticated, isLoading } = useStoreUserEffect();

  // const { effectiveTheme } = useTheme();
  // const gradientLight = ["#667EEA", "#A064DE"];
  // const gradient = ["#3B2554", "#262D54"];
  // if (isLoading) {
    // return (
    //   <div
    //     className="min-h-screen transition-colors overflow-hidden"
    //     style={{
    //     background: `linear-gradient(135deg, ${effectiveTheme === "dark" ? gradient[0] : gradientLight[0]}, ${effectiveTheme === "dark" ? gradient[1] : gradientLight[1]}, ${effectiveTheme === "dark" ? "#000" : "#fff"})`
    //     }}
    //   >
    //   </div>
    // );
  // }

  // if (!isAuthenticated) {
  //   return <SignIn />;
  // }

  return (
    <ErrorBoundary>
      <MainPage />
      <CookieConsentBanner  />
    </ErrorBoundary>
  );
}
