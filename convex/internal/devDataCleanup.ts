import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { isLiveNewsletterDeployment, newsletterTestRecipients } from "../lib/newsletterSending";

/*
 * Run after copying production data into dev.
 *
 * Sign-in: removes Clerk identities that came from another Clerk instance. Emails stay, so the
 * next dev sign-in with the same email links back to that person's row and data.
 *
 * Newsletter: clears the copied subscriptions, unsubscribe tokens, send times and pending
 * sign-ups. It never calls Resend: contacts there are shared with production, so changing one
 * would unsubscribe a real reader.
 *
 * It refuses to run unless DEV_DATA_CLEANUP_ENABLED=true, which must never be set on production,
 * and it only reports what it would do unless dryRun is false.
 */

function hasIdentityFromThisClerk(user: Doc<"users">, issuer: string) {
	return user.tokenIdentifier?.startsWith(`${issuer}|`) ?? false;
}

function hasClerkData(user: Doc<"users">) {
	return Boolean(
		user.clerkId || user.tokenIdentifier || user.clerkCustomerId || user.clerkSubscriptionId,
	);
}

function hasNewsletterData(user: Doc<"users">) {
	return (
		user.newsletterSubscriptionStatus !== undefined ||
		user.newsletterUnsubscribeToken !== undefined ||
		user.newsletterSendHour !== undefined
	);
}

export const resetCopiedProductionData = internalMutation({
	args: {
		dryRun: v.optional(v.boolean()),
		keepEmails: v.optional(v.array(v.string())),
	},
	returns: v.object({
		dryRun: v.boolean(),
		identitiesCleared: v.number(),
		identitiesKept: v.number(),
		subscriptionsCleared: v.number(),
		subscriptionsKept: v.number(),
		pendingSignupsRemoved: v.number(),
	}),
	handler: async (ctx, args) => {
		if (process.env.DEV_DATA_CLEANUP_ENABLED !== "true" || isLiveNewsletterDeployment()) {
			throw new Error("Dev data clean-up is not enabled on this deployment.");
		}
		const issuer = process.env.CLERK_JWT_ISSUER_DOMAIN?.trim().replace(/\/+$/, "");
		if (!issuer) {
			throw new Error("CLERK_JWT_ISSUER_DOMAIN is not set on this deployment.");
		}

		const dryRun = args.dryRun ?? true;
		const keep = newsletterTestRecipients();
		for (const email of args.keepEmails ?? []) keep.add(email.trim().toLowerCase());

		let identitiesCleared = 0;
		let identitiesKept = 0;
		let subscriptionsCleared = 0;
		let subscriptionsKept = 0;

		for (const user of await ctx.db.query("users").collect()) {
			const patch: Partial<Doc<"users">> = {};

			if (hasIdentityFromThisClerk(user, issuer)) {
				identitiesKept++;
			} else if (hasClerkData(user)) {
				identitiesCleared++;
				patch.clerkId = undefined;
				patch.tokenIdentifier = undefined;
				patch.clerkCustomerId = undefined;
				patch.clerkSubscriptionId = undefined;
				patch.billingSubjectType = undefined;
				patch.billingStatus = "inactive";
			}

			if (hasNewsletterData(user)) {
				// Always dropped: a copied token would work against the production row.
				patch.newsletterUnsubscribeToken = undefined;
				if (user.email && keep.has(user.email.trim().toLowerCase())) {
					subscriptionsKept++;
				} else {
					subscriptionsCleared++;
					patch.newsletterSubscriptionStatus = undefined;
					patch.newsletterSendHour = undefined;
				}
			}

			if (!dryRun && Object.keys(patch).length > 0) {
				await ctx.db.patch(user._id, patch);
			}
		}

		const pendingSignups = await ctx.db.query("pendingSubscriptions").collect();
		if (!dryRun) {
			for (const signup of pendingSignups) await ctx.db.delete(signup._id);
		}

		return {
			dryRun,
			identitiesCleared,
			identitiesKept,
			subscriptionsCleared,
			subscriptionsKept,
			pendingSignupsRemoved: pendingSignups.length,
		};
	},
});
