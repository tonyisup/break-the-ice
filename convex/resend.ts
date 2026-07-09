"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";

const RESEND_API_KEY = process.env.RESEND_API_TOKEN || process.env.RESEND_API_KEY;
const AUDIENCE_ID = "7c132839-8e29-4e94-a1d1-61c9f3c3d299"; // From n8n workflow

type ContactStatusResult = {
	subscribed: boolean | null;
	message?: string;
	contactId?: string;
	error?: string;
};

type ContactMutationResult = {
	success: boolean;
	message?: string;
};

export const getContactStatus = action({
	args: { email: v.string() },
	returns: v.object({
		subscribed: v.union(v.boolean(), v.null()),
		message: v.optional(v.string()),
		contactId: v.optional(v.string()),
		error: v.optional(v.string()),
	}),
	handler: async (ctx, args): Promise<ContactStatusResult> => {
		const user: { newsletterSubscriptionStatus?: "subscribed" | "unsubscribed" } | null = await ctx.runQuery(internal.internal.users.getUserByEmail, {
			email: args.email,
		});

		if (user?.newsletterSubscriptionStatus) {
			return {
				subscribed: user.newsletterSubscriptionStatus === "subscribed",
			};
		}

		if (!RESEND_API_KEY) {
			console.warn("RESEND_API_KEY is not set. Simulating subscription.");
			return { subscribed: true };
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
			const contact = data.data.find((c: any) => c.email.toLowerCase() === args.email.toLowerCase());

			if (!contact) {
				return { subscribed: null, message: "Contact not found" };
			}

			// If unsubscribed is true in Resend, return subscribed: false
			return {
				subscribed: contact.unsubscribed ? false : true,
				contactId: contact.id
			};
		} catch (error) {
			console.error("Error fetching contact from Resend:", error);
			return { subscribed: null, error: "Failed to fetch status" };
		}
	},
});

export const unsubscribeContact = action({
	args: { email: v.string() },
	returns: v.object({
		success: v.boolean(),
		message: v.optional(v.string()),
	}),
	handler: async (ctx, args): Promise<ContactMutationResult> => {
		if (!RESEND_API_KEY) {
			console.warn("RESEND_API_KEY is not set. Simulating unsubscribe.");
			await ctx.runMutation(internal.internal.users.setNewsletterStatus, {
				email: args.email,
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
			const contact = getData.data.find((c: any) => c.email.toLowerCase() === args.email.toLowerCase());

			if (!contact) {
				await ctx.runMutation(internal.internal.users.setNewsletterStatus, {
					email: args.email,
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
				email: args.email,
				status: "unsubscribed",
			});

			return { success: true };
		} catch (error) {
			console.error("Error unsubscribing from Resend:", error);
			throw new Error("Failed to unsubscribe.");
		}
	},
});

export const subscribeContact = action({
	args: { email: v.string() },
	returns: v.object({
		success: v.boolean(),
		message: v.optional(v.string()),
	}),
	handler: async (ctx, args): Promise<ContactMutationResult> => {
		if (!RESEND_API_KEY) {
			console.warn("RESEND_API_KEY is not set. Simulating subscribe.");
			await ctx.runMutation(internal.internal.users.setNewsletterStatus, {
				email: args.email,
				status: "subscribed",
			});
			return { success: true };
		}

		try {
			// Check if exists
			const getResponse = await fetch(`https://api.resend.com/audiences/${AUDIENCE_ID}/contacts`, {
				headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
			});
			const getData = await getResponse.json();
			const contact = getData.data.find((c: any) => c.email.toLowerCase() === args.email.toLowerCase());

			if (contact) {
				// Update existing
				await fetch(`https://api.resend.com/audiences/${AUDIENCE_ID}/contacts/${contact.id}`, {
					method: "PATCH",
					headers: {
						Authorization: `Bearer ${RESEND_API_KEY}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						unsubscribed: false,
					}),
				});
			} else {
				// Create new
				await fetch(`https://api.resend.com/audiences/${AUDIENCE_ID}/contacts`, {
					method: "POST",
					headers: {
						Authorization: `Bearer ${RESEND_API_KEY}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						email: args.email,
						unsubscribed: false,
					}),
				});
			}
			await ctx.runMutation(internal.internal.users.setNewsletterStatus, {
				email: args.email,
				status: "subscribed",
			});
			return { success: true };
		} catch (error) {
			console.error("Error subscribing to Resend:", error);
			throw new Error("Failed to subscribe.");
		}
	}
});
