import { useCallback, useEffect, useState } from "react";
import { Id } from "../../convex/_generated/dataModel";
import { HistoryEntry } from "./useQuestionHistory";
import { useLocalStorage } from "./useLocalStorage";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export const NON_ESSENTIAL_STORAGE_KEYS = [
  "likedQuestions",
  "hiddenQuestions",
  "hiddenStyles",
  "hiddenTones",
  "defaultStyle",
  "defaultTone",
  "storageLimitBehavior",
  "questionHistory",
  "theme",
];

export type Theme = "light" | "dark" | "system";
export type StorageLimitBehavior = "block" | "replace";

export interface StorageContextType {
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
  clearLikedQuestions: () => void;
  clearQuestionHistory: () => void;
  clearHiddenQuestions: () => void;
  clearHiddenStyles: () => void;
  clearHiddenTones: () => void;
  hasConsented: boolean;
  setHasConsented: (consent: boolean) => void;
  revokeConsent: () => void;
  defaultStyle?: string;
  setDefaultStyle: (style: string) => void;
  defaultTone?: string;
  setDefaultTone: (tone: string) => void;
  storageLimitBehavior: StorageLimitBehavior;
  setStorageLimitBehavior: (behavior: StorageLimitBehavior) => void;
  likedLimit: number;
  hiddenLimit: number;
}

export const MAX_ANON_LIKED = Number(import.meta.env.VITE_MAX_ANON_LIKED) || 100;
export const MAX_ANON_BLOCKED = Number(import.meta.env.VITE_MAX_ANON_BLOCKED) || 100;
export const MAX_ANON_HISTORY = Number(import.meta.env.VITE_MAX_ANON_HISTORY) || 100;

