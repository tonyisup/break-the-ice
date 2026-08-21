import { useEffect } from "react";
import posthog from "posthog-js";
import { useStorageContext } from "../hooks/useStorageContext";
import { useLocation } from "react-router-dom";

const POSTHOG_KEY = "phc_yvPURPmuOmgD7fy6Y854zBLP9sVU71T9ddHQJWVywqZ";
let isInitialized = false;

export const AnalyticsManager = () => {
  const { hasConsented } = useStorageContext();
  const { pathname, search } = useLocation();

  useEffect(() => {
    if (hasConsented) {
      if (!isInitialized) {
        posthog.init(POSTHOG_KEY, {
          api_host: "https://us.i.posthog.com",
          person_profiles: "identified_only",
          capture_pageview: false,
        });
        isInitialized = true;
      }

      if (posthog.has_opted_out_capturing()) posthog.opt_in_capturing();
      posthog.capture("$pageview", { $current_url: window.location.href });
      return;
    }

    if (isInitialized && !posthog.has_opted_out_capturing()) {
      posthog.opt_out_capturing();
      posthog.reset();
    }
  }, [hasConsented, pathname, search]);

  return null;
};
