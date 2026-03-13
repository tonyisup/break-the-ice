import { internalMutation, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import {
  defaultIdealPromptLength,
  defaultQualityRubric,
  defaultToneAxesValue,
} from "./lib/taxonomy";

export const seedTakeover = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const topicId = await ctx.db.insert(
      "topics",
      toTopicDoc(
        {
          slug: "takeover-test",
          name: "Takeover Test Topic",
          description: "This is a test topic for takeover verification",
          aiGuidance:
            "Use this topic only for takeover verification and low-stakes testing.",
          version: 1,
          status: "active" as const,
          takeoverStartDate: now - 1000000,
          takeoverEndDate: now + 1000000,
          icon: "Sparkles",
          examples: [
            {
              text: "Is this a takeover question?",
              note: "Simple verification prompt.",
            },
          ],
          quality: defaultQualityRubric(),
          scopeBoundaries: ["takeover verification"],
          referencePool: ["test prompt"],
        },
        0,
      ) as any,
    );

    await ctx.db.insert("questions", {
      text: "Is this a takeover question?",
      topicId: topicId,
      status: "public",
      totalLikes: 0,
      totalShows: 0,
      averageViewDuration: 0,
    });
  },
});


type Quality = {
  distinctness: number;
  generativity: number;
  readability: number;
  pairability: number;
  storyYield: number;
  safety: number;
  embeddingValue: number;
};

const now = () => Date.now();

const q = (
  distinctness: number,
  generativity: number,
  readability: number,
  pairability: number,
  storyYield: number,
  safety: number,
  embeddingValue: number
): Quality => ({
  distinctness,
  generativity,
  readability,
  pairability,
  storyYield,
  safety,
  embeddingValue,
});

const STYLE_COLORS = [
  "#D97706",
  "#0F766E",
  "#BE123C",
  "#1D4ED8",
  "#7C3AED",
  "#166534",
];

const STYLE_ICONS = [
  "Shuffle",
  "Sparkles",
  "SplitSquareVertical",
  "MessageCircleQuestion",
  "ScanSearch",
  "Compass",
];

const TONE_COLORS = [
  "#F97316",
  "#EA580C",
  "#DC2626",
  "#0891B2",
  "#16A34A",
  "#7C3AED",
];

const TONE_ICONS = [
  "SmilePlus",
  "Coffee",
  "HeartHandshake",
  "Lightbulb",
  "Flame",
  "PenTool",
];

const TOPIC_COLORS = [
  "#EF4444",
  "#0EA5E9",
  "#22C55E",
  "#F59E0B",
  "#8B5CF6",
  "#EC4899",
  "#14B8A6",
  "#F97316",
];

const TOPIC_ICONS = [
  "UtensilsCrossed",
  "Plane",
  "House",
  "Sun",
  "Music4",
  "Shirt",
  "Gamepad2",
  "BookOpen",
];

function pickFromPalette(slug: string, palette: string[]) {
  let hash = 0;
  for (let i = 0; i < slug.length; i += 1) {
    hash = (hash * 31 + slug.charCodeAt(i)) >>> 0;
  }
  return palette[hash % palette.length];
}

function toStyleDoc(style: Record<string, any>, index: number) {
  const slug = style.slug ?? style.id;
  const promptGuidanceForAI = style.promptGuidanceForAI ?? style.aiGuidance ?? "";
  const structuralInstruction =
    style.structuralInstruction ?? style.structure ?? "";
  const examples =
    style.examples ?? (style.example ? [{ text: style.example }] : []);

  return {
    ...style,
    id: slug,
    slug,
    version: style.version ?? 1,
    status: style.status ?? "active",
    structure: style.structure ?? structuralInstruction,
    structuralInstruction,
    color: style.color ?? pickFromPalette(slug, STYLE_COLORS),
    icon: style.icon ?? pickFromPalette(slug, STYLE_ICONS),
    promptGuidanceForAI,
    aiGuidance: style.aiGuidance ?? promptGuidanceForAI,
    example: style.example ?? examples[0]?.text,
    order: style.order ?? index,
    safetyNotes:
      style.safetyNotes ?? "Prefer low-stakes, socially safe prompts.",
    commonFailureModes: style.commonFailureModes ?? [],
    distinctFrom: style.distinctFrom ?? [],
    examples,
    antiExamples: style.antiExamples ?? [],
    quality: style.quality ?? defaultQualityRubric(),
    createdAt: style.createdAt,
    updatedAt: style.updatedAt,
    cognitiveMove: style.cognitiveMove ?? "reflect",
    socialFunction:
      style.socialFunction ??
      "Reveals taste and priorities through conversation.",
    answerShape: style.answerShape ?? "short conversational answer",
    idealPromptLength:
      style.idealPromptLength ?? defaultIdealPromptLength(),
    riskLevel: style.riskLevel ?? "low",
  };
}

function toToneDoc(tone: Record<string, any>, index: number) {
  const slug = tone.slug ?? tone.id;
  const promptGuidanceForAI = tone.promptGuidanceForAI ?? tone.aiGuidance ?? "";

  return {
    ...tone,
    id: slug,
    slug,
    version: tone.version ?? 1,
    status: tone.status ?? "active",
    color: tone.color ?? pickFromPalette(slug, TONE_COLORS),
    icon: tone.icon ?? pickFromPalette(slug, TONE_ICONS),
    promptGuidanceForAI,
    aiGuidance: tone.aiGuidance ?? promptGuidanceForAI,
    order: tone.order ?? index,
    safetyNotes:
      tone.safetyNotes ?? "Keep language socially safe and low-friction.",
    commonFailureModes: tone.commonFailureModes ?? [],
    distinctFrom: tone.distinctFrom ?? [],
    examples: tone.examples ?? [],
    antiExamples: tone.antiExamples ?? [],
    quality: tone.quality ?? defaultQualityRubric(),
    createdAt: tone.createdAt,
    updatedAt: tone.updatedAt,
    languageCues: tone.languageCues ?? [],
    avoidCues: tone.avoidCues ?? [],
    emotionalAxes: tone.emotionalAxes ?? defaultToneAxesValue(),
  };
}

