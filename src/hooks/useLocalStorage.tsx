import { useState, useCallback } from 'react';

export function useLocalStorage<T>(key: string, initialValue: T) {
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
