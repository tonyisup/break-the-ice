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
  questionHistory: HistoryEntry[];
  setQuestionHistory: (entries: HistoryEntry[]) => void;
  hiddenQuestions: Id<"questions">[];
  setHiddenQuestions: (ids: Id<"questions">[]) => void;
  hiddenStyles: string[];
  setHiddenStyles: (ids: string[]) => void;
  hiddenTones: string[];
  setHiddenTones: (ids: string[]) => void;
  bypassLandingPage: boolean;
  setBypassLandingPage: (bypass: boolean) => void;
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
    false
  );

  const value = {
    theme,
    setTheme,
    likedQuestions,
    setLikedQuestions,
    questionHistory,
    setQuestionHistory,
    hiddenQuestions,
    setHiddenQuestions,
    hiddenStyles,
    setHiddenStyles,
    hiddenTones,
    setHiddenTones,
    bypassLandingPage,
    setBypassLandingPage,
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
