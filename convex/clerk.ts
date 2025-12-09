

import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Webhook } from "svix";

export const usersWebhook = httpAction(async (ctx, request) => {
	const payloadString = await request.text();
	const headerPayload = request.headers;

	try {
		const svix_id = headerPayload.get("svix-id");
		const svix_timestamp = headerPayload.get("svix-timestamp");
		const svix_signature = headerPayload.get("svix-signature");

		if (!svix_id || !svix_timestamp || !svix_signature) {
			return new Response("Error occured -- no svix headers", {
				status: 400,
			});
		}

		const start = Date.now();
		const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
		if (!webhookSecret) {
			throw new Error("CLERK_WEBHOOK_SECRET is not defined");
		}

		const wh = new Webhook(webhookSecret);
		const event = wh.verify(payloadString, {
			"svix-id": svix_id,
			"svix-timestamp": svix_timestamp,
			"svix-signature": svix_signature,
		}) as any;

		const eventType = event.type;
		console.log(`Received Clerk webhook: ${eventType}`);

		if (eventType === "user.created" || eventType === "user.updated") {
			const { id, email_addresses, first_name, last_name, image_url, public_metadata } = event.data;
			const email = email_addresses[0]?.email_address;
			const name = `${first_name || ""} ${last_name || ""}`.trim();
			const subscriptionTier = public_metadata?.subscriptionTier || "free";

			await ctx.runMutation(internal.users.updateUserFromClerk, {
				clerkId: id,
				email,
				name,
				image: image_url,
				subscriptionTier,
			});
		}

		return new Response("Webhook processed", { status: 200 });
	} catch (err) {
		console.error("Webhook processing failed", err);
		return new Response("Webhook processing failed", { status: 400 });
	}
});
