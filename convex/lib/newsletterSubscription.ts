"use node";

import { Resend, type ErrorResponse } from "resend";
import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import { getResendContactsApiKey } from "./resend";

const NEWSLETTER_SEGMENT_ID = "7c132839-8e29-4e94-a1d1-61c9f3c3d299";

export type NewsletterSubscriptionResult = {
	success: boolean;
	message?: string;
};

function throwResendContactError(operation: string, error: ErrorResponse | null): void {
	if (!error) return;

	const permissionHint =
		error.name === "restricted_api_key"
			? " Configure RESEND_CONTACTS_API_KEY or RESEND_API_KEY with a full-access Resend key."
			: "";
	throw new Error(
		`Resend ${operation} failed (${error.name}, status ${error.statusCode ?? "unavailable"}): ${error.message}${permissionHint}`,
	);
}

export async function subscribeNewsletterContact(
	ctx: ActionCtx,
	rawEmail: string,
): Promise<NewsletterSubscriptionResult> {
	const resendApiKey = getResendContactsApiKey();
	if (!resendApiKey) {
		console.error("A Resend contacts API key is not set.");
		return {
			success: false,
			message: "Newsletter subscription is unavailable.",
		};
	}

	try {
		const email = rawEmail.trim().toLowerCase();
		const resend = new Resend(resendApiKey);
		const existingContact = await resend.contacts.get({ email });

		if (existingContact.data) {
			const updatedContact = await resend.contacts.update({
				email,
				unsubscribed: false,
			});
			throwResendContactError("contact update", updatedContact.error);

			const segmentMembership = await resend.contacts.segments.add({
				email,
				segmentId: NEWSLETTER_SEGMENT_ID,
			});
			throwResendContactError("segment assignment", segmentMembership.error);
		} else {
			if (existingContact.error?.statusCode !== 404) {
				throwResendContactError("contact lookup", existingContact.error);
			}

			const createdContact = await resend.contacts.create({
				email,
				unsubscribed: false,
				segments: [{ id: NEWSLETTER_SEGMENT_ID }],
			});
			throwResendContactError("contact creation", createdContact.error);
		}

		await ctx.runMutation(internal.internal.users.setNewsletterStatus, {
			email,
			status: "subscribed",
		});
		return { success: true };
	} catch (error) {
		console.error("Error subscribing to Resend:", error);
		throw new Error("Failed to subscribe.");
	}
}
