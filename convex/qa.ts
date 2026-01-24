import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { api } from "./_generated/api";
import { Doc } from "./_generated/dataModel";

export const testDedupeLogic = internalAction({
	args: {
		text: v.string(),
		recentlySeen: v.array(v.string()),
	},
	handler: async (ctx, args) => {
		const { text, recentlySeen } = args;
		const normalize = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, '');
		const normalizedRecentlySeen = recentlySeen.map(normalize);
		const normalizedText = normalize(text);

		const isDuplicate = normalizedRecentlySeen.some(seen =>
			normalizedText.includes(seen) || seen.includes(normalizedText) || normalizedText === seen
		);

		return { text, normalizedText, isDuplicate, matchesFound: normalizedRecentlySeen.filter(seen => normalizedText.includes(seen) || seen.includes(normalizedText)) };
	},
});

export const testPromptAssembly = internalAction({
	args: {
		style: v.string(),
		tone: v.string(),
		recentlySeen: v.optional(v.array(v.string())),
	},
	handler: async (ctx, args) => {
		const { style, tone, recentlySeen = [] } = args;

		const styleDoc = await ctx.runQuery(api.styles.getStylesWithExamples, { id: style, seed: Math.random() });
		const toneDoc = await ctx.runQuery(api.tones.getTone, { id: tone });

		if (!styleDoc || !toneDoc) {
			return { error: "Style or Tone not found" };
		}

		// Few-shot sampling logic reproduction
		const examples = styleDoc.examples ?? (styleDoc.example ? [styleDoc.example] : []);
		const sampledExamples = examples.sort(() => 0.5 - Math.random()).slice(0, 3);
		const fewShotPrompt = sampledExamples.length > 0
			? `\nFollow this structure: "${styleDoc.structure}"\nExamples of this style:\n- ${sampledExamples.join('\n- ')}`
			: `\nFollow this structure: "${styleDoc.structure}"`;

		let prompt: string = `Generate questions with the following characteristics:
Style: ${styleDoc.name} (${styleDoc.description}). ${styleDoc.promptGuidanceForAI || ""}${fewShotPrompt}
Tone: ${toneDoc.name} (${toneDoc.description}). ${toneDoc.promptGuidanceForAI || ""}`;

		if (recentlySeen.length > 0) {
			prompt += `\n\nCRITICAL: Avoid topics, patterns, or phrasing similar to these recently seen questions:\n- ${recentlySeen.slice(-10).join('\n- ')}`;
		}

		return { prompt };
	},
});
