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

  return {
    theme,
    setTheme,
    likedQuestions: [],
    setLikedQuestions: () => {},
    addLikedQuestion: () => {},
    removeLikedQuestion: () => {},
    questionHistory: [],
    setQuestionHistory: () => {},
    addQuestionToHistory: () => {},
    removeQuestionFromHistory: () => {},
    hiddenQuestions: [],
    setHiddenQuestions: () => {},
    addHiddenQuestion: () => {},
    removeHiddenQuestion: () => {},
    hiddenStyles: [],
    setHiddenStyles: () => {},
    addHiddenStyle: () => {},
    removeHiddenStyle: () => {},
    hiddenTones: [],
    setHiddenTones: () => {},
    addHiddenTone: () => {},
    removeHiddenTone: () => {},
    clearLikedQuestions: () => {},
    clearQuestionHistory: () => {},
    clearHiddenQuestions: () => {},
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

  const questionHistory = useQuery(api.users.getQuestionHistory) ?? [];

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

  // History is now managed by the backend analytics
  const setQuestionHistory = useCallback(() => {}, []);
  const addQuestionToHistory = useCallback(() => {}, []);
  const removeQuestionFromHistory = useCallback(() => {}, []);
  const clearQuestionHistory = useCallback(() => {}, []);

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
