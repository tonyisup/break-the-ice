import { Triggers } from "convex-helpers/server/triggers";
import { DataModel } from "./_generated/dataModel";

const triggers = new Triggers<DataModel>();

triggers.register("users", async (ctx, change) => {
	if (change.operation === "delete") {
		const userId = change.id;

		// Delete userQuestions
		const userQuestions = await ctx.db
			.query("userQuestions")
			.withIndex("by_userId", (q) => q.eq("userId", userId))
			.collect();
		for (const uq of userQuestions) {
			await ctx.db.delete(uq._id);
		}

		// Delete userStyles
		const userStyles = await ctx.db
			.query("userStyles")
			.withIndex("by_userId", (q) => q.eq("userId", userId))
			.collect();
		for (const us of userStyles) {
			await ctx.db.delete(us._id);
		}

		// Delete userTones
		const userTones = await ctx.db
			.query("userTones")
			.withIndex("by_userId", (q) => q.eq("userId", userId))
			.collect();
		for (const ut of userTones) {
			await ctx.db.delete(ut._id);
		}

		// Delete questions authored by user
		const personalQuestions = await ctx.db
			.query("questions")
			.withIndex("by_author", (q) => q.eq("authorId", userId).eq("status", "private"))
			.collect();
		for (const q of personalQuestions) {
			await ctx.db.delete(q._id);
		}

		const pendingQuestions = await ctx.db
			.query("questions")
			.withIndex("by_author", (q) => q.eq("authorId", userId).eq("status", "pending"))
			.collect();
		for (const q of pendingQuestions) {
			await ctx.db.delete(q._id);
		}
		const approvedQuestions = await ctx.db
			.query("questions")
			.withIndex("by_author", (q) => q.eq("authorId", userId).eq("status", "public"))
			.collect();
		for (const q of approvedQuestions) {
			await ctx.db.patch(q._id, {
				authorId: undefined,
			});
		}
	}
});