function toTopicDoc(topic: Record<string, any>, index: number) {
  const slug = topic.slug ?? topic.id;
  const promptGuidanceForAI = topic.promptGuidanceForAI ?? topic.aiGuidance ?? "";
  const examples =
    topic.examples ?? (topic.example ? [{ text: topic.example }] : []);

  return {
    ...topic,
    id: slug,
    slug,
    version: topic.version ?? 1,
    status: topic.status ?? "active",
    icon: topic.icon ?? pickFromPalette(slug, TOPIC_ICONS),
    color: topic.color ?? pickFromPalette(slug, TOPIC_COLORS),
    promptGuidanceForAI,
    aiGuidance: topic.aiGuidance ?? promptGuidanceForAI,
    example: topic.example ?? examples[0]?.text,
    order: topic.order ?? index,
    safetyNotes:
      topic.safetyNotes ?? "Keep topics broadly answerable and socially safe.",
    commonFailureModes: topic.commonFailureModes ?? [],
    distinctFrom: topic.distinctFrom ?? [],
    examples,
    antiExamples: topic.antiExamples ?? [],
    quality: topic.quality ?? defaultQualityRubric(),
    createdAt: topic.createdAt,
    updatedAt: topic.updatedAt,
    scopeBoundaries: topic.scopeBoundaries ?? [],
    referencePool: topic.referencePool ?? [],
    accessibilityNotes: topic.accessibilityNotes,
  };
}

