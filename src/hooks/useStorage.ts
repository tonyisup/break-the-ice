import { useCallback, useEffect, useRef, useState } from "react";
import { Id } from "../../convex/_generated/dataModel";
import { HistoryEntry } from "./useQuestionHistory";
import { useLocalStorage } from "./useLocalStorage";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";

// A change to a signed-in person's account did not reach the server. The page has already
// shown it as done, so they are told plainly; one toast covers a burst of failures.
const reportSaveFailure = (error: unknown) => {
  console.error("Saving to the account failed:", error);
  toast.error("That change couldn't be saved to your account. Check your connection and try again.", { id: "account-save-failed" });
};
const save = (request: Promise<unknown> | void) => {
  void Promise.resolve(request).catch(reportSaveFailure);
};

// Removed when consent is declined or withdrawn. What a person saves themselves (likes,
// hidden items, history, theme and settings) is necessary storage: the site can't do what
// they asked without it, so it is kept whatever they choose about analytics. Only the
// session id, which is sent with analytics events, waits for consent.
export const NON_ESSENTIAL_STORAGE_KEYS = [
  "sessionId",
];

export type Theme = "light" | "dark" | "system";
export type StorageLimitBehavior = "block" | "replace";

export interface StorageContextType {
  sessionId: string;
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
  hiddenStyles: Id<"styles">[] | undefined;
  setHiddenStyles: (ids: Id<"styles">[]) => void;
  addHiddenStyle: (id: Id<"styles">) => void;
  removeHiddenStyle: (id: Id<"styles">) => void;
  hiddenTones: Id<"tones">[] | undefined;
  setHiddenTones: (ids: Id<"tones">[]) => void;
  addHiddenTone: (id: Id<"tones">) => void;
  removeHiddenTone: (id: Id<"tones">) => void;
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
  /** True while a signed-in person's likes and hidden items are still loading. */
  savedListsLoading?: boolean;
  /** True while a signed-in person's history is still loading. */
  questionHistoryLoading?: boolean;
}

export const MAX_ANON_LIKED = Number(import.meta.env.VITE_MAX_ANON_LIKED) || 100;
export const MAX_ANON_BLOCKED = Number(import.meta.env.VITE_MAX_ANON_BLOCKED) || 100;
export const MAX_ANON_HISTORY = Number(import.meta.env.VITE_MAX_ANON_HISTORY) || 100;

// useLocalStorage only writes on set, so the generated id is saved here once (with
// consent). Otherwise every page load is a new session, and a signed-out like would
// count again after a reload.
function useSessionId(hasConsented: boolean): string {
  const [sessionId, setSessionId] = useLocalStorage<string>(
    "sessionId",
    crypto.randomUUID?.() || Math.random().toString(36).substring(2),
    hasConsented,
  );
  useEffect(() => {
    if (!hasConsented) return;
    try {
      if (!window.localStorage.getItem("sessionId")) setSessionId(sessionId);
    } catch {
      // Storage is unavailable: the id lasts for this page load.
    }
  }, [hasConsented, sessionId, setSessionId]);
  return sessionId;
}