export const useLocalStorageContext = (
  hasConsented: boolean,
): StorageContextType => {
  const [theme, setTheme] = useLocalStorage<Theme>(
    "theme",
    "system",
    hasConsented,
  );

  const [likedQuestions, setLikedQuestions] = useLocalStorage<Id<"questions">[]>(
    "likedQuestions",
    [],
    hasConsented,
  );

  const [hiddenQuestions, setHiddenQuestions] = useLocalStorage<Id<"questions">[]>(
    "hiddenQuestions",
    [],
    hasConsented,
  );

  const [hiddenStyles, setHiddenStyles] = useLocalStorage<string[]>(
    "hiddenStyles",
    [],
    hasConsented,
  );

  const [hiddenTones, setHiddenTones] = useLocalStorage<string[]>(
    "hiddenTones",
    [],
    hasConsented,
  );

  const [defaultStyle, setDefaultStyle] = useLocalStorage<string | undefined>(
    "defaultStyle",
    undefined,
    hasConsented
  );

  const [defaultTone, setDefaultTone] = useLocalStorage<string | undefined>(
    "defaultTone",
    undefined,
    hasConsented
  );

  const [storageLimitBehavior, setStorageLimitBehavior] = useLocalStorage<StorageLimitBehavior>(
    "storageLimitBehavior",
    "block",
    hasConsented
  );

  const addLikedQuestion = useCallback(
    (id: Id<"questions">) => {
      setLikedQuestions((prev) => {
        // If already in list, don't do anything (or move to top? Assume append)
        // If behavior is block and we are at limit:
        if (storageLimitBehavior === 'block' && prev.length >= MAX_ANON_LIKED) {
            return prev;
        }

        const newState = [...prev, id];
        if (newState.length > MAX_ANON_LIKED) {
          // If behavior is replace (implied if we got here and length > MAX), slice
          return newState.slice(newState.length - MAX_ANON_LIKED);
        }
        return newState;
      });
    },
    [setLikedQuestions, storageLimitBehavior],
  );

  const removeLikedQuestion = useCallback(
    (id: Id<"questions">) => {
      setLikedQuestions((prev) => prev.filter((qId) => qId !== id));
    },
    [setLikedQuestions],
  );

  const addHiddenQuestion = useCallback(
    (id: Id<"questions">) => {
      setHiddenQuestions((prev) => {
        if (storageLimitBehavior === 'block' && prev.length >= MAX_ANON_BLOCKED) {
            return prev;
        }
        const newState = [...prev, id];
        if (newState.length > MAX_ANON_BLOCKED) {
          return newState.slice(newState.length - MAX_ANON_BLOCKED);
        }
        return newState;
      });
    },
    [setHiddenQuestions, storageLimitBehavior],
  );

  const removeHiddenQuestion = useCallback(
    (id: Id<"questions">) => {
      setHiddenQuestions((prev) => prev.filter((qId) => qId !== id));
    },
    [setHiddenQuestions],
  );

  const addHiddenStyle = useCallback(
    (id: string) => {
      setHiddenStyles((prev) => [...prev, id]);
    },
    [setHiddenStyles],
  );

  const removeHiddenStyle = useCallback(
    (id: string) => {
      setHiddenStyles((prev) => prev.filter((sId) => sId !== id));
    },
    [setHiddenStyles],
  );

  const addHiddenTone = useCallback(
    (id: string) => {
      setHiddenTones((prev) => [...prev, id]);
    },
    [setHiddenTones],
  );

  const removeHiddenTone = useCallback(
    (id: string) => {
      setHiddenTones((prev) => prev.filter((tId) => tId !== id));
    },
    [setHiddenTones],
  );

  const [questionHistory, setQuestionHistory] = useLocalStorage<HistoryEntry[]>(
    "questionHistory",
    [],
    hasConsented,
  );

  const addQuestionToHistory = useCallback(
    (entry: HistoryEntry) => {
      setQuestionHistory((prev) => {
        const newState = [...prev, entry];
        if (newState.length > MAX_ANON_HISTORY) {
          return newState.slice(newState.length - MAX_ANON_HISTORY);
        }
        return newState;
      });
    },
    [setQuestionHistory],
  );

  const removeQuestionFromHistory = useCallback(
    (id: Id<"questions">) => {
      setQuestionHistory((prev) => prev.filter((e) => e.question._id !== id));
    },
    [setQuestionHistory],
  );

  return {
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
    clearLikedQuestions: () => setLikedQuestions([]),
    clearQuestionHistory: () => setQuestionHistory([]),
    clearHiddenQuestions: () => setHiddenQuestions([]),
    clearHiddenStyles: () => setHiddenStyles([]),
    clearHiddenTones: () => setHiddenTones([]),
    hasConsented,
    setHasConsented: (consent: boolean) => {
      const d = new Date();
      d.setTime(d.getTime() + 365 * 24 * 60 * 60 * 1000);
      const expires = "expires=" + d.toUTCString();
      document.cookie = "cookieConsent=" + consent + ";" + expires + ";path=/";
    },
    revokeConsent: () => {
      const d = new Date();
      d.setTime(d.getTime() + 365 * 24 * 60 * 60 * 1000);
      const expires = "expires=" + d.toUTCString();
      document.cookie = "cookieConsent=false;" + expires + ";path=/";
      NON_ESSENTIAL_STORAGE_KEYS.forEach((key) => {
        localStorage.removeItem(key);
      });
    },
    defaultStyle,
    setDefaultStyle,
    defaultTone,
    setDefaultTone,
    storageLimitBehavior,
    setStorageLimitBehavior,
    likedLimit: MAX_ANON_LIKED,
    hiddenLimit: MAX_ANON_BLOCKED,
  };
};

