// import { useStoreUserEffect } from "./hooks/useStoreUserEffect";
// import MainPage from "./pages/MainPage";
// import { SignIn } from "./SignIn";
// import { useTheme } from "./hooks/useTheme";
import { ErrorBoundary } from "./components/ErrorBoundary";
import CookieConsentBanner from "./components/CookieConsentBanner";
import InfiniteScrollPage from "./pages/InfiniteScrollPage";
import OfflineIndicator from "./components/OfflineIndicator";
import { ClerkSyncManager } from "./components/ClerkSyncManager";

export default function App() {

  return (
    <ErrorBoundary>
      <ClerkSyncManager />
      <OfflineIndicator />
      <InfiniteScrollPage />
      <CookieConsentBanner />
    </ErrorBoundary>
  );
}
