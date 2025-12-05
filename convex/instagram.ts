import { internalMutation, action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const DEFAULT_GRADIENTS = [
  ["#f6d365", "#fda085"],
  ["#84fab0", "#8fd3f4"],
  ["#a18cd1", "#fbc2eb"],
  ["#ff9a9e", "#fecfef"],
];

export const pickAndMarkQuestion = internalMutation({
  args: {},
  handler: async (ctx) => {
    // 1. Find a candidate question
    // Criteria: status="approved", has not been posted recently (or ever).

    // We use the compound index to find approved questions, sorted by lastPostedAt.
    // "Approved" questions that have never been posted will have `lastPostedAt` as undefined.
    // In Convex indexes, `undefined` / `null` values come first (ascending order).

    const candidate = await ctx.db
      .query("questions")
      .withIndex("by_status_and_last_posted", q => q.eq("status", "approved"))
      .first();

    if (!candidate) {
        console.log("No approved candidate found.");
        return null;
    }

    // 2. Mark it as posted
    await ctx.db.patch(candidate._id, {
        lastPostedAt: Date.now(),
    });

    // 3. Fetch Style and Tone details to get colors/names
    let style = null;
    if (candidate.style) {
        const styleDoc = await ctx.db.query("styles")
            .withIndex("id", q => q.eq("id", candidate.style!))
            .unique();

        if (styleDoc) style = styleDoc;
        else {
             const styleByName = await ctx.db.query("styles")
                .withIndex("name", q => q.eq("name", candidate.style!))
                .unique();
             style = styleByName;
        }
    }

    let tone = null;
    if (candidate.tone) {
         const toneDoc = await ctx.db.query("tones")
            .withIndex("id", q => q.eq("id", candidate.tone!))
            .unique();

        if (toneDoc) tone = toneDoc;
        else {
             const toneByName = await ctx.db.query("tones")
                .withIndex("name", q => q.eq("name", candidate.tone!))
                .unique();
             tone = toneByName;
        }
    }

    return {
        question: candidate,
        style,
        tone
    };
  },
});

export const postToInstagram = action({
  args: {},
  handler: async (ctx) => {
    // 1. Pick a question
    const data = await ctx.runMutation(internal.instagram.pickAndMarkQuestion);

    if (!data) {
        console.log("No question found to post.");
        return;
    }

    const { question, style, tone } = data;
    const text = question.text || question.customText || "Unknown Question";

    // 2. Construct the URL
    const baseUrl = "https://iceberg-breaker.vercel.app";

    // Pick a random gradient
    const gradient = DEFAULT_GRADIENTS[Math.floor(Math.random() * DEFAULT_GRADIENTS.length)];

    const params = new URLSearchParams();
    params.set("text", text);
    if (style) {
        params.set("styleName", style.name);
        params.set("styleColor", style.color);
    }
    if (tone) {
        params.set("toneName", tone.name);
        params.set("toneColor", tone.color);
    }
    params.set("gradientStart", gradient[0]);
    params.set("gradientEnd", gradient[1]);

    const imageUrl = `${baseUrl}/api/og?${params.toString()}`;

    // 3. Send to n8n
    const webhookUrl = process.env.N8N_WEBHOOK_URL;
    if (!webhookUrl) {
        console.error("N8N_WEBHOOK_URL is not set.");
        return;
    }

    console.log(`Sending question ${question._id} to n8n: ${imageUrl}`);

    const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            questionId: question._id,
            text,
            imageUrl,
            style: style?.name,
            tone: tone?.name,
            postedAt: new Date().toISOString(),
        }),
    });

    if (!response.ok) {
        console.error(`Failed to send to n8n: ${response.statusText}`);
    } else {
        console.log("Successfully sent to n8n.");
    }
  },
});
