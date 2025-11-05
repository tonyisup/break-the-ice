import { useCallback, useEffect, useState } from "react";
import { Id } from "../../convex/_generated/dataModel";
import { HistoryEntry } from "./useQuestionHistory";
import { useLocalStorage } from "./useLocalStorage";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

const MAX_ITEMS = 100;

export type Theme = "light" | "dark" | "system";

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
  bypassLandingPage: boolean;
  setBypassLandingPage: (bypass: boolean) => void;
  clearLikedQuestions: () => void;
  clearQuestionHistory: () => void;
  clearHiddenQuestions: () => void;
  clearHiddenStyles: () => void;
  clearHiddenTones: () => void;
  hasConsented: boolean;
  setHasConsented: (consent: boolean) => void;
  defaultStyle?: string;
  setDefaultStyle: (style: string) => void;
  defaultTone?: string;
  setDefaultTone: (tone: string) => void;
}

export const useLocalStorageContext = (
  hasConsented: boolean,
): StorageContextType => {
  const [theme, setTheme] = useLocalStorage<Theme>(
    "theme",
    "system",
    hasConsented,
  );
  const [likedQuestions, setLikedQuestions] = useLocalStorage<
    Id<"questions">[]
  >("likedQuestions", [], hasConsented);
  const [questionHistory, setQuestionHistory] = useLocalStorage<HistoryEntry[]>(
    "questionHistory",
    [],
    hasConsented,
  );
  const [hiddenQuestions, setHiddenQuestions] = useLocalStorage<
    Id<"questions">[]
  >("hiddenQuestions", [], hasConsented);
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
  const [bypassLandingPage, setBypassLandingPage] = useLocalStorage<boolean>(
    "bypassLandingPage",
    true,
    hasConsented,
  );

  const addLikedQuestion = useCallback(
    (id: Id<"questions">) => {
      setLikedQuestions((prev) => {
        if (prev.length >= MAX_ITEMS) {
          const confirmed = window.confirm(
            "You have reached the maximum number of liked questions. Do you want to remove the oldest item to add this new one?",
          );
          if (confirmed) {
            return [...prev.slice(1), id];
          } else {
            return prev;
          }
        }
        return [...prev, id];
      });
    },
    [setLikedQuestions],
  );

  const removeLikedQuestion = useCallback(
    (id: Id<"questions">) => {
      setLikedQuestions((prev) =>
        prev.filter((questionId) => questionId !== id),
      );
    },
    [setLikedQuestions],
  );

  const addHiddenStyle = useCallback(
    (id: string) => {
      setHiddenStyles((prev) => [...prev, id]);
    },
    [setHiddenStyles],
  );

  const removeHiddenStyle = useCallback(
    (id: string) => {
      setHiddenStyles((prev) => prev.filter((styleId) => styleId !== id));
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
      setHiddenTones((prev) => prev.filter((toneId) => toneId !== id));
    },
    [setHiddenTones],
  );

  const addQuestionToHistory = useCallback(
    (entry: HistoryEntry) => {
      setQuestionHistory((prev) => {
        if (prev.length >= MAX_ITEMS) {
          const confirmed = window.confirm(
            "You have reached the maximum number of history items. Do you want to remove the oldest item to add this new one?",
          );
          if (confirmed) {
            return [entry, ...prev.slice(0, -1)];
          } else {
            return prev;
          }
        }
        return [entry, ...prev];
      });
    },
    [setQuestionHistory],
  );

  const removeQuestionFromHistory = useCallback(
    (id: Id<"questions">) => {
      setQuestionHistory((prev) =>
        prev.filter(
          (entry) => entry.question && entry.question._id !== id,
        ),
      );
    },
    [setQuestionHistory],
  );

  const addHiddenQuestion = useCallback(
    (id: Id<"questions">) => {
      setHiddenQuestions((prev) => {
        if (prev.length >= MAX_ITEMS) {
          const confirmed = window.confirm(
            "You have reached the maximum number of hidden questions. Do you want to remove the oldest item to add this new one?",
          );
          if (confirmed) {
            return [...prev.slice(1), id];
          } else {
            return prev;
          }
        }
        return [...prev, id];
      });
    },
    [setHiddenQuestions],
  );

  const removeHiddenQuestion = useCallback(
    (id: Id<"questions">) => {
      setHiddenQuestions((prev) =>
        prev.filter((questionId) => questionId !== id),
      );
    },
    [setHiddenQuestions],
  );

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
    bypassLandingPage,
    setBypassLandingPage,
    clearLikedQuestions,
    clearQuestionHistory,
    clearHiddenQuestions,
    clearHiddenStyles,
    clearHiddenTones,
    hasConsented,
    setHasConsented: (consent: boolean) => {
      // This is a bit of a hack, but it's the easiest way to get the
      // cookie to update.
      const d = new Date();
      d.setTime(d.getTime() + 365 * 24 * 60 * 60 * 1000);
      const expires = "expires=" + d.toUTCString();
      document.cookie = "cookieConsent=" + consent + ";" + expires + ";path=/";
    },
    defaultStyle: undefined,
    setDefaultStyle: () => {},
    defaultTone: undefined,
    setDefaultTone: () => {},
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
  const [questionHistory, setQuestionHistory] = useLocalStorage<HistoryEntry[]>(
    "questionHistory",
    [],
    hasConsented,
  );
  const [bypassLandingPage, setBypassLandingPage] = useLocalStorage<boolean>(
    "bypassLandingPage",
    true,
    hasConsented,
  );
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
  const addQuestionToHistory = useCallback(
    (entry: HistoryEntry) => {
      setQuestionHistory((prev) => [entry, ...prev]);
    },
    [setQuestionHistory],
  );
  const removeQuestionFromHistory = useCallback(
    (id: Id<"questions">) => {
      setQuestionHistory((prev) =>
        prev.filter(
          (entry) => entry.question && entry.question._id !== id,
        ),
      );
    },
    [setQuestionHistory],
  );
  const clearLikedQuestions = useCallback(() => {
    setLikedQuestions([]);
    void updateLikedQuestions({ likedQuestions: [] });
  }, [updateLikedQuestions]);
  const clearQuestionHistory = useCallback(() => {
    setQuestionHistory([]);
  }, [setQuestionHistory]);
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
    bypassLandingPage,
    setBypassLandingPage,
    clearLikedQuestions,
    clearQuestionHistory,
    clearHiddenQuestions,
    clearHiddenStyles: () => {},
    clearHiddenTones: () => {},
    hasConsented,
    setHasConsented: (consent: boolean) => {
      // This is a bit of a hack, but it's the easiest way to get the
      // cookie to update.
      const d = new Date();
      d.setTime(d.getTime() + 365 * 24 * 60 * 60 * 1000);
      const expires = "expires=" + d.toUTCString();
      document.cookie = "cookieConsent=" + consent + ";" + expires + ";path=/";
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
  };
};
