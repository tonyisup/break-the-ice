import { PlaceholderPage } from "@/components/PlaceholderPage";

export default function DataRetentionPage() {
  return (
    <PlaceholderPage title="Data Retention Policy">
      <div className="space-y-6">
        <section>
          <h2 className="text-xl font-semibold mb-2">User Account Data</h2>
          <p>
            Personal information associated with your user profile (such as name and email) is retained for as long as your account is active. When you delete your account, we delete your profile, your settings, your liked, seen and hidden questions, and any question you wrote that hasn't been published from our primary databases right away. A question you wrote that was published to the shared library stays there without your name, and usage records we keep for counting (such as how often a question was liked) are kept without your account linked to them. Messages you sent us through the feedback form and our records of AI requests, which can include the wording of questions, are also kept without your account linked to them. If we reviewed a question you wrote, our record of that review, including the question's wording, is kept. A deleted account can't be recovered.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Analytics & Interaction Data</h2>
          <p>
            We collect granular interaction data (such as "seen", "liked", and "hidden" statuses of questions) to improve your personalized experience. This granular data is retained for 90 days, after which it is either deleted or aggregated into anonymized statistics that can no longer be linked to an individual user.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Newsletter Subscriptions</h2>
          <p>
            If you choose to unsubscribe from our newsletter, your contact information is removed from our mailing lists immediately. We do not maintain a suppression list; however, this means you are free to resubscribe at any time in the future should you choose to do so.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Data Deletion Procedures</h2>
          <p>
            Data is deleted through automated processes and manual purges. Please note that data may persist in our secure backups for a limited period after deletion from primary systems, as part of our standard disaster recovery procedures.
          </p>
        </section>
      </div>
    </PlaceholderPage>
  );
}