export const useConvexStorageContext = (
  hasConsented: boolean,
): StorageContextType => {
  const [theme, setTheme] = useLocalStorage<Theme>(
    "theme",
    "system",
    hasConsented,
  );

  const questionHistory = useQuery(api.users.getQuestionHistory, {}) ?? [];

  const settings = useQuery(api.users.getSettings);
  const [likedQuestions, setLikedQuestions] = useState<Id<"questions">[]>([]);
  const [hiddenQuestions, setHiddenQuestions] = useState<Id<"questions">[]>([]);
  const [hiddenStyles, setHiddenStyles] = useState<string[]>([]);
  const [hiddenTones, setHiddenTones] = useState<string[]>([]);
  const [defaultStyle, setDefaultStyle] = useState<string | undefined>(
    undefined,
  );
  const [defaultTone, setDefaultTone] = useState<string | undefined>(undefined);
  const updateLikedQuestions = useMutation(api.users.updateLikedQuestions);
  const updateHiddenQuestions = useMutation(api.users.updateHiddenQuestions);
  const updateHiddenStyles = useMutation(api.users.updateHiddenStyles);
  const updateHiddenTones = useMutation(api.users.updateHiddenTones);
  const updateUserSettings = useMutation(api.users.updateUserSettings);
  const mergeKnownLikedQuestions = useMutation(api.users.mergeKnownLikedQuestions);
  const mergeKnownHiddenQuestions = useMutation(api.users.mergeKnownHiddenQuestions);
  const mergeQuestionHistory = useMutation(api.users.mergeQuestionHistory);

  useEffect(() => {
    // Merge local likes if they exist
    const rawLocalLikes = localStorage.getItem("likedQuestions");
    if (rawLocalLikes) {
      try {
        const localLikes = JSON.parse(rawLocalLikes);
        if (Array.isArray(localLikes) && localLikes.length > 0) {
          void mergeKnownLikedQuestions({ likedQuestions: localLikes });
          localStorage.removeItem("likedQuestions");
        }
      } catch (e) {
        console.error("Failed to parse local liked questions for merging", e);
      }
    }

    // Merge local hidden questions if they exist
    const rawLocalHidden = localStorage.getItem("hiddenQuestions");
    if (rawLocalHidden) {
      try {
        const localHidden = JSON.parse(rawLocalHidden);
        if (Array.isArray(localHidden) && localHidden.length > 0) {
          void mergeKnownHiddenQuestions({ hiddenQuestions: localHidden });
          localStorage.removeItem("hiddenQuestions");
        }
      } catch (e) {
        console.error("Failed to parse local hidden questions for merging", e);
      }
    }

    // Merge local question history if it exists
    const rawLocalHistory = localStorage.getItem("questionHistory");
    if (rawLocalHistory) {
      try {
        const localHistory = JSON.parse(rawLocalHistory);
        if (Array.isArray(localHistory) && localHistory.length > 0) {
          const historyToMerge = localHistory.map((entry: any) => ({
            questionId: entry.question._id,
            viewedAt: entry.viewedAt,
          }));
          void mergeQuestionHistory({ history: historyToMerge });
          localStorage.removeItem("questionHistory");
        }
      } catch (e) {
        console.error("Failed to parse local question history for merging", e);
      }
    }
  }, [mergeKnownLikedQuestions, mergeKnownHiddenQuestions, mergeQuestionHistory]);

  useEffect(() => {
    if (settings) {
      setLikedQuestions(settings.likedQuestions ?? []);
      setHiddenQuestions(settings.hiddenQuestions ?? []);
      setHiddenStyles(settings.hiddenStyles ?? []);
      setHiddenTones(settings.hiddenTones ?? []);
      setDefaultStyle(settings.defaultStyle);
      setDefaultTone(settings.defaultTone);
    }
  }, [settings]);

  const addLikedQuestion = useCallback(
    (id: Id<"questions">) => {
      const newLikedQuestions = [...likedQuestions, id];
      setLikedQuestions(newLikedQuestions);
      void updateLikedQuestions({ likedQuestions: newLikedQuestions });
    },
    [likedQuestions, updateLikedQuestions],
  );

  const removeLikedQuestion = useCallback(
    (id: Id<"questions">) => {
      const newLikedQuestions = likedQuestions.filter(
        (questionId) => questionId !== id,
      );
      setLikedQuestions(newLikedQuestions);
      void updateLikedQuestions({ likedQuestions: newLikedQuestions });
    },
    [likedQuestions, updateLikedQuestions],
  );

  const addHiddenQuestion = useCallback(
    (id: Id<"questions">) => {
      const newHiddenQuestions = [...hiddenQuestions, id];
      setHiddenQuestions(newHiddenQuestions);
      void updateHiddenQuestions({ hiddenQuestions: newHiddenQuestions });
    },
    [hiddenQuestions, updateHiddenQuestions],
  );

  const removeHiddenQuestion = useCallback(
    (id: Id<"questions">) => {
      const newHiddenQuestions = hiddenQuestions.filter(
        (questionId) => questionId !== id,
      );
      setHiddenQuestions(newHiddenQuestions);
      void updateHiddenQuestions({ hiddenQuestions: newHiddenQuestions });
    },
    [hiddenQuestions, updateHiddenQuestions],
  );

  // History is now managed by the backend analytics
  const setQuestionHistory = useCallback(() => { }, []);
  const addQuestionToHistory = useCallback(() => { }, []);
  const removeQuestionFromHistory = useCallback(() => { }, []);
  const clearQuestionHistory = useCallback(() => { }, []);

  const clearLikedQuestions = useCallback(() => {
    setLikedQuestions([]);
    void updateLikedQuestions({ likedQuestions: [] });
  }, [updateLikedQuestions]);

  const clearHiddenQuestions = useCallback(() => {
    setHiddenQuestions([]);
    void updateHiddenQuestions({ hiddenQuestions: [] });
  }, [updateHiddenQuestions]);

  return {
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
    addHiddenStyle: (id: string) => {
      const newHiddenStyles = [...hiddenStyles, id];
      setHiddenStyles(newHiddenStyles);
      void updateHiddenStyles({ hiddenStyles: newHiddenStyles });
    },
    removeHiddenStyle: (id: string) => {
      const newHiddenStyles = hiddenStyles.filter(
        (styleId) => styleId !== id,
      );
      setHiddenStyles(newHiddenStyles);
      void updateHiddenStyles({ hiddenStyles: newHiddenStyles });
    },
    hiddenTones,
    setHiddenTones,
    addHiddenTone: (id: string) => {
      const newHiddenTones = [...hiddenTones, id];
      setHiddenTones(newHiddenTones);
      void updateHiddenTones({ hiddenTones: newHiddenTones });
    },
    removeHiddenTone: (id: string) => {
      const newHiddenTones = hiddenTones.filter((toneId) => toneId !== id);
      setHiddenTones(newHiddenTones);
      void updateHiddenTones({ hiddenTones: newHiddenTones });
    },
    clearLikedQuestions,
    clearQuestionHistory,
    clearHiddenQuestions,
    clearHiddenStyles: () => { },
    clearHiddenTones: () => { },
    hasConsented,
    setHasConsented: (consent: boolean) => {
      const d = new Date();
      d.setTime(d.getTime() + 365 * 24 * 60 * 60 * 1000);
      const expires = "expires=" + d.toUTCString();
      document.cookie = "cookieConsent=" + consent + ";" + expires + ";path=/";
    },
    revokeConsent: () => {
      const d = new Date();
      d.setTime(d.getTime() + 365 * 24 * 60 * 60 * 1000);
      const expires = "expires=" + d.toUTCString();
      document.cookie = "cookieConsent=false;" + expires + ";path=/";
      NON_ESSENTIAL_STORAGE_KEYS.forEach((key) => {
        localStorage.removeItem(key);
      });
    },
    defaultStyle,
    setDefaultStyle: (style: string) => {
      setDefaultStyle(style);
      void updateUserSettings({ defaultStyle: style });
    },
    defaultTone,
    setDefaultTone: (tone: string) => {
      setDefaultTone(tone);
      void updateUserSettings({ defaultTone: tone });
    },
    storageLimitBehavior: "replace",
    setStorageLimitBehavior: () => { }, // No-op for authenticated users
    likedLimit: Infinity,
    hiddenLimit: Infinity,
  };
};