const styles = [
  {
    slug: "would-you-rather",
    name: "Would You Rather",
    status: "active" as const,
    version: 1,
    description: "Forces a trade-off that reveals priorities quickly.",
    aiGuidance:
      "Use vivid, specific options that create a real trade-off. Each option " +
      "should have a different appeal or inconvenience. Avoid obviously " +
      "correct answers, extreme harm, and generic luxury fantasies.",
    safetyNotes:
      "Keep tension low-stakes. Prefer social awkwardness, inconvenience, " +
      "taste, routine, or value trade-offs over danger or catastrophe.",
    commonFailureModes: [
      "options have an obvious correct answer",
      "options are too generic",
      "tension comes from extreme harm",
      "one option is much funnier or much better than the other",
    ],
    distinctFrom: ["if-this-but-that", "desert-island"],
    examples: [
      {
        text: "Would you rather always get the window seat or always board last?",
        note: "Concrete trade-off with no obvious winner.",
      },
      {
        text: "Would you rather have a perfectly organized kitchen or a perfectly organized inbox?",
        note: "Reveals priorities and daily friction tolerance.",
      },
      {
        text: "Would you rather relive your best vacation with the same people or your funniest meal with different people?",
        note: "Specific and socially revealing.",
      },
    ],
    antiExamples: [
      {
        text: "Would you rather be rich or famous?",
        note: "Overused and too broad.",
      },
      {
        text: "Would you rather live forever or die tomorrow?",
        note: "Too extreme and not feed-friendly.",
      },
    ],
    quality: q(5, 5, 5, 5, 4, 5, 4),
    cognitiveMove: "choose",
    socialFunction: "Makes people reveal priorities through constrained comparison.",
    structuralInstruction:
      "Would you rather <specific option A with a meaningful appeal or trade-off> or <specific option B with a different appeal or trade-off>?",
    answerShape: "binary choice plus short justification",
    idealPromptLength: {
      minChars: 55,
      maxChars: 140,
    },
    riskLevel: "low" as const,
  },
  {
    slug: "one-word-whip-around",
    name: "One-Word Whip-Around",
    status: "active" as const,
    version: 1,
    description: "Compresses a familiar feeling or scene into a tiny summary.",
    aiGuidance:
      "Ask for one-word reactions to concrete, widely recognizable scenes or " +
      "experiences. Favor texture and vibe over analysis. Avoid prompts that " +
      "require niche knowledge or produce the same obvious answer every time.",
    safetyNotes:
      "Keep scenes familiar and socially safe. Avoid humiliation, panic, or " +
      "trauma framing.",
    commonFailureModes: [
      "too abstract",
      "scene is not specific enough",
      "basically asks for a full explanation",
      "answer is too obvious and uniform",
    ],
    distinctFrom: ["lightning-round", "open-ended"],
    examples: [
      {
        text: "One word only: how does a grocery store five minutes before closing feel?",
        note: "Specific scene with strong vibe yield.",
      },
      {
        text: "One word only: what is the emotional weather of an airport at 6 a.m.?",
        note: "Scene-based compression.",
      },
      {
        text: "One word only: how does opening a group chat with 87 unread messages feel?",
        note: "Fast, answerable, and revealing.",
      },
    ],
    antiExamples: [
      {
        text: "Describe your personality in one word?",
        note: "Too broad and self-conscious.",
      },
      {
        text: "One word for life?",
        note: "Too abstract to answer well.",
      },
    ],
    quality: q(5, 4, 5, 5, 4, 5, 5),
    cognitiveMove: "compress",
    socialFunction: "Creates fast, low-friction answers with strong vibe signal.",
    structuralInstruction:
      "One word only: <how does this specific familiar scene, object, or experience feel>?",
    answerShape: "single-word summary",
    idealPromptLength: {
      minChars: 40,
      maxChars: 120,
    },
    riskLevel: "low" as const,
  },
  {
    slug: "if-this-but-that",
    name: "If This But That",
    status: "active" as const,
    version: 1,
    description: "Offers a tempting hypothetical with a meaningful catch.",
    aiGuidance:
      "Present a desirable setup followed by a caveat that changes the " +
      "decision. The catch should be socially, practically, or aesthetically " +
      "meaningful, not catastrophic. Avoid magical omnipotence and avoid " +
      "catches that make the choice trivial.",
    safetyNotes:
      "Use inconvenience, routine changes, social weirdness, or value conflict " +
      "as tension. Avoid bodily harm, ruin, and panic scenarios.",
    commonFailureModes: [
      "catch is too weak",
      "catch is too extreme",
      "scenario is just a would-you-rather in disguise",
      "setup is generic wish fulfillment",
    ],
    distinctFrom: ["would-you-rather", "super-power-caveats"],
    examples: [
      {
        text: "If you could always find a perfect parking spot, but only when you're running late, would you take it?",
        note: "Tempting setup with a meaningful catch.",
      },
      {
        text: "If your coffee always stayed at the perfect temperature, but every cup had to come from a different mug, would that improve your life?",
        note: "Small caveat that reveals routine preferences.",
      },
      {
        text: "If you could skip every line forever, but people nearby could clearly tell, would you use that perk?",
        note: "Social trade-off rather than extreme stakes.",
      },
    ],
    antiExamples: [
      {
        text: "If you could fly but only at night, would you?",
        note: "Too close to superpower framing.",
      },
      {
        text: "If you could be rich but everyone hated you, would you?",
        note: "Overblown and obvious.",
      },
    ],
    quality: q(5, 5, 4, 5, 5, 5, 5),
    cognitiveMove: "decide",
    socialFunction: "Reveals threshold, values, and caveat tolerance quickly.",
    structuralInstruction:
      "If <tempting setup>, but <meaningful catch>, would you still take it?",
    answerShape: "yes/no plus threshold reasoning",
    idealPromptLength: {
      minChars: 55,
      maxChars: 150,
    },
    riskLevel: "low" as const,
  },
  {
    slug: "super-power-caveats",
    name: "Super-Power Caveats",
    status: "active" as const,
    version: 1,
    description: "Pairs a playful power with a quirky glitch to reveal risk tolerance and taste.",
    aiGuidance:
      "Use clearly legible powers with whimsical or annoying drawbacks. Keep " +
      "the drawback quirky enough to be fun, but meaningful enough to affect " +
      "the decision. Avoid dark consequences and avoid powers so broad they " +
      "swallow all nuance.",
    safetyNotes:
      "Stay playful and low-stakes. Drawbacks should create inconvenience, " +
      "social oddity, or aesthetic cost, not real suffering.",
    commonFailureModes: [
      "power is too strong and dominates the caveat",
      "drawback is random rather than meaningful",
      "too similar to generic hypothetical dilemmas",
      "too chaotic or nonsensical",
    ],
    distinctFrom: ["if-this-but-that", "would-you-rather"],
    examples: [
      {
        text: "Would you want the power to teleport if you always arrived slightly overdressed for the destination?",
        note: "Playful power with socially meaningful glitch.",
      },
      {
        text: "Would you take perfect memory if every song got permanently stuck in your head for a week?",
        note: "Specific drawback with real texture.",
      },
      {
        text: "Would you want to understand every language if you lost the ability to whisper?",
        note: "Quirky drawback that changes social behavior.",
      },
    ],
    antiExamples: [
      {
        text: "Would you want to be invisible?",
        note: "Missing the caveat.",
      },
      {
        text: "Would you take immortality if everyone you love dies?",
        note: "Too dark and extreme.",
      },
    ],
    quality: q(5, 4, 5, 4, 4, 5, 4),
    cognitiveMove: "assess",
    socialFunction: "Uses playful friction to surface tolerance for weird trade-offs.",
    structuralInstruction:
      "Would you want <clear power> if <quirky but meaningful drawback>?",
    answerShape: "take it or leave it plus why",
    idealPromptLength: {
      minChars: 50,
      maxChars: 140,
    },
    riskLevel: "low" as const,
  },
  {
    slug: "open-ended",
    name: "Open Ended",
    status: "active" as const,
    version: 1,
    description: "Elicits a specific memory, opinion, habit, or small confession.",
    aiGuidance:
      "Ask for a concrete, answerable anecdote or preference with built-in " +
      "texture. Prefer the most surprising, underrated, irrational, tiny, " +
      "or oddly specific version of a question. Avoid broad favorites and " +
      "identity essays.",
    safetyNotes:
      "Favor low-stakes vulnerability, memory, and taste. Avoid trauma mining " +
      "and moral confession framing.",
    commonFailureModes: [
      "too broad",
      "too generic",
      "asks for biography instead of a story",
      "produces vague answers",
    ],
    distinctFrom: ["time-capsule-snapshot", "one-word-whip-around"],
    examples: [
      {
        text: "What harmless opinion do you hold with unreasonable intensity?",
        note: "Specific confession with low stakes.",
      },
      {
        text: "What's the most unexpectedly great smell in everyday life?",
        note: "Concrete and sensory.",
      },
      {
        text: "What's something you always do in hotels that you never do at home?",
        note: "Reveals habits through a familiar context.",
      },
    ],
    antiExamples: [
      {
        text: "What's your favorite movie?",
        note: "Classic bland favorite prompt.",
      },
      {
        text: "Tell me about yourself?",
        note: "Too broad and high-friction.",
      },
    ],
    quality: q(4, 5, 5, 5, 5, 5, 5),
    cognitiveMove: "recall",
    socialFunction: "Invites story-rich answers without requiring deep vulnerability.",
    structuralInstruction:
      "What's the most <surprising / underrated / irrational / memorable> <specific thing in a familiar domain>?",
    answerShape: "short anecdote or opinion",
    idealPromptLength: {
      minChars: 40,
      maxChars: 130,
    },
    riskLevel: "low" as const,
  },
  {
    slug: "time-capsule-snapshot",
    name: "Time-Capsule Snapshot",
    status: "active" as const,
    version: 1,
    description: "Uses objects and artifacts to trigger memory retrieval.",
    aiGuidance:
      "Anchor prompts in a life phase, setting, or era and ask what objects, " +
      "artifacts, or tiny details would represent it. Favor sensory specificity " +
      "and culturally legible details. Avoid requiring exact dates or perfect recall.",
    safetyNotes:
      "Keep nostalgia soft and accessible. Avoid prompts that imply loss, regret, " +
      "or painful memory as the core mechanic.",
    commonFailureModes: [
      "too broad a time period",
      "too dependent on exact memory",
      "too sentimental without specificity",
      "becomes generic nostalgia",
    ],
    distinctFrom: ["open-ended", "desert-island"],
    examples: [
      {
        text: "What object would absolutely be inside a time capsule from your middle school bedroom?",
        note: "Object-based memory retrieval.",
      },
      {
        text: "If someone opened a capsule from your early internet era, what item would explain you instantly?",
        note: "Artifact as identity shorthand.",
      },
      {
        text: "What tiny object best represents your family vacations growing up?",
        note: "Specific memory trigger.",
      },
    ],
    antiExamples: [
      {
        text: "What was your childhood like?",
        note: "Too broad and unspecific.",
      },
      {
        text: "What do you remember from school?",
        note: "Weak recall cue.",
      },
    ],
    quality: q(5, 4, 4, 4, 5, 5, 5),
    cognitiveMove: "retrieve",
    socialFunction: "Unlocks vivid nostalgia through concrete artifacts rather than abstract reflection.",
    structuralInstruction:
      "What <object / artifact / tiny detail> would be inside a time capsule from <specific life phase, setting, or era>?",
    answerShape: "named object plus memory context",
    idealPromptLength: {
      minChars: 55,
      maxChars: 145,
    },
    riskLevel: "low" as const,
  },
  {
    slug: "desert-island",
    name: "Desert Island",
    status: "active" as const,
    version: 1,
    description: "Forces curation under constraint to reveal identity through prioritization.",
    aiGuidance:
      "Use tight scarcity constraints that force meaningful curation. The " +
      "constraint should shape taste or identity, not survival realism. " +
      "Avoid generic all-time favorites and avoid impossible optimization puzzles.",
    safetyNotes:
      "Treat the format as curation, not disaster. Avoid survival panic or " +
      "threat framing.",
    commonFailureModes: [
      "too close to favorite lists",
      "constraint is not meaningful enough",
      "too many allowed picks",
      "becomes practical survival instead of identity curation",
    ],
    distinctFrom: ["would-you-rather", "open-ended"],
    examples: [
      {
        text: "You can only keep three kitchen items with personality, not utility. What survives?",
        note: "Constraint reveals aesthetic attachment.",
      },
      {
        text: "You only get one comfort rewatch for the next five years. What earns the slot?",
        note: "Strong curation pressure.",
      },
      {
        text: "You can keep only two neighborhood spots in your weekly routine. Which ones make the cut?",
        note: "Identity through prioritization.",
      },
    ],
    antiExamples: [
      {
        text: "What would you bring to a desert island?",
        note: "Overused and too broad.",
      },
      {
        text: "Name your top 10 favorite songs?",
        note: "Weak constraint and too list-like.",
      },
    ],
    quality: q(5, 5, 5, 4, 5, 5, 5),
    cognitiveMove: "curate",
    socialFunction: "Reveals taste and priorities through forced limitation.",
    structuralInstruction:
      "You can only <keep / bring / access> <very small number> <items / experiences / choices> from <specific domain>. What makes the cut?",
    answerShape: "small set of picks plus justification",
    idealPromptLength: {
      minChars: 45,
      maxChars: 135,
    },
    riskLevel: "low" as const,
  },
];

