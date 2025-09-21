import { createContext, useContext, ReactNode, useState, useCallback } from "react";
import { Id } from "../../convex/_generated/dataModel";
import { HistoryEntry } from "./useQuestionHistory";

type Theme = "light" | "dark";

// The useLocalStorage hook from the old file
function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === "undefined") {
      return initialValue;
    }
    try {
      const item = window.localStorage.getItem(key);
      if (!item) {
        return initialValue;
      }
      let value = JSON.parse(item);

      if (key === "likedQuestions" && Array.isArray(value) && value.length > 0 && typeof value[0] === "object" && value[0] !== null && "_id" in value[0]) {
        console.log("Old 'likedQuestions' format detected. Migrating...");
        value = value.map((item: any) => item._id);
        window.localStorage.setItem(key, JSON.stringify(value));
        console.log("Migration complete. New value:", value);
      }
      
      if (Array.isArray(initialValue) && !Array.isArray(value)) {
        console.log("Data in localStorage is corrupted (not an array). Returning initial value.");
        return initialValue;
      }
      
      if (key === "likedQuestions" && Array.isArray(value)) {
        const validValues = value.filter(item => 
          typeof item === 'string' && item.length > 0 && item !== null && item !== undefined
        );
        
        if (validValues.length !== value.length) {
          console.log("Found invalid entries in likedQuestions. Cleaning up...");
          window.localStorage.setItem(key, JSON.stringify(validValues));
          value = validValues;
        }
      }
      
      if (key === "questionHistory" && Array.isArray(value)) {
        const validQuestions = value.filter(item => {
          const question = item.question;
          return question &&
          typeof question === 'object' &&
          typeof question._id === 'string' &&
          typeof question.text === 'string' &&
          question.text.length > 0
        });
        
        if (validQuestions.length !== value.length) {
          console.log("Found invalid questions in history. Cleaning up...", validQuestions, value);
          window.localStorage.setItem(key, JSON.stringify(validQuestions));
          value = validQuestions;
        }
      }
      return value;
    } catch (error) {
      console.error("Error reading from localStorage", error);
      return initialValue;
    }
  });

  const setValue = useCallback((value: T | ((val: T) => T)) => {
    try {
      setStoredValue(prevStoredValue => {
        const valueToStore = value instanceof Function ? value(prevStoredValue) : value;
        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(key, JSON.stringify(valueToStore));
          } catch (storageError) {
            console.error("Error writing to localStorage:", storageError);
          }
        }
        return valueToStore;
      });
    } catch (error) {
      console.error("Error in setValue:", error);
    }
  }, [key]);

  return [storedValue, setValue] as const;
}


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
}

const StorageContext = createContext<StorageContextType | undefined>(
  undefined
);

export const StorageProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setTheme] = useLocalStorage<Theme>("theme", "light");
  const [likedQuestions, setLikedQuestions] = useLocalStorage<
    Id<"questions">[]
  >("likedQuestions", []);
  const [questionHistory, setQuestionHistory] = useLocalStorage<HistoryEntry[]>(
    "questionHistory",
    []
  );
  const [hiddenQuestions, setHiddenQuestions] = useLocalStorage<
    Id<"questions">[]
  >("hiddenQuestions", []);
  const [hiddenStyles, setHiddenStyles] = useLocalStorage<string[]>(
    "hiddenStyles",
    []
  );
  const [hiddenTones, setHiddenTones] = useLocalStorage<string[]>(
    "hiddenTones",
    []
  );
  const [bypassLandingPage, setBypassLandingPage] = useLocalStorage<boolean>(
    "bypassLandingPage",
    true
  );

  const addLikedQuestion = useCallback((id: Id<"questions">) => {
    setLikedQuestions(prev => [...prev, id]);
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
    setQuestionHistory(prev => [entry, ...prev]);
  }, [setQuestionHistory]);
  const removeQuestionFromHistory = useCallback((id: Id<"questions">) => {
    setQuestionHistory(prev => prev.filter(entry => entry.question && entry.question._id !== id));
  }, [setQuestionHistory]);
  
  const addHiddenQuestion = useCallback((id: Id<"questions">) => {
    setHiddenQuestions(prev => [...prev, id]);
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
