import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./index.css";
import { StorageProvider } from "./hooks/useStorageContext";
import { WorkspaceProvider } from "./hooks/useWorkspace.tsx";
import App from "./App";
import Root from "./Root";
import LikedQuestionsPage from "./app/liked/page";
import QuestionsPage from "./app/admin/questions/page";
import TagsPage from "./app/admin/tags/page";
import SettingsPage from "./app/settings/page";
import StylesPage from "./app/admin/styles/page";
import TonesPage from "./app/admin/tones/page";
import FeedbackPage from "./app/admin/feedback/page";
import UsersPage from "./app/admin/users/page";
import TopicsPage from "./app/admin/topics/page";
import HistoryPage from "./app/history/page";
import QuestionPage from "./app/question/page";
import DuplicatesPage from "./app/admin/duplicates/page";
import DuplicateHistoryPage from "./app/admin/duplicates/completed/page";
import PrunePage from "./app/admin/prune/page";
import PoolPage from "./app/admin/pool/page";
import AdminPage from "./app/admin/page";
import AdminLayout from "./app/admin/layout";
import AddQuestionPage from "./app/add-question/page";
import UnsubscribePage from "./app/unsubscribe/page";
import VerifySubscriptionPage from "./app/verify-subscription/page";
import SingleQuestionPage from "./pages/SingleQuestionPage";
import PrivacyPolicyPage from "./app/privacy/page";
import TermsOfServicePage from "./app/terms/page";
import DataRetentionPage from "./app/data-retention/page";
import CookiePolicyPage from "./app/cookies/page";
import AboutPage from "./app/about/page";
import ContactPage from "./app/contact/page";
import FeedbackButton from "./components/FeedbackButton";
import { AnalyticsManager } from "./components/AnalyticsManager";
import GeneratorPage from "./app/admin/generator/page.tsx";
import { Toaster } from "sonner";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);


createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <StorageProvider>
          <AnalyticsManager />
          <WorkspaceProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Root />} />
                <Route path="/app" element={<App />} />
                <Route path="/single" element={<SingleQuestionPage />} />
                <Route path="/question/:id" element={<QuestionPage />} />
                <Route path="/liked" element={<LikedQuestionsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/history" element={<HistoryPage />} />
                <Route path="/unsubscribe" element={<UnsubscribePage />} />
                <Route path="/verify-subscription" element={<VerifySubscriptionPage />} />
                <Route path="/add-question" element={<AddQuestionPage />} />
                <Route element={<AdminLayout />}>
                  <Route path="/admin" element={<AdminPage />} />
                  <Route path="/admin/questions" element={<QuestionsPage />} />
                  <Route path="/admin/tags" element={<TagsPage />} />
                  <Route path="/admin/topics" element={<TopicsPage />} />
                  <Route path="/admin/styles" element={<StylesPage />} />
                  <Route path="/admin/tones" element={<TonesPage />} />
                  <Route path="/admin/users" element={<UsersPage />} />
                  <Route path="/admin/feedback" element={<FeedbackPage />} />
                  <Route path="/admin/duplicates" element={<DuplicatesPage />} />
                  <Route path="/admin/duplicates/completed" element={<DuplicateHistoryPage />} />
                  <Route path="/admin/prune" element={<PrunePage />} />
                  <Route path="/admin/pool" element={<PoolPage />} />
                  <Route path="/admin/generator" element={<GeneratorPage />} />
                </Route>


                <Route path="/privacy" element={<PrivacyPolicyPage />} />
                <Route path="/terms" element={<TermsOfServicePage />} />
                <Route path="/data-retention" element={<DataRetentionPage />} />
                <Route path="/cookies" element={<CookiePolicyPage />} />
                <Route path="/about" element={<AboutPage />} />
                <Route path="/contact" element={<ContactPage />} />
              </Routes>
              <FeedbackButton />
              <Toaster position="bottom-left" richColors />
            </BrowserRouter>
          </WorkspaceProvider>
        </StorageProvider>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  </StrictMode>,
);
