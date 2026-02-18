import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

export const removeOldTimestampFields = internalMutation({
	args: {},
	returns: v.null(),
	handler: async (ctx) => {
		// Clean up feedback
		const feedbacks = await ctx.db.query("feedback").collect();
		for (const f of feedbacks) {
			if ("createdAt" in f) {
				const { createdAt, _id, _creationTime, ...rest } = f as any;
				await ctx.db.replace(f._id, rest);
			}
		}

		// Clean up pendingSubscriptions
		const subscriptions = await ctx.db.query("pendingSubscriptions").collect();
		for (const s of subscriptions) {
			if ("createdAt" in s) {
				const { createdAt, _id, _creationTime, ...rest } = s as any;
				await ctx.db.replace(s._id, rest);
			}
		}

		// Clean up duplicateDetectionProgress
		const progress = await ctx.db.query("duplicateDetectionProgress").collect();
		for (const p of progress) {
			if ("startedAt" in p) {
				const { startedAt, _id, _creationTime, ...rest } = p as any;
				await ctx.db.replace(p._id, rest);
			}
		}

		// Clean up duplicateDetections
		const detections = await ctx.db.query("duplicateDetections").collect();
		for (const d of detections) {
			if ("detectedAt" in d) {
				const { detectedAt, _id, _creationTime, ...rest } = d as any;
				await ctx.db.replace(d._id, rest);
			}
		}

		return null;
	},
});