const tones = [
  {
    slug: "playful",
    name: "Playful",
    status: "active" as const,
    version: 1,
    description: "Light, mischievous, and socially easy with a bit of bounce.",
    aiGuidance:
      "Use light, image-friendly language with low stakes and gentle surprise. " +
      "Aim for smiles and fast engagement. Avoid chaos, random absurdity, or " +
      "trying too hard to be quirky.",
    safetyNotes: "Keep the energy friendly and easy to answer.",
    commonFailureModes: [
      "too random",
      "too juvenile",
      "tone overwhelms structure",
      "jokey but not answerable",
    ],
    distinctFrom: ["witty", "warm"],
    examples: [
      {
        text: "Would you rather have a fridge that compliments you or a toaster that gives mild life advice?",
        note: "Playful diction with answerable absurdity.",
      },
    ],
    antiExamples: [
      {
        text: "What eldritch snack chaos lives in your soul?",
        note: "Too random and strained.",
      },
    ],
    quality: q(4, 5, 5, 5, 4, 5, 4),
    languageCues: [
      "light",
      "breezy",
      "gently absurd",
      "friendly",
      "image-rich",
      "socially easy",
    ],
    avoidCues: [
      "chaotic randomism",
      "mean sarcasm",
      "internet irony overload",
      "forced zany language",
    ],
    emotionalAxes: {
      warmth: 4,
      playfulness: 5,
      seriousness: 1,
      surrealness: 2,
      sharpness: 2,
      intimacy: 2,
    },
  },
  {
    slug: "cozy",
    name: "Cozy",
    status: "active" as const,
    version: 1,
    description: "Soft, comforting, and gently sensory with low social risk.",
    aiGuidance:
      "Use warm, familiar, sensory language that makes the prompt feel inviting " +
      "rather than demanding. Aim for comfort, fondness, and easy memory access. " +
      "Avoid saccharine phrasing or overly precious imagery.",
    safetyNotes: "Prefer homey, familiar, low-pressure framing.",
    commonFailureModes: [
      "too sentimental",
      "too vague",
      "all softness, no specificity",
      "becomes nostalgia-only",
    ],
    distinctFrom: ["warm", "nostalgic"],
    examples: [
      {
        text: "What's a tiny household ritual that makes a day feel more put together?",
        note: "Gentle and inviting.",
      },
    ],
    antiExamples: [
      {
        text: "What is the divine cinnamon-core memory of your inner blanket self?",
        note: "Overwritten and unnatural.",
      },
    ],
    quality: q(4, 4, 5, 5, 4, 5, 4),
    languageCues: [
      "warm",
      "gentle",
      "homey",
      "soft sensory detail",
      "low-pressure",
    ],
    avoidCues: [
      "precious",
      "overly poetic",
      "weepy",
      "too sleepy or passive",
    ],
    emotionalAxes: {
      warmth: 5,
      playfulness: 2,
      seriousness: 2,
      surrealness: 1,
      sharpness: 1,
      intimacy: 3,
    },
  },
  {
    slug: "reflective",
    name: "Reflective",
    status: "active" as const,
    version: 1,
    description: "Thoughtful and lightly introspective without becoming heavy.",
    aiGuidance:
      "Use clear, calm language that invites self-awareness and memory without " +
      "turning into therapy. Aim for insight, recognition, and specific personal " +
      "meaning. Avoid vague profundity or high-stakes emotional excavation.",
    safetyNotes:
      "Low-stakes vulnerability only. Avoid trauma, regret spirals, and moral shame.",
    commonFailureModes: [
      "too deep by default",
      "too abstract",
      "therapy voice",
      "slow to parse in a feed",
    ],
    distinctFrom: ["warm", "bold"],
    examples: [
      {
        text: "What's a small habit you've kept longer than you expected because it quietly works?",
        note: "Thoughtful but still answerable.",
      },
    ],
    antiExamples: [
      {
        text: "What wound shaped your becoming?",
        note: "Way too intense.",
      },
    ],
    quality: q(4, 5, 5, 5, 5, 5, 5),
    languageCues: [
      "thoughtful",
      "clear",
      "calm",
      "specific",
      "quietly revealing",
    ],
    avoidCues: [
      "therapy-speak",
      "grand profundity",
      "heavy emotional framing",
      "vagueness",
    ],
    emotionalAxes: {
      warmth: 4,
      playfulness: 1,
      seriousness: 4,
      surrealness: 1,
      sharpness: 2,
      intimacy: 4,
    },
  },
  {
    slug: "witty",
    name: "Witty",
    status: "active" as const,
    version: 1,
    description: "Clever, lightly sharp, and socially nimble without becoming mean.",
    aiGuidance:
      "Use concise, clever phrasing with a little edge and a strong premise. " +
      "Aim for amusement and brisk engagement. Avoid snark, smugness, or " +
      "wording so clever it hurts readability.",
    safetyNotes: "Keep the edge gentle and non-humiliating.",
    commonFailureModes: [
      "too smug",
      "too compressed to parse",
      "mean",
      "becomes joke-first and answer-second",
    ],
    distinctFrom: ["playful", "bold"],
    examples: [
      {
        text: "What's a purchase that was financially irresponsible but spiritually efficient?",
        note: "Witty and revealing.",
      },
    ],
    antiExamples: [
      {
        text: "Which consumerist delusion best flatters your chaos goblin tendencies?",
        note: "Trying too hard.",
      },
    ],
    quality: q(4, 4, 5, 5, 4, 5, 4),
    languageCues: [
      "clever",
      "dry",
      "concise",
      "lightly sharp",
      "socially nimble",
    ],
    avoidCues: [
      "mean sarcasm",
      "smugness",
      "overwriting",
      "punchline-only phrasing",
    ],
    emotionalAxes: {
      warmth: 2,
      playfulness: 4,
      seriousness: 2,
      surrealness: 1,
      sharpness: 4,
      intimacy: 2,
    },
  },
  {
    slug: "nostalgic",
    name: "Nostalgic",
    status: "active" as const,
    version: 1,
    description: "Fond, memory-rich, and era-textured without becoming maudlin.",
    aiGuidance:
      "Use lightly time-textured language that helps people access specific eras, " +
      "objects, and routines. Aim for recognition and vivid recall. Avoid vague " +
      "yearning, generational gatekeeping, or excessive sentimentality.",
    safetyNotes: "Prefer accessible, fond recollection over loss-heavy reflection.",
    commonFailureModes: [
      "too sentimental",
      "too era-specific for broad answerability",
      "generic childhood nostalgia",
      "sadness dominates",
    ],
    distinctFrom: ["cozy", "reflective"],
    examples: [
      {
        text: "What object from your school years instantly brings back the whole vibe of that era?",
        note: "Memory-rich and concrete.",
      },
    ],
    antiExamples: [
      {
        text: "What do you miss about the past?",
        note: "Too broad and emotionally flat.",
      },
    ],
    quality: q(4, 5, 5, 4, 5, 5, 5),
    languageCues: [
      "memory-rich",
      "fond",
      "era-textured",
      "specific",
      "recognition-driven",
    ],
    avoidCues: [
      "weepy",
      "generational exclusivity",
      "vague yearning",
      "heavy regret",
    ],
    emotionalAxes: {
      warmth: 4,
      playfulness: 2,
      seriousness: 3,
      surrealness: 1,
      sharpness: 1,
      intimacy: 3,
    },
  },
  {
    slug: "bold",
    name: "Bold",
    status: "active" as const,
    version: 1,
    description: "Direct, confident, and a little provocative without tipping into aggression.",
    aiGuidance:
      "Use crisp, high-confidence wording that invites a strong take, decisive " +
      "choice, or unapologetic opinion. Aim for energy and conviction. Avoid " +
      "conflict bait, humiliation, or intensity that feels socially risky.",
    safetyNotes:
      "Provocation should stay low-stakes and taste-driven, not moralized or hostile.",
    commonFailureModes: [
      "too combative",
      "too intense",
      "social risk too high",
      "confuses boldness with controversy bait",
    ],
    distinctFrom: ["witty", "reflective"],
    examples: [
      {
        text: "What's a completely harmless opinion you would defend like it's a constitutional right?",
        note: "Strong stance without real danger.",
      },
    ],
    antiExamples: [
      {
        text: "What belief would you end friendships over?",
        note: "Too socially costly.",
      },
    ],
    quality: q(4, 4, 5, 4, 5, 4, 5),
    languageCues: [
      "direct",
      "confident",
      "crisp",
      "decisive",
      "high-energy",
    ],
    avoidCues: [
      "aggressive",
      "moralizing",
      "hostile",
      "debate-bait",
    ],
    emotionalAxes: {
      warmth: 2,
      playfulness: 3,
      seriousness: 3,
      surrealness: 1,
      sharpness: 4,
      intimacy: 2,
    },
  },
];

