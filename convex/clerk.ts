

import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Webhook } from "svix";

const normalizeBillingStatus = (subscription: any) => {
	switch (subscription?.status) {
		case "canceled":
		case "ended":
			return "canceled" as const;
	}

	const hasFreeTrial = Array.isArray(subscription?.subscriptionItems) &&
		subscription.subscriptionItems.some((item: any) => item?.isFreeTrial);

	if (hasFreeTrial) {
		return "trialing" as const;
	}

	switch (subscription?.status) {
		case "active":
			return "active" as const;
		case "past_due":
			return "past_due" as const;
		default:
			return "inactive" as const;
	}
};

const resolvePlanTier = (subscription: any) => {
	const activeItem = subscription?.subscriptionItems?.find((item: any) =>
		["active", "past_due", "upcoming", "incomplete"].includes(item?.status)
	);

	if (!activeItem) {
		return "free" as const;
	}

	if (activeItem?.plan?.isDefault) {
		return "free" as const;
	}

	return "team" as const;
};

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
			const { id, email_addresses, first_name, last_name, image_url } = event.data;
			const email = email_addresses[0]?.email_address;
			const name = `${first_name || ""} ${last_name || ""}`.trim();

			await ctx.runMutation(internal.internal.users.updateUserFromClerk, {
				clerkId: id,
				email,
				name,
				image: image_url,
			});
		}

		if (eventType.startsWith("subscription.")) {
			const subscription = event.data;
			const activeItem = subscription?.subscriptionItems?.find((item: any) =>
				["active", "past_due", "upcoming", "incomplete"].includes(item?.status)
			) ?? subscription?.subscriptionItems?.[0];

			const planTier = resolvePlanTier(subscription);
			const billingStatus = normalizeBillingStatus(subscription);
			const payerType = activeItem?.plan?.forPayerType;

			if (payerType === "org" && subscription?.payerId) {
				await ctx.runMutation(internal.internal.users.syncOrganizationSubscription, {
					clerkOrganizationId: subscription.payerId,
					planTier,
					billingStatus,
					clerkCustomerId: subscription.customerId,
					clerkSubscriptionId: subscription.id,
				});
			} else if (payerType === "user" && subscription?.payerId) {
				await ctx.runMutation(internal.internal.users.syncUserSubscription, {
					clerkUserId: subscription.payerId,
					billingStatus,
					billingSubjectType: "user",
					clerkCustomerId: subscription.customerId,
					clerkSubscriptionId: subscription.id,
				});
			}
		}

		return new Response("Webhook processed", { status: 200 });
	} catch (err) {
		console.error("Webhook processing failed", err);
		return new Response("Webhook processing failed", { status: 400 });
	}
});
