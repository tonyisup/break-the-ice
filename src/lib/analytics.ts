type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;
type PostHogClient = typeof import("posthog-js")["default"];

const POSTHOG_KEY = "phc_yvPURPmuOmgD7fy6Y854zBLP9sVU71T9ddHQJWVywqZ";

let analyticsEnabled = false;
let posthogClient: PostHogClient | null = null;
let posthogPromise: Promise<PostHogClient> | null = null;
let posthogInitialized = false;

const loadPostHog = () => {
  posthogPromise ??= import("posthog-js").then(({ default: posthog }) => {
    posthogClient = posthog;
    return posthog;
  });
  return posthogPromise;
};

export const enableAnalytics = async () => {
  analyticsEnabled = true;
  const posthog = await loadPostHog();

  if (!analyticsEnabled) return;

  if (!posthogInitialized) {
    posthog.init(POSTHOG_KEY, {
      api_host: "https://us.i.posthog.com",
      person_profiles: "identified_only",
      capture_pageview: false,
    });
    posthogInitialized = true;
  }

  if (posthog.has_opted_out_capturing()) posthog.opt_in_capturing();
};

export const disableAnalytics = () => {
  analyticsEnabled = false;

  if (posthogClient && posthogInitialized && !posthogClient.has_opted_out_capturing()) {
    posthogClient.opt_out_capturing();
    posthogClient.reset();
  }
};

export const captureAnalytics = (
  event: string,
  properties?: AnalyticsProperties,
) => {
  if (!analyticsEnabled || !posthogClient || !posthogInitialized) return;
  posthogClient.capture(event, properties);
};