const topics = [
  {
    slug: "food",
    name: "Food",
    status: "active" as const,
    version: 1,
    description: "Everyday eating, cravings, rituals, preferences, and food-related identity.",
    aiGuidance:
      "Focus on specific eating habits, snack behavior, meal rituals, textures, " +
      "grocery choices, and low-stakes food opinions. Avoid generic favorite-food " +
      "prompts and avoid specialized culinary expertise.",
    safetyNotes: "Keep it broadly accessible and non-elitist.",
    commonFailureModes: [
      "favorite food questions",
      "too chef-y",
      "too culture-narrow without context",
      "just asks for preferences with no texture",
    ],
    distinctFrom: ["home-life", "holidays"],
    examples: [
      {
        text: "What snack do you buy even when you know it is objectively overpriced?",
        note: "Reveals habits and taste.",
      },
    ],
    antiExamples: [
      {
        text: "What's your favorite food?",
        note: "Generic and low-signal.",
      },
    ],
    quality: q(4, 5, 5, 5, 4, 5, 5),
    scopeBoundaries: [
      "eating routines",
      "snacks",
      "groceries",
      "kitchen habits",
      "restaurant behavior",
      "comfort foods",
    ],
    referencePool: [
      "leftovers",
      "midnight snacks",
      "grocery carts",
      "condiments",
      "office snacks",
      "breakfast habits",
      "takeout rituals",
      "overpriced treats",
      "free samples",
      "signature dishes",
    ],
    accessibilityNotes:
      "Use everyday food references. Avoid requiring niche diets or culinary jargon.",
  },
  {
    slug: "travel",
    name: "Travel",
    status: "active" as const,
    version: 1,
    description: "Movement, trips, transit rituals, lodging habits, and place-based preferences.",
    aiGuidance:
      "Focus on recognizable travel moments like airports, packing, hotels, road " +
      "trips, navigation, and local discoveries. Avoid requiring luxury travel or " +
      "international experience.",
    safetyNotes: "Keep it accessible to everyday travel experiences, including local trips.",
    commonFailureModes: [
      "too aspirational",
      "luxury-coded",
      "generic destination favorites",
      "assumes lots of travel experience",
    ],
    distinctFrom: ["local-culture", "work"],
    examples: [
      {
        text: "What's a tiny travel habit that makes you feel instantly more competent?",
        note: "Specific and behavior-rich.",
      },
    ],
    antiExamples: [
      {
        text: "What's your favorite country?",
        note: "Too broad and inaccessible.",
      },
    ],
    quality: q(4, 5, 5, 5, 4, 5, 5),
    scopeBoundaries: [
      "airports",
      "packing",
      "hotels",
      "road trips",
      "transit",
      "trip routines",
      "maps",
    ],
    referencePool: [
      "boarding groups",
      "window seats",
      "hotel breakfast",
      "carry-ons",
      "rest stops",
      "charging outlets",
      "itineraries",
      "walking tours",
      "souvenir regrets",
      "unpacked bags",
    ],
    accessibilityNotes:
      "Include local and regional travel references so the topic remains broad.",
  },
  {
    slug: "work",
    name: "Work",
    status: "active" as const,
    version: 1,
    description: "Everyday work habits, office culture, meetings, productivity quirks, and professional routines.",
    aiGuidance:
      "Use common workplace experiences like meetings, email, desks, calendars, " +
      "coworker dynamics, and focus rituals. Avoid career prestige framing and avoid " +
      "high-stakes job trauma.",
    safetyNotes:
      "Prefer harmless annoyance, routine, and taste over burnout or employer panic.",
    commonFailureModes: [
      "too industry-specific",
      "too negative",
      "generic dream-job prompts",
      "accidentally invites oversharing about toxic workplaces",
    ],
    distinctFrom: ["technology", "school"],
    examples: [
      {
        text: "What meeting behavior instantly tells you how the rest of the meeting will go?",
        note: "Specific, relatable, and opinion-rich.",
      },
    ],
    antiExamples: [
      {
        text: "What do you do for work?",
        note: "Biography prompt, not an ice-breaker.",
      },
    ],
    quality: q(4, 5, 5, 5, 5, 4, 5),
    scopeBoundaries: [
      "meetings",
      "email",
      "desks",
      "focus habits",
      "coworker routines",
      "calendar behavior",
    ],
    referencePool: [
      "status updates",
      "Slack messages",
      "camera-on meetings",
      "desk snacks",
      "to-do lists",
      "Monday mood",
      "tab overload",
      "calendar blocks",
      "office chairs",
      "lunch breaks",
    ],
    accessibilityNotes:
      "Keep prompts broad enough to work for office, remote, service, and freelance contexts.",
  },
  {
    slug: "music",
    name: "Music",
    status: "active" as const,
    version: 1,
    description: "Listening habits, emotional associations, identity signals, and music-related routines.",
    aiGuidance:
      "Focus on how people use music in daily life: mood setting, memory, repeat " +
      "behavior, guilty pleasures, playlists, and artist loyalty. Avoid trivia or " +
      "prompts that require niche genre expertise.",
    safetyNotes: "Keep it taste-driven and accessible.",
    commonFailureModes: [
      "favorite artist questions",
      "genre gatekeeping",
      "too expertise-dependent",
      "too broad",
    ],
    distinctFrom: ["childhood-nostalgia", "technology"],
    examples: [
      {
        text: "What kind of song do you trust way more than its album cover suggests?",
        note: "Specific and taste-revealing.",
      },
    ],
    antiExamples: [
      {
        text: "What's your favorite song?",
        note: "Low-signal and generic.",
      },
    ],
    quality: q(4, 5, 5, 5, 4, 5, 5),
    scopeBoundaries: [
      "listening habits",
      "playlists",
      "repeat behavior",
      "concerts",
      "artist loyalty",
      "music moods",
    ],
    referencePool: [
      "shuffle",
      "commute playlists",
      "karaoke picks",
      "album covers",
      "songs on repeat",
      "work music",
      "sad songs",
      "running playlists",
      "first concert",
      "background music",
    ],
    accessibilityNotes:
      "Assume casual listeners, not only enthusiasts.",
  },
  {
    slug: "technology",
    name: "Technology",
    status: "active" as const,
    version: 1,
    description: "Devices, apps, notifications, digital habits, and everyday tech behavior.",
    aiGuidance:
      "Focus on common personal tech routines and app behavior rather than niche " +
      "specs or professional knowledge. Good subdomains include notifications, tabs, " +
      "phone home screens, search habits, and digital friction.",
    safetyNotes:
      "Keep it behavioral and low-stakes. Avoid privacy panic or surveillance-heavy framing.",
    commonFailureModes: [
      "too technical",
      "brand loyalty bait only",
      "assumes expertise",
      "becomes work-tech instead of everyday-tech",
    ],
    distinctFrom: ["work", "internet-habits"],
    examples: [
      {
        text: "What's the most unreasonable number of tabs that still feels normal to you?",
        note: "Behavior-rich and answerable.",
      },
    ],
    antiExamples: [
      {
        text: "What's your favorite programming language?",
        note: "Too niche and occupation-specific.",
      },
    ],
    quality: q(4, 5, 5, 5, 4, 5, 5),
    scopeBoundaries: [
      "phones",
      "apps",
      "notifications",
      "tabs",
      "search behavior",
      "digital routines",
    ],
    referencePool: [
      "low battery",
      "screen time",
      "push notifications",
      "phone cases",
      "alarm tones",
      "browser tabs",
      "app folders",
      "password habits",
      "autocorrect",
      "photo storage",
    ],
    accessibilityNotes:
      "Use mass-market tech references that work across age groups.",
  },
  {
    slug: "internet-habits",
    name: "Internet Habits",
    status: "active" as const,
    version: 1,
    description: "Online routines, browsing behavior, posting instincts, and digital culture habits.",
    aiGuidance:
      "Focus on common online behavior like lurking, bookmarking, doomscrolling, " +
      "commenting, rabbit holes, screenshots, and search spirals. Avoid niche fandoms " +
      "and platform-specific prompts that age badly too fast.",
    safetyNotes:
      "Keep it light and behavioral. Avoid harassment, explicit content, and shame-based framing.",
    commonFailureModes: [
      "too platform-specific",
      "too niche",
      "dated memes as the whole prompt",
      "calls for oversharing",
    ],
    distinctFrom: ["technology", "music"],
    examples: [
      {
        text: "What kind of thing do you always open in a new tab and almost never return to?",
        note: "Relatable digital behavior.",
      },
    ],
    antiExamples: [
      {
        text: "What's your favorite website?",
        note: "Too generic.",
      },
    ],
    quality: q(5, 5, 5, 5, 4, 5, 5),
    scopeBoundaries: [
      "browsing",
      "scrolling",
      "searching",
      "bookmarking",
      "posting",
      "lurking",
    ],
    referencePool: [
      "group chats",
      "saved posts",
      "open tabs",
      "search spirals",
      "comment sections",
      "screenshots",
      "recommendation rabbit holes",
      "mute buttons",
      "late-night scrolling",
      "forgotten bookmarks",
    ],
    accessibilityNotes:
      "Use habits common across platforms so prompts stay durable.",
  },
  {
    slug: "home-life",
    name: "Home Life",
    status: "active" as const,
    version: 1,
    description: "Domestic routines, spaces, household habits, comfort systems, and everyday living quirks.",
    aiGuidance:
      "Focus on lived-in home behavior: entryways, kitchens, laundry habits, couch " +
      "territories, cleaning shortcuts, and evening rituals. Avoid requiring home ownership " +
      "or aspirational interior design knowledge.",
    safetyNotes: "Keep it routine-based, comforting, and class-accessible.",
    commonFailureModes: [
      "too decor-focused",
      "assumes ownership",
      "too broad",
      "not enough specificity",
    ],
    distinctFrom: ["food", "holidays"],
    examples: [
      {
        text: "What's a completely ordinary household item you are weirdly loyal to?",
        note: "Specific and revealing.",
      },
    ],
    antiExamples: [
      {
        text: "What is your dream house?",
        note: "Aspirational and generic.",
      },
    ],
    quality: q(4, 5, 5, 5, 4, 5, 5),
    scopeBoundaries: [
      "kitchens",
      "living spaces",
      "laundry",
      "cleaning habits",
      "daily rituals",
      "comfort routines",
    ],
    referencePool: [
      "dish racks",
      "blankets",
      "entryway piles",
      "fridge magnets",
      "night lights",
      "laundry baskets",
      "couch spots",
      "favorite mugs",
      "light switches",
      "weekend chores",
    ],
    accessibilityNotes:
      "Use renter-friendly and shared-space-friendly references.",
  },
  {
    slug: "childhood-nostalgia",
    name: "Childhood Nostalgia",
    status: "active" as const,
    version: 1,
    description: "Early-life memories, routines, objects, and cultural texture from growing up.",
    aiGuidance:
      "Focus on concrete memories, school-era objects, family routines, media habits, " +
      "and tiny rituals from growing up. Keep prompts broad enough to work across backgrounds, " +
      "but specific enough to unlock memory.",
    safetyNotes:
      "Use gentle, low-stakes recall. Avoid family conflict, pain, or loss as default framing.",
    commonFailureModes: [
      "too broad",
      "too generation-specific",
      "too sentimental",
      "accidentally sad",
    ],
    distinctFrom: ["nostalgic tone", "school"],
    examples: [
      {
        text: "What object from your childhood had way more emotional importance than it deserved?",
        note: "Strong memory hook.",
      },
    ],
    antiExamples: [
      {
        text: "What was your childhood like?",
        note: "Too broad and high-friction.",
      },
    ],
    quality: q(5, 5, 5, 4, 5, 5, 5),
    scopeBoundaries: [
      "childhood objects",
      "school-adjacent routines",
      "family rituals",
      "early media habits",
      "growing-up textures",
    ],
    referencePool: [
      "lunch boxes",
      "stickers",
      "bedroom posters",
      "after-school snacks",
      "school supplies",
      "bike rides",
      "cartoon theme songs",
      "sleepovers",
      "family car rides",
      "allowances",
    ],
    accessibilityNotes:
      "Prefer universal childhood textures over narrow decade references.",
  },
];

