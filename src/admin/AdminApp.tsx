// The admin portal. main.tsx loads this module with React.lazy, so admin code
// ships in its own chunk and never reaches the public bundle. Code outside
// src/admin must not import from here (see src/admin/boundary.test.ts).
import { Route, Routes } from "react-router-dom";
import NotFoundPage from "@/app/not-found/page";
import AdminLayout from "./layout";
import AdminPage from "./pages/page";
import QuestionsPage from "./pages/questions/page";
import QuestionDetailsPage from "./pages/questions/[questionId]/page";
import TagsPage from "./pages/tags/page";
import TopicsPage from "./pages/topics/page";
import StylesPage from "./pages/styles/page";
import TonesPage from "./pages/tones/page";
import UsersPage from "./pages/users/page";
import UserDetailsPage from "./pages/users/[userId]/page";
import NewsletterPage from "./pages/newsletter/page";
import FeedbackPage from "./pages/feedback/page";
import DuplicatesPage from "./pages/duplicates/page";
import DuplicateHistoryPage from "./pages/duplicates/completed/page";
import PrunePage from "./pages/prune/page";
import PruneSettingsPage from "./pages/prune/settings/page";
import PoolPage from "./pages/pool/page";
import GeneratorPage from "./pages/generator/page";
import "./admin.css";

// Mounted at /admin/*, so these paths are relative to /admin.
export default function AdminApp() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<AdminPage />} />
        <Route path="questions" element={<QuestionsPage />} />
        <Route path="questions/:questionId" element={<QuestionDetailsPage />} />
        <Route path="tags" element={<TagsPage />} />
        <Route path="topics" element={<TopicsPage />} />
        <Route path="styles" element={<StylesPage />} />
        <Route path="tones" element={<TonesPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="users/:userId" element={<UserDetailsPage />} />
        <Route path="newsletter" element={<NewsletterPage />} />
        <Route path="feedback" element={<FeedbackPage />} />
        <Route path="duplicates" element={<DuplicatesPage />} />
        <Route path="duplicates/completed" element={<DuplicateHistoryPage />} />
        <Route path="prune" element={<PrunePage />} />
        <Route path="prune/settings" element={<PruneSettingsPage />} />
        <Route path="pool" element={<PoolPage />} />
        <Route path="generator" element={<GeneratorPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
