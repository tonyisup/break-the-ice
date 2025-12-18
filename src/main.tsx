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
import ModelsPage from "./app/admin/models/page";
import SettingsPage from "./app/settings/page";
import StylesPage from "./app/admin/styles/page";
import TonesPage from "./app/admin/tones/page";
import HistoryPage from "./app/history/page";
import QuestionPage from "./app/question/page";
import DuplicatesPage from "./app/admin/duplicates/page";
import IndividualQuestionPage from "./app/admin/questions/[id]/page";
import DuplicateDetectionCompletedPage from "./app/admin/duplicates/completed/page";
import AdminPage from "./app/admin/page";
import AddQuestionPage from "./app/add-question/page";
import SingleQuestionPage from "./pages/SingleQuestionPage";
import PrivacyPolicyPage from "./app/privacy/page";
import TermsOfServicePage from "./app/terms/page";
import DataRetentionPage from "./app/data-retention/page";
import CookiePolicyPage from "./app/cookies/page";
import AboutPage from "./app/about/page";
import ContactPage from "./app/contact/page";
import FeedbackButton from "./components/FeedbackButton";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <StorageProvider>
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
                <Route path="/add-question" element={<AddQuestionPage />} />
                <Route path="/admin" element={<AdminPage />} />
                <Route path="/admin/questions" element={<QuestionsPage />} />
                <Route path="/admin/tags" element={<TagsPage />} />
                <Route path="/admin/models" element={<ModelsPage />} />
                <Route path="/admin/styles" element={<StylesPage />} />
                <Route path="/admin/tones" element={<TonesPage />} />
                <Route path="/admin/duplicates" element={<DuplicatesPage />} />
                <Route path="/admin/duplicates/completed" element={<DuplicateDetectionCompletedPage />} />
                <Route path="/admin/questions/:id" element={<IndividualQuestionPage />} />
                {/* <Route path="/admin/prune" element={<PrunePage />} /> */}
                <Route path="/privacy" element={<PrivacyPolicyPage />} />
                <Route path="/terms" element={<TermsOfServicePage />} />
                <Route path="/data-retention" element={<DataRetentionPage />} />
                <Route path="/cookies" element={<CookiePolicyPage />} />
                <Route path="/about" element={<AboutPage />} />
                <Route path="/contact" element={<ContactPage />} />
              </Routes>
              <FeedbackButton />
            </BrowserRouter>
          </WorkspaceProvider>
        </StorageProvider>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  </StrictMode>,
);
