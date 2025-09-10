import { BrowserRouter, Route, Routes } from "react-router-dom";
import HistoryPage from "./app/history/page";
import LikedPage from "./app/liked/page";
import SettingsPage from "./app/settings/page";
import MainPage from "./pages/MainPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainPage />} />
        <Route path="/liked" element={<LikedPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </BrowserRouter>
  );
}
