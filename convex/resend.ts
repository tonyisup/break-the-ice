"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const AUDIENCE_ID = "7c132839-8e29-4e94-a1d1-61c9f3c3d299"; // From n8n workflow

export const getContactStatus = action({
	args: { email: v.string() },
	handler: async (ctx, args) => {
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
				return { subscribed: false, message: "Contact not found" };
			}

			// If unsubscribed is true in Resend, return subscribed: false
			return {
				subscribed: !contact.unsubscribed,
				contactId: contact.id
			};
		} catch (error) {
			console.error("Error fetching contact from Resend:", error);
			return { subscribed: false, error: "Failed to fetch status" };
		}
	},
});

export const unsubscribeContact = action({
	args: { email: v.string() },
	handler: async (ctx, args) => {
		if (!RESEND_API_KEY) {
			console.warn("RESEND_API_KEY is not set. Simulating unsubscribe.");
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
				return { success: false, message: "Contact not found" };
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

			return { success: true };
		} catch (error) {
			console.error("Error unsubscribing from Resend:", error);
			throw new Error("Failed to unsubscribe.");
		}
	},
});

export const subscribeContact = action({
	args: { email: v.string() },
	handler: async (ctx, args) => {
		if (!RESEND_API_KEY) {
			console.warn("RESEND_API_KEY is not set. Simulating subscribe.");
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
			return { success: true };
		} catch (error) {
			console.error("Error subscribing to Resend:", error);
			throw new Error("Failed to subscribe.");
		}
	}
});
