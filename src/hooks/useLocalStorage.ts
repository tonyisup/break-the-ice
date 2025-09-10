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
        console.log("Data in localStorage is corrupted. Returning initial value.");
        return initialValue;
      }
      return value;
    } catch (error) {
      console.error("Error reading from localStorage", error);
      return initialValue;
    }
  });

  const setValue = useCallback((value: T | ((val: T) => T)) => {
    try {
      setStoredValue(currentStoredValue => {
        const valueToStore = value instanceof Function ? value(currentStoredValue) : value;
        if (typeof window !== "undefined") {
          window.localStorage.setItem(key, JSON.stringify(valueToStore));
        }
        return valueToStore;
      });
    } catch (error) {
      console.error(error);
    }
  }, [key]);

  return [storedValue, setValue] as const;
}
