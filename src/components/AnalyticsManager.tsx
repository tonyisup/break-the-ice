import { useEffect } from "react";
import { useStorageContext } from "../hooks/useStorageContext";
import { useLocation } from "react-router-dom";
import { captureAnalytics, disableAnalytics, enableAnalytics } from "@/lib/analytics";

export const AnalyticsManager = () => {
  const { hasConsented } = useStorageContext();
  const { pathname, search } = useLocation();

  useEffect(() => {
    let cancelled = false;

    if (hasConsented) {
      void enableAnalytics().then(() => {
        if (cancelled) return;
        captureAnalytics("$pageview", {
          $current_url: window.location.href,
        });
      });
    } else {
      disableAnalytics();
    }

    return () => {
      cancelled = true;
    };
  }, [hasConsented, pathname, search]);

  return null;
};
