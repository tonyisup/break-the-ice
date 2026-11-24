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

type SubscriptionStatus = "subscribed" | "unsubscribed";
type SubscriptionTarget = { email?: string; newsletterSubscriptionStatus?: SubscriptionStatus };

/**
 * What an admin must confirm before subscribing this person, or null when nothing needs
 * confirming. Anyone not already subscribed didn't ask for the email: they opted out, or
 * never chose.
 */
export function subscribeConfirmationPrompt(user: SubscriptionTarget, status: SubscriptionStatus) {
	if (status !== "subscribed" || user.newsletterSubscriptionStatus === "subscribed") return null;
	const who = user.email ?? "This person";
	return user.newsletterSubscriptionStatus === "unsubscribed"
		? `${who} unsubscribed earlier. Subscribe them again anyway?`
		: `${who} never signed up for the newsletter. Subscribe them anyway?`;
}

/** An admin subscribes someone only with an email to send to, and only once confirmed. */
export function assertSubscribeAllowed(
	user: SubscriptionTarget,
	status: SubscriptionStatus,
	confirmed: boolean | undefined,
) {
	if (!subscribeConfirmationPrompt(user, status)) return;
	if (!user.email) {
		throw new Error("This user has no email address.");
	}
	if (!confirmed) {
		throw new Error(
			user.newsletterSubscriptionStatus === "unsubscribed"
				? "This person unsubscribed. Confirm before subscribing them again."
				: "This person never signed up. Confirm before subscribing them.",
		);
	}
}
