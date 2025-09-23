import { createContext, useContext, ReactNode, useCallback, useState } from "react";
import { Id } from "../../convex/_generated/dataModel";
import { HistoryEntry } from "./useQuestionHistory";
import { useLocalStorage } from "./useLocalStorage";

const MAX_ITEMS = 100;

type Theme = "light" | "dark" | "system";

interface StorageContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  likedQuestions: Id<"questions">[];
  setLikedQuestions: (ids: Id<"questions">[]) => void;
  addLikedQuestion: (id: Id<"questions">) => void;
  removeLikedQuestion: (id: Id<"questions">) => void;
  questionHistory: HistoryEntry[];
  setQuestionHistory: (entries: HistoryEntry[]) => void;
  addQuestionToHistory: (entry: HistoryEntry) => void;
  removeQuestionFromHistory: (id: Id<"questions">) => void;
  hiddenQuestions: Id<"questions">[];
  setHiddenQuestions: (ids: Id<"questions">[]) => void;
  addHiddenQuestion: (id: Id<"questions">) => void;
  removeHiddenQuestion: (id: Id<"questions">) => void;
  hiddenStyles: string[];
  setHiddenStyles: (ids: string[]) => void;
  addHiddenStyle: (id: string) => void;
  removeHiddenStyle: (id: string) => void;
  hiddenTones: string[];
  setHiddenTones: (ids: string[]) => void;
  addHiddenTone: (id: string) => void;
  removeHiddenTone: (id: string) => void;
  bypassLandingPage: boolean;
  setBypassLandingPage: (bypass: boolean) => void;
  clearLikedQuestions: () => void;
  clearQuestionHistory: () => void;
  clearHiddenQuestions: () => void;
  clearHiddenStyles: () => void;
  clearHiddenTones: () => void;
  hasConsented: boolean;
  setHasConsented: (consent: boolean) => void;
}

const StorageContext = createContext<StorageContextType | undefined>(
  undefined
);

export const StorageProvider = ({ children }: { children: ReactNode }) => {
  const [hasConsented, setHasConsented] = useState(false);
  const [theme, setTheme] = useLocalStorage<Theme>("theme", "system", hasConsented);
  const [likedQuestions, setLikedQuestions] = useLocalStorage<
    Id<"questions">[]
  >("likedQuestions", [], hasConsented);
  const [questionHistory, setQuestionHistory] = useLocalStorage<HistoryEntry[]>(
    "questionHistory",
    [],
    hasConsented
  );
  const [hiddenQuestions, setHiddenQuestions] = useLocalStorage<
    Id<"questions">[]
  >("hiddenQuestions", [], hasConsented);
  const [hiddenStyles, setHiddenStyles] = useLocalStorage<string[]>(
    "hiddenStyles",
    [],
    hasConsented
  );
  const [hiddenTones, setHiddenTones] = useLocalStorage<string[]>(
    "hiddenTones",
    [],
    hasConsented
  );
  const [bypassLandingPage, setBypassLandingPage] = useLocalStorage<boolean>(
    "bypassLandingPage",
    true,
    hasConsented
  );

  const addLikedQuestion = useCallback((id: Id<"questions">) => {
    setLikedQuestions(prev => {
      if (prev.length >= MAX_ITEMS) {
        const confirmed = window.confirm("You have reached the maximum number of liked questions. Do you want to remove the oldest item to add this new one?");
        if (confirmed) {
          return [...prev.slice(1), id];
        } else {
          return prev;
        }
      }
      return [...prev, id];
    });
  }, [setLikedQuestions]);
  const removeLikedQuestion = useCallback((id: Id<"questions">) => {
    setLikedQuestions(prev => prev.filter(questionId => questionId !== id));
  }, [setLikedQuestions]);

  const addHiddenStyle = useCallback((id: string) => {
    setHiddenStyles(prev => [...prev, id]);
  }, [setHiddenStyles]);
  const removeHiddenStyle = useCallback((id: string) => {
    setHiddenStyles(prev => prev.filter(styleId => styleId !== id));
  }, [setHiddenStyles]);
  
  const addHiddenTone = useCallback((id: string) => {
    setHiddenTones(prev => [...prev, id]);
  }, [setHiddenTones]);
  const removeHiddenTone = useCallback((id: string) => {
    setHiddenTones(prev => prev.filter(toneId => toneId !== id));
  }, [setHiddenTones]);

  const addQuestionToHistory = useCallback((entry: HistoryEntry) => {
    setQuestionHistory(prev => {
      if (prev.length >= MAX_ITEMS) {
        const confirmed = window.confirm("You have reached the maximum number of history items. Do you want to remove the oldest item to add this new one?");
        if (confirmed) {
          return [entry, ...prev.slice(0, -1)];
        } else {
          return prev;
        }
      }
      return [entry, ...prev];
    });
  }, [setQuestionHistory]);
  const removeQuestionFromHistory = useCallback((id: Id<"questions">) => {
    setQuestionHistory(prev => prev.filter(entry => entry.question && entry.question._id !== id));
  }, [setQuestionHistory]);
  
  const addHiddenQuestion = useCallback((id: Id<"questions">) => {
    setHiddenQuestions(prev => {
      if (prev.length >= MAX_ITEMS) {
        const confirmed = window.confirm("You have reached the maximum number of hidden questions. Do you want to remove the oldest item to add this new one?");
        if (confirmed) {
          return [...prev.slice(1), id];
        } else {
          return prev;
        }
      }
      return [...prev, id];
    });
  }, [setHiddenQuestions]);
  const removeHiddenQuestion = useCallback((id: Id<"questions">) => {
    setHiddenQuestions(prev => prev.filter(questionId => questionId !== id));
  }, [setHiddenQuestions]);

  const clearLikedQuestions = useCallback(() => {
    setLikedQuestions([]);
  }, [setLikedQuestions]);
  const clearQuestionHistory = useCallback(() => {
    setQuestionHistory([]);
  }, [setQuestionHistory]);
  const clearHiddenQuestions = useCallback(() => {
    setHiddenQuestions([]);
  }, [setHiddenQuestions]);
  const clearHiddenStyles = useCallback(() => {
    setHiddenStyles([]);
  }, [setHiddenStyles]);
  const clearHiddenTones = useCallback(() => {
    setHiddenTones([]);
  }, [setHiddenTones]);
  const value = {
    theme,
    setTheme,
    likedQuestions,
    setLikedQuestions,
    addLikedQuestion,
    removeLikedQuestion,
    questionHistory,
    setQuestionHistory,
    addQuestionToHistory,
    removeQuestionFromHistory,
    hiddenQuestions,
    setHiddenQuestions,
    addHiddenQuestion,
    removeHiddenQuestion,
    hiddenStyles,
    setHiddenStyles,
    addHiddenStyle,
    removeHiddenStyle,
    hiddenTones,
    setHiddenTones,
    addHiddenTone,
    removeHiddenTone,
    bypassLandingPage,
    setBypassLandingPage,
    clearLikedQuestions,
    clearQuestionHistory,
    clearHiddenQuestions,
    clearHiddenStyles,
    clearHiddenTones,
    hasConsented,
    setHasConsented,
  };

  return (
    <StorageContext.Provider value={value}>{children}</StorageContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useStorageContext = () => {
  const context = useContext(StorageContext);
  if (context === undefined) {
    throw new Error("useStorageContext must be used within a StorageProvider");
  }
  return context;
};
