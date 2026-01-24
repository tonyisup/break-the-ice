import { PlaceholderPage } from "@/components/PlaceholderPage";

export default function CookiePolicyPage() {
  return (
    <PlaceholderPage title="Cookie Policy">
      <div className="space-y-4 text-sm">
        <p>
          This website uses cookies to enhance your experience. This policy explains what cookies are and how we use them.
        </p>

        <h3 className="text-lg font-semibold mt-6 mb-2">Essential Cookies</h3>
        <p>These cookies are necessary for the website to function properly.</p>
        <ul className="list-disc list-inside ml-4 mb-4 space-y-1">
          <li><strong>cookieConsent</strong>: Stores your consent to our cookie policy.</li>
          <li><strong>sidebar:state</strong>: Stores the state of the sidebar (open/closed).</li>
          <li><strong>__clerk_db_jwt</strong>, <strong>__client_uat</strong>: Used by Clerk for secure authentication.</li>
        </ul>

        <h3 className="text-lg font-semibold mt-6 mb-2">Analytics Cookies</h3>
        <p>We use PostHog to understand how you use our website. These cookies are only set if you consent.</p>
        <ul className="list-disc list-inside ml-4 space-y-1">
          <li><strong>ph_phc_yvPURPmuOmgD7fy6Y854zBLP9sVU71T9ddHQJWVywqZ_posthog</strong>: Used by PostHog to identify unique users and track sessions.</li>
        </ul>
      </div>
    </PlaceholderPage>
  );
}