export const useLocalStorageContext = (
  hasConsented: boolean,
): StorageContextType => {
  const sessionId = useSessionId(hasConsented);

  const [theme, setTheme] = useLocalStorage<Theme>(
    "theme",
    "system",
    true,
  );

  const [likedQuestions, setLikedQuestions] = useLocalStorage<Id<"questions">[]>(
    "likedQuestions",
    [],
    true,
  );

  const [hiddenQuestions, setHiddenQuestions] = useLocalStorage<Id<"questions">[]>(
    "hiddenQuestions",
    [],
    true,
  );

  const [hiddenStyles, setHiddenStyles] = useLocalStorage<Id<"styles">[]>(
    "hiddenStyles",
    [],
    true,
  );

  const [hiddenTones, setHiddenTones] = useLocalStorage<Id<"tones">[]>(
    "hiddenTones",
    [],
    true,
  );

  const [defaultStyle, setDefaultStyle] = useLocalStorage<string | undefined>(
    "defaultStyle",
    undefined,
    true
  );

  const [defaultTone, setDefaultTone] = useLocalStorage<string | undefined>(
    "defaultTone",
    undefined,
    true
  );

  const [storageLimitBehavior, setStorageLimitBehavior] = useLocalStorage<StorageLimitBehavior>(
    "storageLimitBehavior",
    "block",
    true
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
    (id: Id<"styles">) => {
      setHiddenStyles((prev) => [...prev, id]);
    },
    [setHiddenStyles],
  );

  const removeHiddenStyle = useCallback(
    (id: Id<"styles">) => {
      setHiddenStyles((prev) => prev.filter((sId) => sId !== id));
    },
    [setHiddenStyles],
  );

  const addHiddenTone = useCallback(
    (id: Id<"tones">) => {
      setHiddenTones((prev) => [...prev, id]);
    },
    [setHiddenTones],
  );

  const removeHiddenTone = useCallback(
    (id: Id<"tones">) => {
      setHiddenTones((prev) => prev.filter((tId) => tId !== id));
    },
    [setHiddenTones],
  );

  const [questionHistory, setQuestionHistory] = useLocalStorage<HistoryEntry[]>(
    "questionHistory",
    [],
    true,
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
    sessionId,
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
  const sessionId = useSessionId(hasConsented);

  const [theme, setTheme] = useLocalStorage<Theme>(
    "theme",
    "system",
    true,
  );

  const questionHistoryQuery = useQuery(api.core.userSettings.getQuestionHistory, {});
  const questionHistory = questionHistoryQuery ?? [];

  const settings = useQuery(api.core.userSettings.getSettings, {});
  const [likedQuestions, setLikedQuestions] = useState<Id<"questions">[]>([]);
  const [hiddenQuestions, setHiddenQuestions] = useState<Id<"questions">[]>([]);
  const [localHiddenStyles, setLocalHiddenStyles] = useState<Id<"styles">[]>([]);
  const [localHiddenTones, setLocalHiddenTones] = useState<Id<"tones">[]>([]);
  const [defaultStyle, setDefaultStyle] = useState<string | undefined>(
    undefined,
  );
  const [defaultTone, setDefaultTone] = useState<string | undefined>(undefined);
  const updateLikedQuestions = useMutation(api.core.userSettings.updateLikedQuestions);
  const updateHiddenQuestions = useMutation(api.core.userSettings.updateHiddenQuestions);
  const updateUserSettings = useMutation(api.core.userSettings.updateUserSettings);
  const mergeKnownLikedQuestions = useMutation(api.core.userSettings.mergeKnownLikedQuestions);
  const mergeKnownHiddenQuestions = useMutation(api.core.userSettings.mergeKnownHiddenQuestions);
  const mergeQuestionHistory = useMutation(api.core.userSettings.mergeQuestionHistory);
  const hiddenStylesQuery = useQuery(api.core.userSettings.getHiddenStyleIds, {});
  const hiddenTonesQuery = useQuery(api.core.userSettings.getHiddenToneIds, {});
  const updateHiddenStyles = useMutation(api.core.userSettings.updateHiddenStyles);
  const updateHiddenTones = useMutation(api.core.userSettings.updateHiddenTones);
  const addHiddenStyleId = useMutation(api.core.userSettings.addHiddenStyleId);
  const removeHiddenStyleId = useMutation(api.core.userSettings.removeHiddenStyleId);
  const addHiddenToneId = useMutation(api.core.userSettings.addHiddenToneId);
  const removeHiddenToneId = useMutation(api.core.userSettings.removeHiddenToneId);

  const mergeInFlight = useRef(false);
  useEffect(() => {
    if (mergeInFlight.current) return;

    const readLocalList = (key: string): { raw: string; list: unknown[] } | null => {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed) && parsed.length > 0 ? { raw, list: parsed } : null;
      } catch (e) {
        console.error(`Failed to read local ${key} for merging`, e);
        return null;
      }
    };
    const localLikes = readLocalList("likedQuestions");
    const localHidden = readLocalList("hiddenQuestions");
    const localHistory = readLocalList("questionHistory");
    if (!localLikes && !localHidden && !localHistory) return;

    // Clear each local list only after the server confirms the merge, and only if it
    // still holds what was sent: a sign-out or another tab can add entries meanwhile.
    // Otherwise it stays for the next visit; the merges are safe to retry.
    const mergeThenClear = async (key: string, raw: string, merge: () => Promise<unknown>) => {
      try {
        await merge();
        if (localStorage.getItem(key) === raw) localStorage.removeItem(key);
      } catch (e) {
        console.error(`Failed to merge local ${key}; keeping it for the next visit`, e);
      }
    };
    const ids = (list: unknown[]) => list.filter((id): id is string => typeof id === "string");

    mergeInFlight.current = true;
    void (async () => {
      if (localLikes) {
        await mergeThenClear("likedQuestions", localLikes.raw, () =>
          mergeKnownLikedQuestions({ likedQuestions: ids(localLikes.list) }),
        );
      }
      if (localHidden) {
        await mergeThenClear("hiddenQuestions", localHidden.raw, () =>
          mergeKnownHiddenQuestions({ hiddenQuestions: ids(localHidden.list) }),
        );
      }
      if (localHistory) {
        const historyToMerge = localHistory.list.flatMap((entry) => {
          const { question, viewedAt } = (entry ?? {}) as { question?: { _id?: unknown }; viewedAt?: unknown };
          return typeof question?._id === "string" && typeof viewedAt === "number"
            ? [{ questionId: question._id, viewedAt }]
            : [];
        });
        await mergeThenClear("questionHistory", localHistory.raw, () =>
          mergeQuestionHistory({ history: historyToMerge }),
        );
      }
      mergeInFlight.current = false;
    })();
  }, [
    mergeKnownLikedQuestions,
    mergeKnownHiddenQuestions,
    mergeQuestionHistory,
  ]);

  useEffect(() => {
    if (settings) {
      setLikedQuestions(settings.likedQuestions ?? []);
      setHiddenQuestions(settings.hiddenQuestions ?? []);
      setLocalHiddenStyles(settings.hiddenStyles as Id<"styles">[] ?? []);
      setLocalHiddenTones(settings.hiddenTones as Id<"tones">[] ?? []);
      setDefaultStyle(settings.defaultStyle);
      setDefaultTone(settings.defaultTone);
    } else if (settings === null) {
      setLikedQuestions([]);
      setHiddenQuestions([]);
      setLocalHiddenStyles([]);
      setLocalHiddenTones([]);
    }
  }, [settings]);

  const addLikedQuestion = useCallback(
    (id: Id<"questions">) => {
      const newLikedQuestions = [...likedQuestions, id];
      setLikedQuestions(newLikedQuestions);
      save(updateLikedQuestions({
        likedQuestions: newLikedQuestions,
      }));
    },
    [likedQuestions, updateLikedQuestions],
  );

  const removeLikedQuestion = useCallback(
    (id: Id<"questions">) => {
      const newLikedQuestions = likedQuestions.filter(
        (questionId) => questionId !== id,
      );
      setLikedQuestions(newLikedQuestions);
      save(updateLikedQuestions({
        likedQuestions: newLikedQuestions,
      }));
    },
    [likedQuestions, updateLikedQuestions],
  );

  const addHiddenQuestion = useCallback(
    (id: Id<"questions">) => {
      const newHiddenQuestions = [...hiddenQuestions, id];
      setHiddenQuestions(newHiddenQuestions);
      save(updateHiddenQuestions({
        hiddenQuestions: newHiddenQuestions,
      }));
    },
    [hiddenQuestions, updateHiddenQuestions],
  );

  const removeHiddenQuestion = useCallback(
    (id: Id<"questions">) => {
      const newHiddenQuestions = hiddenQuestions.filter(
        (questionId) => questionId !== id,
      );
      setHiddenQuestions(newHiddenQuestions);
      save(updateHiddenQuestions({
        hiddenQuestions: newHiddenQuestions,
      }));
    },
    [hiddenQuestions, updateHiddenQuestions],
  );

  // History is now managed by the backend analytics
  const setQuestionHistory = useCallback((_entries: HistoryEntry[]) => { }, []);
  const addQuestionToHistory = useCallback((_entry: HistoryEntry) => { }, []);
  const removeQuestionFromHistory = useCallback((_id: Id<"questions">) => { }, []);
  const clearServerHistory = useMutation(api.core.userSettings.clearQuestionHistory);
  // The server leaves out everything viewed up to now; the history query then updates itself.
  const clearQuestionHistory = useCallback(() => { save(clearServerHistory({})); }, [clearServerHistory]);

  const clearLikedQuestions = useCallback(() => {
    setLikedQuestions([]);
    save(updateLikedQuestions({ likedQuestions: [] }));
  }, [updateLikedQuestions]);

  const clearHiddenQuestions = useCallback(() => {
    setHiddenQuestions([]);
    save(updateHiddenQuestions({ hiddenQuestions: [] }));
  }, [updateHiddenQuestions]);

  return {
    sessionId,
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
    hiddenStyles: hiddenStylesQuery === null ? [] : hiddenStylesQuery,
    setHiddenStyles: (ids: Id<"styles">[]) => {
      setLocalHiddenStyles(ids);
      save(updateHiddenStyles({ hiddenStyles: ids }));
    },
    addHiddenStyle: (id: Id<"styles">) => {
      save(addHiddenStyleId({ styleId: id }));
    },
    removeHiddenStyle: (id: Id<"styles">) => {
      save(removeHiddenStyleId({ styleId: id }));
    },
    hiddenTones: hiddenTonesQuery === null ? [] : hiddenTonesQuery,
    setHiddenTones: (ids: Id<"tones">[]) => {
      setLocalHiddenTones(ids);
      save(updateHiddenTones({ hiddenTones: ids }));
    },
    addHiddenTone: (id: Id<"tones">) => {
      save(addHiddenToneId({ toneId: id }));
    },
    removeHiddenTone: (id: Id<"tones">) => {
      save(removeHiddenToneId({ toneId: id }));
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
      save(updateUserSettings({ defaultStyle: style }));
    },
    defaultTone,
    setDefaultTone: (tone: string) => {
      setDefaultTone(tone);
      save(updateUserSettings({ defaultTone: tone }));
    },
    storageLimitBehavior: "replace",
    setStorageLimitBehavior: () => { }, // No-op for authenticated users
    savedListsLoading: settings === undefined,
    questionHistoryLoading: questionHistoryQuery === undefined,
    likedLimit: Infinity,
    hiddenLimit: Infinity,
  };
};
