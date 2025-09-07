import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const CATEGORIES = [  
  {
    id: 'random',
    name: 'Random Mix',
    icon: 'Shuffle',
    gradient: ['#F093FB', '#F5576C'],
    description: 'A mix of everything',
    hidden: true,
		prompt: 'The question can be in any style in (fun, deep, professional, wouldYouRather, thisOrThat, crossfit).'
  },
  {
    id: 'fun',
    name: 'Fun & Silly',
    icon: 'Sparkles',
    gradient: ['#FF6B6B', '#FFE66D'],
    description: 'Light-hearted questions to break the ice',
    hidden: false,
		prompt: 'The question should be light-hearted and funny. Ideal for parties and social gatherings.'
  },
  {
    id: 'deep',
    name: 'Deep & Thoughtful',
    icon: 'Brain',
    gradient: ['#667EEA', '#764BA2'],
    description: 'Questions that spark meaningful conversations',
    hidden: false,
		prompt: 'The question should be personal and thought-provoking. Ideal for introspection and self-discovery.'
  },
  {
    id: 'professional',
    name: 'Professional',
    icon: 'Briefcase',
    gradient: ['#0093E9', '#80D0C7'],
    description: 'Great for work events and networking',
    hidden: false,
		prompt: 'The question should be about work and career. Safe for work. Ideal for work events and networking.'
  },
  {
    id: 'wouldYouRather',
    name: 'Would You Rather',
    icon: 'HelpCircle',
    gradient: ['#FA709A', '#FEE140'],
    description: 'Classic choice-based questions',
    hidden: false,
		prompt: 'The question should be in the style of would-you-rather questions. It must be in the format of "would you rather ____ or ____". It may also be in the format of "If you could _____, would you rather ____ or ____".'
  },
  {
    id: 'ifThisBut',
    name: 'If This But',
    icon: 'Zap',
    gradient: ['#30CFD0', '#330867'],
    description: 'Conditional choice-based questions',
    hidden: false,
		prompt: 'The question in the style of if-this-but-that questions. It must be in the format of "If _____, but ____, <some decision or choice>" where the second part challenges the first part.'
  },
  {
    id: 'crossfit',
    name: 'CrossFit',
    icon: 'Dumbbell',
    gradient: ['#F36B6B', '#F3E66D'],
    description: 'Questions of the Day for CrossFit classes',
    hidden: false,
		prompt: 'The question should be in the style of question-of-the-day questions for CrossFit classes. Often there are new people in the class and this is a way to get them to introduce themselves.'
  }
];

export const getCategories = query({
	args: {},
	returns: v.array(v.object({
    _id: v.id("categories"),
    _creationTime: v.number(),
		id: v.string(),
		name: v.string(),
		icon: v.string(),
		gradient: v.array(v.string()),
		description: v.string(),
		hidden: v.boolean(),
		prompt: v.string(),
	})),
	handler: async (ctx) => {
		return await ctx.db.query("categories").collect();
	}
});
export const initializeCategories = mutation({
	args: {},
	returns: v.null(),
	handler: async (ctx) => {
		const categories = await ctx.db.query("categories").collect();
		if (categories.length > 0) {
			return null;
		}
		for (const category of CATEGORIES) {
			await ctx.db.insert("categories", category);
		}
		return null;
	}
});