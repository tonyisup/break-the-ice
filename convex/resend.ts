"use node";

import { v } from "convex/values";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { Resend } from "resend";

const RESEND_API_KEY = process.env.RESEND_API_TOKEN || process.env.RESEND_API_KEY;
const AUDIENCE_ID = "7c132839-8e29-4e94-a1d1-61c9f3c3d299"; // From n8n workflow
const NEWSLETTER_SEGMENT_ID = AUDIENCE_ID;

type ContactStatusResult = {
	subscribed: boolean | null;
	message?: string;
	contactId?: string;
	email?: string;
	error?: string;
};

type ContactMutationResult = {
	success: boolean;
	message?: string;
};

async function getAuthorizedEmail(ctx: ActionCtx, token?: string): Promise<string> {
	if (token) {
		const email = await ctx.runQuery(
			internal.internal.users.getEmailByNewsletterUnsubscribeToken,
			{ token },
		);
		if (!email) throw new Error("Invalid unsubscribe link");
		return email;
	}

	const identity = await ctx.auth.getUserIdentity();
	if (identity?.email) return identity.email.trim().toLowerCase();
	throw new Error("Not authenticated");
}

export const getContactStatus = action({
	args: { token: v.optional(v.string()) },
	returns: v.object({
		subscribed: v.union(v.boolean(), v.null()),
		message: v.optional(v.string()),
		contactId: v.optional(v.string()),
		email: v.optional(v.string()),
		error: v.optional(v.string()),
	}),
	handler: async (ctx, args): Promise<ContactStatusResult> => {
		const email = await getAuthorizedEmail(ctx, args.token);
		const user: { newsletterSubscriptionStatus?: "subscribed" | "unsubscribed" } | null = await ctx.runQuery(internal.internal.users.getUserByEmail, {
			email,
		});

		if (user?.newsletterSubscriptionStatus) {
			return {
				subscribed: user.newsletterSubscriptionStatus === "subscribed",
				email,
			};
		}

		if (!RESEND_API_KEY) {
			console.warn("RESEND_API_KEY is not set. Simulating subscription.");
			return { subscribed: true, email };
		}

		try {
			// First, find the contact in the audience
			const response = await fetch(`https://api.resend.com/audiences/${AUDIENCE_ID}/contacts`, {
				headers: {
					Authorization: `Bearer ${RESEND_API_KEY}`,
				},
			});

			if (!response.ok) {
				throw new Error(`Resend API failed: ${response.status}`);
			}

			const data = await response.json();
			const contact = data.data.find((c: any) => c.email.toLowerCase() === email);

			if (!contact) {
				return { subscribed: null, message: "Contact not found", email };
			}

			// If unsubscribed is true in Resend, return subscribed: false
			return {
				subscribed: contact.unsubscribed ? false : true,
				contactId: contact.id,
				email,
			};
		} catch (error) {
			console.error("Error fetching contact from Resend:", error);
			return { subscribed: null, error: "Failed to fetch status" };
		}
	},
});
export const unsubscribeContact = action({
	args: { token: v.optional(v.string()) },
	returns: v.object({
		success: v.boolean(),
		message: v.optional(v.string()),
	}),
	handler: async (ctx, args): Promise<ContactMutationResult> => {
		const email = await getAuthorizedEmail(ctx, args.token);
		if (!RESEND_API_KEY) {
			console.warn("RESEND_API_KEY is not set. Simulating unsubscribe.");
			await ctx.runMutation(internal.internal.users.setNewsletterStatus, {
				email,
				status: "unsubscribed",
			});
			return { success: true };
		}

		try {
			// 1. Get contact ID first
			const getResponse = await fetch(`https://api.resend.com/audiences/${AUDIENCE_ID}/contacts`, {
				headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
			});
			const getData = await getResponse.json();
			const contact = getData.data.find((c: any) => c.email.toLowerCase() === email);

			if (!contact) {
				await ctx.runMutation(internal.internal.users.setNewsletterStatus, {
					email,
					status: "unsubscribed",
				});
				return { success: true, message: "Contact not found in Resend; updated Convex status." };
			}

			// 2. Update contact to unsubscribed
			const updateResponse = await fetch(`https://api.resend.com/audiences/${AUDIENCE_ID}/contacts/${contact.id}`, {
				method: "PATCH",
				headers: {
					Authorization: `Bearer ${RESEND_API_KEY}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					unsubscribed: true,
				}),
			});

			if (!updateResponse.ok) {
				throw new Error(`Failed to update Resend contact: ${updateResponse.status}`);
			}

			await ctx.runMutation(internal.internal.users.setNewsletterStatus, {
				email,
				status: "unsubscribed",
			});

			return { success: true };
		} catch (error) {
			console.error("Error unsubscribing from Resend:", error);
			throw new Error("Failed to unsubscribe.");
		}
	},
});

export const subscribeContact = internalAction({
	args: { email: v.string() },
	returns: v.object({
		success: v.boolean(),
		message: v.optional(v.string()),
	}),
	handler: async (ctx, args): Promise<ContactMutationResult> => {
		const resendApiKey = process.env.RESEND_API_TOKEN || process.env.RESEND_API_KEY;
		if (!resendApiKey) {
			console.warn("RESEND_API_KEY is not set. Simulating subscribe.");
			await ctx.runMutation(internal.internal.users.setNewsletterStatus, {
				email: args.email,
				status: "subscribed",
			});
			return { success: true };
		}

		try {
			const email = args.email.trim().toLowerCase();
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
});
