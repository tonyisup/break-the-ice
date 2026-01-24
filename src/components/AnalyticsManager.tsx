import { useEffect } from "react";
import posthog from "posthog-js";
import { useStorageContext } from "../hooks/useStorageContext";

export const AnalyticsManager = () => {
  const { hasConsented } = useStorageContext();

  useEffect(() => {
    if (hasConsented) {
      posthog.init("phc_yvPURPmuOmgD7fy6Y854zBLP9sVU71T9ddHQJWVywqZ", {
        api_host: "https://us.i.posthog.com",
        person_profiles: "identified_only",
      });
    }
  }, [hasConsented]);

  return null;
};
