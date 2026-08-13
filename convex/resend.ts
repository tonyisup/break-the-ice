"use node";

import { v } from "convex/values";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { subscribeNewsletterContact } from "./lib/newsletterSubscription";
import { getResendContactsApiKey } from "./lib/resend";

const AUDIENCE_ID = "7c132839-8e29-4e94-a1d1-61c9f3c3d299"; // From n8n workflow

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
		const resendApiKey = getResendContactsApiKey();
		const user: { newsletterSubscriptionStatus?: "subscribed" | "unsubscribed" } | null = await ctx.runQuery(internal.internal.users.getUserByEmail, {
			email,
		});

		if (user?.newsletterSubscriptionStatus) {
			return {
				subscribed: user.newsletterSubscriptionStatus === "subscribed",
				email,
			};
		}

		if (!resendApiKey) {
			console.warn("A Resend contacts API key is not set. Simulating subscription.");
			return { subscribed: true, email };
		}

		try {
			// First, find the contact in the audience
			const response = await fetch(`https://api.resend.com/audiences/${AUDIENCE_ID}/contacts`, {
				headers: {
					Authorization: `Bearer ${resendApiKey}`,
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
		const resendApiKey = getResendContactsApiKey();
		if (!resendApiKey) {
			console.warn("A Resend contacts API key is not set. Simulating unsubscribe.");
			await ctx.runMutation(internal.internal.users.setNewsletterStatus, {
				email,
				status: "unsubscribed",
			});
			return { success: true };
		}

		try {
			// 1. Get contact ID first
			const getResponse = await fetch(`https://api.resend.com/audiences/${AUDIENCE_ID}/contacts`, {
				headers: { Authorization: `Bearer ${resendApiKey}` },
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
					Authorization: `Bearer ${resendApiKey}`,
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
	handler: async (ctx, args): Promise<ContactMutationResult> =>
		subscribeNewsletterContact(ctx, args.email),
});
