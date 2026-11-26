import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { useAuth } from "@clerk/clerk-react";
import { ClerkProviderWithTheme } from "./components/ClerkProviderWithTheme";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import "@fontsource-variable/manrope/index.css";
import "./index.css";
import { StorageProvider } from "./hooks/useStorageContext";
import App from "./App";
import Root from "./Root";
import LikedQuestionsPage from "./app/liked/page";
import SettingsPage from "./app/settings/page";
import HistoryPage from "./app/history/page";
import QuestionPage from "./app/question/page";
import MyQuestionsPage from "./app/my-questions/page";
import UnsubscribePage from "./app/unsubscribe/page";
import VerifySubscriptionPage from "./app/verify-subscription/page";
import PrivacyPolicyPage from "./app/privacy/page";
import TermsOfServicePage from "./app/terms/page";
import DataRetentionPage from "./app/data-retention/page";
import CookiePolicyPage from "./app/cookies/page";
import AboutPage from "./app/about/page";
import ContactPage from "./app/contact/page";
import FeedbackButton from "./components/FeedbackButton";
import { AnalyticsManager } from "./components/AnalyticsManager";
import { Toaster } from "sonner";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ClerkSyncManager } from "./components/ClerkSyncManager";
import { RouteMetadata } from "./components/RouteMetadata";
import NotFoundPage from "./app/not-found/page";
import ThankYouPage from "./app/thank-you/page";
import CookieConsentBanner from "./components/CookieConsentBanner";

// Admin portal loads on demand so its code stays out of the public bundle.
const AdminApp = lazy(() => import("./admin/AdminApp"));

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

function AdminLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center" role="status">
      <div className="size-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      <span className="sr-only">Loading admin</span>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ClerkProviderWithTheme>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <StorageProvider>
          <BrowserRouter>
            <RouteMetadata />
            <AnalyticsManager />
            <ClerkSyncManager />
            <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Root />} />
              <Route path="/app" element={<App />} />
              <Route path="/question/:id" element={<QuestionPage />} />
              <Route path="/liked" element={<LikedQuestionsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/pricing" element={<Navigate to="/" replace />} />
              <Route path="/unsubscribe" element={<UnsubscribePage />} />
              <Route path="/verify-subscription" element={<VerifySubscriptionPage />} />
              <Route path="/my-questions" element={<MyQuestionsPage />} />
              <Route path="/add-question" element={<Navigate to="/my-questions" replace />} />
              <Route
                path="/admin/*"
                element={
                  <Suspense fallback={<AdminLoading />}>
                    <AdminApp />
                  </Suspense>
                }
              />


              <Route path="/privacy" element={<PrivacyPolicyPage />} />
              <Route path="/terms" element={<TermsOfServicePage />} />
              <Route path="/data-retention" element={<DataRetentionPage />} />
              <Route path="/cookies" element={<CookiePolicyPage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="/thank-you" element={<ThankYouPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
            </ErrorBoundary>
            <CookieConsentBanner />
            <FeedbackButton />
            <Toaster position="top-center" richColors offset={76} />
          </BrowserRouter>
        </StorageProvider>
      </ConvexProviderWithClerk>
    </ClerkProviderWithTheme>
  </StrictMode>,
);
