/*
 * Who may be emailed from this deployment, and when.
 *
 * Only a deployment with NEWSLETTER_SENDING_ENABLED=true emails subscribers, and only that one
 * runs the hourly send. Production data copied into dev keeps its subscribers, so every other
 * deployment fails closed: it can only email the addresses in NEWSLETTER_TEST_RECIPIENTS, and
 * only when an admin sends by hand.
 */

export const NEWSLETTER_TIME_ZONE = "America/Los_Angeles";
export const DEFAULT_NEWSLETTER_SEND_HOUR = 10;

function normalizeEmail(email: string) {
	return email.trim().toLowerCase();
}

export function isLiveNewsletterDeployment() {
	return process.env.NEWSLETTER_SENDING_ENABLED === "true";
}

export function newsletterTestRecipients() {
	return new Set(
		(process.env.NEWSLETTER_TEST_RECIPIENTS ?? "")
			.split(",")
			.map(normalizeEmail)
			.filter(Boolean),
	);
}

export function canEmailNewsletterTo(email: string) {
	return isLiveNewsletterDeployment() || newsletterTestRecipients().has(normalizeEmail(email));
}

/** The Pacific hour this person's email goes out. */
export function newsletterSendHourFor(user: { newsletterSendHour?: number }) {
	return user.newsletterSendHour ?? DEFAULT_NEWSLETTER_SEND_HOUR;
}

export function assertValidNewsletterSendHour(hour: number) {
	if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
		throw new Error("Send hour must be a whole number from 0 to 23.");
	}
}

/** Someone who opted out is only subscribed again on an explicit admin confirmation. */
export function assertResubscribeConfirmed(
	user: { newsletterSubscriptionStatus?: "subscribed" | "unsubscribed" },
	status: "subscribed" | "unsubscribed",
	confirmed: boolean | undefined,
) {
	if (status === "subscribed" && user.newsletterSubscriptionStatus === "unsubscribed" && !confirmed) {
		throw new Error("This person unsubscribed. Confirm before subscribing them again.");
	}
}
