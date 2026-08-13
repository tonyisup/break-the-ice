"use node";

import { Resend } from "resend";
import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import { getResendApiKey } from "./resend";

const NEWSLETTER_SEGMENT_ID = "7c132839-8e29-4e94-a1d1-61c9f3c3d299";

export type NewsletterSubscriptionResult = {
	success: boolean;
	message?: string;
};

export async function subscribeNewsletterContact(
	ctx: ActionCtx,
	rawEmail: string,
): Promise<NewsletterSubscriptionResult> {
	const resendApiKey = getResendApiKey();
	if (!resendApiKey) {
		console.error("Resend API key is not set.");
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
			if (updatedContact.error) throw new Error(updatedContact.error.message);

			const segmentMembership = await resend.contacts.segments.add({
				email,
				segmentId: NEWSLETTER_SEGMENT_ID,
			});
			if (segmentMembership.error) throw new Error(segmentMembership.error.message);
		} else {
			if (existingContact.error?.statusCode !== 404) {
				throw new Error(existingContact.error?.message || "Failed to look up Resend contact.");
			}

			const createdContact = await resend.contacts.create({
				email,
				unsubscribed: false,
				segments: [{ id: NEWSLETTER_SEGMENT_ID }],
			});
			if (createdContact.error) throw new Error(createdContact.error.message);
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
