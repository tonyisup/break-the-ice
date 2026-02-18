import { v } from "convex/values";
import { query } from "../_generated/server";

const publicToneFields = {
	_id: v.id("tones"),
	_creationTime: v.number(),
	id: v.string(),
	name: v.string(),
	description: v.optional(v.string()),
	promptGuidanceForAI: v.string(),
	color: v.string(),
	icon: v.string(),
	order: v.optional(v.float64()),
};

export const getTone = query({
	args: { id: v.string() },
	returns: v.union(v.object(publicToneFields), v.null()),
	handler: async (ctx, args) => {
		const tone = await ctx.db.query("tones")
			.withIndex("by_my_id", (q) => q.eq("id", args.id))
			.unique();
		if (!tone) {
			return null;
		}
		const { organizationId: _o, embedding: _e, ...rest } = tone;
		return rest;
	},
});

export const getToneById = query({
	args: { id: v.id("tones") },
	returns: v.union(v.object(publicToneFields), v.null()),
	handler: async (ctx, args) => {
		const tone = await ctx.db.get(args.id);
		if (!tone) {
			return null;
		}
		const { organizationId: _o, embedding: _e, ...rest } = tone;
		return rest;
	},
});

// Get all available tones
export const getTones = query({
	args: {
		organizationId: v.optional(v.id("organizations")),
	},
	returns: v.array(v.object(publicToneFields)),
	handler: async (ctx, args) => {
		const tones = await ctx.db
			.query("tones")
			.withIndex("by_order")
			.order("asc")
			.filter((q) => q.eq(q.field("organizationId"), args.organizationId))
			.collect();
		return tones.map(({ organizationId: _o, embedding: _e, ...rest }) => rest);
	},
});

export const getFilteredTones = query({
	args: {
		excluded: v.array(v.string()),
		organizationId: v.optional(v.id("organizations")),
	},
	returns: v.array(v.object(publicToneFields)),
	handler: async (ctx, args) => {
		const tones = await ctx.db.query("tones")
			.withIndex("by_order")
			.order("asc")
			.filter((q) => q.eq(q.field("organizationId"), args.organizationId))
			.filter((q) => q.and(...args.excluded.map(toneId => q.neq(q.field("id"), toneId))))
			.collect();
		return tones.map(({ organizationId: _o, embedding: _e, ...rest }) => rest);
	},
});

export const getRandomTone = query({
	args: { seed: v.optional(v.number()) },
	returns: v.object(publicToneFields),
	handler: async (ctx, args) => {
		const tones = await ctx.db.query("tones").withIndex("by_order").order("asc").collect();
		if (tones.length === 0) {
			throw new Error("No tones found in the database");
		}

		const seed = args.seed ?? Math.random() * 0xFFFFFFFF;
		const mulberry32 = (a: number) => {
			return () => {
				let t = a += 0x6D2B79F5;
				t = Math.imul(t ^ t >>> 15, t | 1);
				t ^= t + Math.imul(t ^ t >>> 7, t | 61);
				return ((t ^ t >>> 14) >>> 0) / 4294967296;
			}
		};
		const rng = mulberry32(seed);

		const index = Math.floor(rng() * tones.length);
		const randomTone = tones[index];
		const { organizationId: _o, embedding: _e, ...rest } = randomTone;
		return rest;
	},
});

export const getRandomToneForUser = query({
	args: { userId: v.id("users") },
	returns: v.object(publicToneFields),
	handler: async (ctx, args) => {
		const user = await ctx.db.get(args.userId);
		if (!user) {
			throw new Error("User not found");
		}

		const allTones = await ctx.db.query("tones").withIndex("by_order").order("asc").collect();

		const userHiddenTones = await ctx.db.query("userTones")
			.withIndex("by_userId_status", (q) => q
				.eq("userId", args.userId)
				.eq("status", "hidden")
			)
			.collect();

		const hiddenIds = new Set(userHiddenTones.map(t => t.toneId));
		const tones = allTones.filter(t => !hiddenIds.has(t._id));

		if (tones.length === 0) {
			throw new Error("No tones available for user");
		}

		const seed = Math.random() * 0xFFFFFFFF;
		const mulberry32 = (a: number) => {
			return () => {
				let t = a += 0x6D2B79F5;
				t = Math.imul(t ^ t >>> 15, t | 1);
				t ^= t + Math.imul(t ^ t >>> 7, t | 61);
				return ((t ^ t >>> 14) >>> 0) / 4294967296;
			}
		};
		const rng = mulberry32(seed);

		const index = Math.floor(rng() * tones.length);
		const randomTone = tones[index];
		const { organizationId: _o, embedding: _e, ...rest } = randomTone;
		return rest;
	},
});
