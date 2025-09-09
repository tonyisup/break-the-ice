import { useState } from "react";
import { Doc } from "../convex/_generated/dataModel";
import { AIQuestionGenerator } from "./components/ai-question-generator/ai-question-generator";
import { QuestionManager } from "./components/question-manager";
import { Link } from "react-router-dom";
import { useTheme } from "./hooks/useTheme";
import { AnimatePresence } from "framer-motion";
import { cn } from "./lib/utils";
import { BaseCard } from "./components/based-card/base-card";
import { StartingCard } from "./components/starting-card/starting-card";

export default function App() {
  const { theme, setTheme } = useTheme();
  const [gradient, setGradient] = useState<Record<string, string>>({["style"]: "#667EEA", ["tone"]: "#764BA2"});

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  const gradientTarget = theme === "dark" ? "#000" : "#fff";

  const handleGradientChange = (gradient: Record<string, string>) => {
    setGradient(gradient);
  };

  return (
    <div
      className="min-h-screen transition-colors overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${gradientTarget},${gradient.style},${gradient.tone}, ${gradientTarget})`
      }}
    >
      {/* Header */}
      <header className="p-4 flex justify-between items-center">
        <div className="flex gap-2">
          <Link
            to="/liked"
            className="bg-black/20 dark:bg-black/20 p-2 rounded-lg backdrop-blur-sm hover:bg-white/30 transition-colors text-white"
          >
            ❤️ Liked Questions
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/settings"
            className="bg-black/20 dark:bg-black/20 p-2 rounded-lg backdrop-blur-sm hover:bg-white/30 transition-colors text-white"
          >
            ⚙️ Settings
          </Link>
          <button
            onClick={toggleTheme}
            className="bg-black/20 dark:bg-black/20 p-2 rounded-lg backdrop-blur-sm hover:bg-white/30 transition-colors text-white"
          >
            {theme === "dark" ? "🌞" : "🌙"}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        {/* <QuestionManager 
          theme={theme}
          onGradientChange={handleGradientChange}
        /> */}
        <StartingCard />
      </main>
    </div>
  );
}