const promptBlueprints = [
  {
    slug: "icebreaker-default",
    version: 1,
    status: "active" as const,
    systemInstruction:
      "Generate feed-friendly ice-breaker questions that are easy to read quickly " +
      "and rewarding to answer. Optimize for specificity, answerability, replayability, " +
      "and clean preference signals. Each question should feel like one strong card in " +
      "an infinite scroll feed, not a workshop exercise.",
    safetyChecklist: [
      "avoid trauma mining",
      "avoid explicit sexual content",
      "avoid self-harm or suicide themes",
      "avoid criminal confession framing",
      "avoid humiliation as core mechanic",
      "avoid medical or legal panic scenarios",
      "avoid politics or religion by default",
      "prefer low-stakes vulnerability",
      "prefer harmless embarrassment and relatable habits",
    ],
    qualityChecklist: [
      "prompt must be understood in a few seconds",
      "prefer scenes over categories",
      "prefer specific over generic",
      "prefer constraints that reveal taste or values",
      "avoid bland favorites",
      "avoid obvious correct answers",
      "favor stories, habits, quirks, and memorable preferences",
      "keep answers accessible without niche expertise",
      "make batch outputs meaningfully distinct from each other",
    ],
    outputFormatInstruction:
      "Each question should be a single sentence ending with one question mark. " +
      "Do not number the questions. Do not include commentary outside the JSON.",
    createdAt: now(),
    updatedAt: now(),
  },
];

