// import { useStoreUserEffect } from "./hooks/useStoreUserEffect";
// import MainPage from "./pages/MainPage";
// import { SignIn } from "./SignIn";
// import { useTheme } from "./hooks/useTheme";
import { ErrorBoundary } from "./components/ErrorBoundary";
import InfiniteScrollPage from "./pages/InfiniteScrollPage";

export default function App() {

  return (
    <ErrorBoundary>
      <InfiniteScrollPage />
    </ErrorBoundary>
  );
}
