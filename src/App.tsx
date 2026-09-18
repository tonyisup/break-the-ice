import { ErrorBoundary } from "./components/ErrorBoundary";
import InfiniteScrollPage from "./pages/InfiniteScrollPage";
import OfflineIndicator from "./components/OfflineIndicator";

export default function App() {

  return (
    <ErrorBoundary>
      <OfflineIndicator />
      <InfiniteScrollPage />
    </ErrorBoundary>
  );
}
