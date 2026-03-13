import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { ensureAdmin } from "../auth";
import { latestVersion } from "../lib/taxonomy";

const blueprintFields = {
  _id: v.id("promptBlueprints"),
  _creationTime: v.number(),
  slug: v.string(),
  version: v.number(),
  status: v.union(v.literal("draft"), v.literal("active"), v.literal("archived")),
  systemInstruction: v.string(),
  safetyChecklist: v.array(v.string()),
  qualityChecklist: v.array(v.string()),
  outputFormatInstruction: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
};

export const listBlueprints = query({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(v.object(blueprintFields)),
  handler: async (ctx, args) => {
    await ensureAdmin(ctx);
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
    const blueprints = await ctx.db.query("promptBlueprints").take(limit);
    const grouped = new Map<string, typeof blueprints>();
    for (const blueprint of blueprints) {
      if (!grouped.has(blueprint.slug)) grouped.set(blueprint.slug, []);
      grouped.get(blueprint.slug)!.push(blueprint);
    }

    return Array.from(grouped.values())
      .map((docs) => {
        const active = docs.find((doc) => doc.status === "active");
        return active ?? latestVersion(docs)!;
      })
      .sort((a, b) => a.slug.localeCompare(b.slug));
  },
});

export const getBlueprintVersions = query({
  args: { slug: v.string() },
  returns: v.array(v.object(blueprintFields)),
  handler: async (ctx, args) => {
    await ensureAdmin(ctx);
    const blueprints = await ctx.db
      .query("promptBlueprints")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .collect();
    return blueprints.sort((a, b) => b.version - a.version);
  },
});

export const createBlueprint = mutation({
  args: {
    slug: v.string(),
    systemInstruction: v.string(),
    safetyChecklist: v.array(v.string()),
    qualityChecklist: v.array(v.string()),
    outputFormatInstruction: v.string(),
  },
  returns: v.id("promptBlueprints"),
  handler: async (ctx, args) => {
    await ensureAdmin(ctx);
    const existing = await ctx.db
      .query("promptBlueprints")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .collect();
    const nextVersion = (latestVersion(existing)?.version ?? 0) + 1;
    const now = Date.now();
    return await ctx.db.insert("promptBlueprints", {
      slug: args.slug,
      version: nextVersion,
      status: "draft",
      systemInstruction: args.systemInstruction,
      safetyChecklist: args.safetyChecklist,
      qualityChecklist: args.qualityChecklist,
      outputFormatInstruction: args.outputFormatInstruction,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateBlueprint = mutation({
  args: {
    _id: v.id("promptBlueprints"),
    systemInstruction: v.string(),
    safetyChecklist: v.array(v.string()),
    qualityChecklist: v.array(v.string()),
    outputFormatInstruction: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ensureAdmin(ctx);
    await ctx.db.patch(args._id, {
      systemInstruction: args.systemInstruction,
      safetyChecklist: args.safetyChecklist,
      qualityChecklist: args.qualityChecklist,
      outputFormatInstruction: args.outputFormatInstruction,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const activateBlueprint = mutation({
  args: { _id: v.id("promptBlueprints") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ensureAdmin(ctx);
    const blueprint = await ctx.db.get(args._id);
    if (!blueprint) throw new Error("Prompt blueprint not found");
    const siblings = await ctx.db
      .query("promptBlueprints")
      .withIndex("by_slug", (q) => q.eq("slug", blueprint.slug))
      .collect();

    for (const sibling of siblings) {
      if (sibling._id === args._id) continue;
      if (sibling.status === "active") {
        await ctx.db.patch(sibling._id, { status: "archived", updatedAt: Date.now() });
      }
    }

    await ctx.db.patch(args._id, { status: "active", updatedAt: Date.now() });
    return null;
  },
});

export const archiveBlueprint = mutation({
  args: { _id: v.id("promptBlueprints") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ensureAdmin(ctx);
    await ctx.db.patch(args._id, { status: "archived", updatedAt: Date.now() });
    return null;
  },
});
