import { createContext, useContext, ReactNode, useState, useEffect } from "react";
import { useAuth } from "@clerk/clerk-react";
import {
  StorageContextType,
  useLocalStorageContext,
  useConvexStorageContext,
} from "./useStorage";

const StorageContext = createContext<StorageContextType | undefined>(
  undefined
);

const AuthProvider = ({
  children,
  hasConsented,
}: {
  children: ReactNode;
  hasConsented: boolean;
}) => {
  const value = useConvexStorageContext(hasConsented);
  return (
    <StorageContext.Provider value={value}>{children}</StorageContext.Provider>
  );
};

const NonAuthProvider = ({
  children,
  hasConsented,
}: {
  children: ReactNode;
  hasConsented: boolean;
}) => {
  const value = useLocalStorageContext(hasConsented);
  return (
    <StorageContext.Provider value={value}>{children}</StorageContext.Provider>
  );
};

export const StorageProvider = ({ children }: { children: ReactNode }) => {
  const { isSignedIn } = useAuth();
  const cookieConsent = document.cookie
    .split("; ")
    .find((row) => row.startsWith("cookieConsent="))
    ?.split("=")[1];
  const [hasConsented, setHasConsented] = useState(cookieConsent === "true");

  useEffect(() => {
    const checkCookieConsent = () => {
      const currentConsent = document.cookie
        .split("; ")
        .find((row) => row.startsWith("cookieConsent="))
        ?.split("=")[1];
      if (currentConsent === "true" && !hasConsented) {
        setHasConsented(true);
      }
    };
    checkCookieConsent();
    const interval = setInterval(checkCookieConsent, 1000);
    return () => clearInterval(interval);
  }, [hasConsented]);

  if (isSignedIn) {
    return <AuthProvider hasConsented={hasConsented}>{children}</AuthProvider>;
  }
  return (
    <NonAuthProvider hasConsented={hasConsented}>{children}</NonAuthProvider>
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