async function upsertBySlugAndVersion(
  ctx: MutationCtx,
  table:
    | "styles"
    | "tones"
    | "topics"
    | "promptBlueprints",
  doc: Record<string, any>
) {
  const existing = await ctx.db
    .query(table)
    .withIndex("by_slug", (q: any) => q.eq("slug", doc.slug))
    .collect();

  const sameVersion = existing.find((item: any) => item.version === doc.version);

  if (sameVersion) {
    await ctx.db.patch(sameVersion._id, {
      ...doc,
      createdAt: doc.createdAt ?? sameVersion.createdAt ?? sameVersion._creationTime ?? now(),
      updatedAt: now(),
    } as any);
    return { mode: "updated" as const, id: sameVersion._id };
  }

  const id = await ctx.db.insert(table, {
    ...doc,
    createdAt: doc.createdAt ?? now(),
    updatedAt: now(),
  } as any);

  return { mode: "inserted" as const, id };
}

export const seedTaxonomy = internalMutation({
  args: {},
  handler: async (ctx) => {
    const results: Record<string, { inserted: number; updated: number }> = {
      styles: { inserted: 0, updated: 0 },
      tones: { inserted: 0, updated: 0 },
      topics: { inserted: 0, updated: 0 },
      promptBlueprints: { inserted: 0, updated: 0 },
    };

    const inc = (
      r: { inserted: number; updated: number },
      mode: "inserted" | "updated"
    ) => {
      r[mode]++;
    };

    let styleIndex = 0;
    for (const doc of styles) {
      const res = await upsertBySlugAndVersion(
        ctx,
        "styles",
        toStyleDoc(doc, styleIndex),
      );
      inc(results.styles, res.mode);
      styleIndex += 1;
    }

    let toneIndex = 0;
    for (const doc of tones) {
      const res = await upsertBySlugAndVersion(
        ctx,
        "tones",
        toToneDoc(doc, toneIndex),
      );
      inc(results.tones, res.mode);
      toneIndex += 1;
    }

    let topicIndex = 0;
    for (const doc of topics) {
      const res = await upsertBySlugAndVersion(
        ctx,
        "topics",
        toTopicDoc(doc, topicIndex),
      );
      inc(results.topics, res.mode);
      topicIndex += 1;
    }

    for (const doc of promptBlueprints) {
      const res = await upsertBySlugAndVersion(ctx, "promptBlueprints", doc);
      inc(results.promptBlueprints, res.mode);
    }

    return {
      ok: true,
      ...results,
    };
  },
});
