import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import "./index.css";
import App from "./App";
import LikedQuestionsPage from "./app/liked/page";
import AdminPage from "./app/admin/page";
import QuestionsPage from "./app/admin/questions/page";
import TagsPage from "./app/admin/tags/page";
import ModelsPage from "./app/admin/models/page";
import SettingsPage from "./app/settings/page";
import StylesPage from "./app/admin/styles/page";
import TonesPage from "./app/admin/tones/page";
import HistoryPage from "./app/history/page";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);
const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  throw new Error("Missing Publishable Key");
}

function ClerkProviderWithRoutes() {
  const navigate = useNavigate();

  return (
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      navigate={(to) => navigate(to)}
    >
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/liked" element={<LikedQuestionsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/admin/questions" element={<QuestionsPage />} />
          <Route path="/admin/tags" element={<TagsPage />} />
          <Route path="/admin/models" element={<ModelsPage />} />
          <Route path="/admin/styles" element={<StylesPage />} />
          <Route path="/admin/tones" element={<TonesPage />} />
        </Routes>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ClerkProviderWithRoutes />
    </BrowserRouter>
  </StrictMode>
);
