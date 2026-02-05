import { PlaceholderPage } from "@/components/PlaceholderPage";

export default function PrivacyPolicyPage() {
  return (
    <PlaceholderPage title="Privacy Policy">
      <div className="space-y-6">
        <section>
          <h2 className="text-xl font-semibold mb-2">1. Information We Collect</h2>
          <p>
            We collect information to provide a better experience. This includes:
          </p>
          <ul className="list-disc ml-6 mt-2 space-y-1">
            <li><strong>Account Information:</strong> Managed via <strong>Clerk</strong>, including your name, email, and profile image.</li>
            <li><strong>Payment Information:</strong> Processed securely via <strong>Stripe</strong>. We do not store your credit card details on our servers.</li>
            <li><strong>Interaction Data:</strong> We track question likes, skips, and views using <strong>PostHog</strong> to improve our AI recommendations.</li>
            <li><strong>Content:</strong> Questions you submit or generate using <strong>OpenRouter</strong> (AI).</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">2. How We Use Your Data</h2>
          <p>
            Your data is used to personalize your experience, process transactions, and improve our services. AI generation is powered by <strong>OpenRouter</strong>; while your prompts may be processed by AI models, we do not use your personal data to train these models.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">3. Third-Party Services</h2>
          <p>
            We partner with several trusted services to run Break the Ice:
          </p>
          <ul className="list-disc ml-6 mt-2 space-y-1">
            <li><strong>Clerk:</strong> For secure authentication.</li>
            <li><strong>Stripe:</strong> For billing and subscription management.</li>
            <li><strong>OpenRouter:</strong> For powering our AI features.</li>
            <li><strong>PostHog:</strong> For analyzing app performance and issues.</li>
            <li><strong>Resend:</strong> For delivering transactional emails and newsletters.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">4. Marketing & Newsletters</h2>
          <p>
            We only send marketing communications via <strong>Resend</strong> if you have explicitly opted in. You can unsubscribe at any time using the link in our emails or through your account settings. Once unsubscribed, your email is removed from our marketing lists immediately.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">5. Data Sharing & Selling</h2>
          <p>
            We do not sell, trade, or rent your personal identification information to others. We only share data with the third-party service providers listed above as necessary to provide our services.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">6. Cookies</h2>
          <p>
            We use cookies to maintain your session and improve site functionality. For detailed information, please refer to our <a href="/cookies" className="text-blue-500 hover:underline">Cookie Policy</a>.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">7. Your Rights & Access</h2>
          <p>
            You have the right to access, correct, or delete your personal data.
          </p>
          <ul className="list-disc ml-6 mt-2 space-y-1">
            <li><strong>Logged-in Users:</strong> You can submit data requests or feedback directly via the tool on the Home Page.</li>
            <li><strong>Guests:</strong> You can clear your local storage at any time to remove temporary interaction data.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">8. Data Retention</h2>
          <p>
            We retain account and organization data for 30 days following deactivation/deletion. Interaction analytics are retained for 90 days before being aggregated or deleted. For more details, see our <a href="/data-retention" className="text-blue-500 hover:underline">Data Retention Policy</a>.
          </p>
        </section>
      </div>
    </PlaceholderPage>
  );
}
