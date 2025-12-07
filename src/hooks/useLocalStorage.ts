import { useState, useCallback, useEffect, useRef } from "react";

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
      return JSON.parse(item);
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
          setStoredValue(prevValue => {
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
