import { useState, useCallback } from "react";

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

      // Backwards compatibility for liked questions.
      // If the user has an old version of the "liked" list, it will be an array of objects.
      // The new version is an array of strings (the question IDs).
      // This code checks for the old format and migrates it to the new format.
      if (key === "likedQuestions" && Array.isArray(value) && value.length > 0 && typeof value[0] === "object" && value[0] !== null && "_id" in value[0]) {
        console.log("Old 'likedQuestions' format detected. Migrating...");
        value = value.map((item: any) => item._id);
        window.localStorage.setItem(key, JSON.stringify(value));
        console.log("Migration complete. New value:", value);
      }
      
      // If initialValue is an array, ensure the stored value is also an array.
      // This prevents crashes if the data in localStorage is corrupted.
      if (Array.isArray(initialValue) && !Array.isArray(value)) {
        console.log("Data in localStorage is corrupted (not an array). Returning initial value.");
        return initialValue;
      }
      
      // Additional validation for likedQuestions array
      if (key === "likedQuestions" && Array.isArray(value)) {
        // Filter out invalid entries (non-strings, empty strings, null, undefined)
        const validValues = value.filter(item => 
          typeof item === 'string' && item.length > 0 && item !== null && item !== undefined
        );
        
        if (validValues.length !== value.length) {
          console.log("Found invalid entries in likedQuestions. Cleaning up...");
          window.localStorage.setItem(key, JSON.stringify(validValues));
          value = validValues;
        }
      }
      
      // Additional validation for questionHistory array
      if (key === "questionHistory" && Array.isArray(value)) {
        // Filter out invalid question objects
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
            // If localStorage is full or unavailable, still update the state
            // but don't persist to localStorage
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
