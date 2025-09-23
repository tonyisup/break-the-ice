import { useState, useCallback, useEffect, useRef } from "react";

// The useLocalStorage hook from the old file
export function useLocalStorage<T>(key: string, initialValue: T, hasConsented: boolean) {
  const storedValueRef = useRef<T>(initialValue);
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === "undefined" || !hasConsented) {
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
      storedValueRef.current = value;
      return value;
    } catch (error) {
      console.error("Error reading from localStorage", error);
      storedValueRef.current = initialValue;
      return initialValue;
    }
  });

  useEffect(() => {
    if (hasConsented) {
      try {
        const item = window.localStorage.getItem(key);
        if (item) {
          const localStorageValue = JSON.parse(item);
          // Only update if localStorage has a different value than current state
          // This prevents overwriting newer state with stale localStorage data
          setStoredValue(prevValue => {
            // If localStorage is different from current state, use localStorage
            // Otherwise keep the current state (which might be more recent)
            return JSON.stringify(localStorageValue) !== JSON.stringify(prevValue) 
              ? localStorageValue 
              : prevValue;
          });
        }
      } catch (error) {
        console.error("Error reading from localStorage", error);
      }
    }
  }, [key, hasConsented]);

  // Update ref when storedValue changes
  useEffect(() => {
    storedValueRef.current = storedValue;
  }, [storedValue]);

  const setValue = useCallback((value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValueRef.current) : value;
      storedValueRef.current = valueToStore;
      setStoredValue(valueToStore);
      if (typeof window !== "undefined" && hasConsented) {
        try {
          window.localStorage.setItem(key, JSON.stringify(valueToStore));
        } catch (storageError) {
          console.error("Error writing to localStorage:", storageError);
        }
      } else {
        console.log("Not writing to localStorage - hasConsented:", hasConsented, "window:", typeof window);
      }
    } catch (error) {
      console.error("Error in setValue:", error);
    }
  }, [key, hasConsented]);

  return [storedValue, setValue] as const;
}
