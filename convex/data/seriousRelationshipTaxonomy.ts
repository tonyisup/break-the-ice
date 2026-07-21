type QualityRubric = {
  distinctness: number;
  generativity: number;
  readability: number;
  pairability: number;
  storyYield: number;
  safety: number;
  embeddingValue: number;
};

const quality = (
  distinctness: number,
  generativity: number,
  readability: number,
  pairability: number,
  storyYield: number,
  safety: number,
  embeddingValue: number,
): QualityRubric => ({
  distinctness,
  generativity,
  readability,
  pairability,
  storyYield,
  safety,
  embeddingValue,
});

/**
 * Style mechanics for questions that build closeness through specific,
 * voluntary disclosure rather than shock, diagnosis, or forced confession.
 */
export const seriousRelationshipStyles = [
  {
    slug: "formative-moment",
    name: "Formative Moment",
    status: "active" as const,
    version: 1,
    description:
      "Connects a concrete past experience to a present-day value, habit, or way of relating.",
    structure:
      "What <specific ordinary moment, conversation, or experience> changed how you <approach, value, or understand> <part of life>, and what stayed with you?",
    structuralInstruction:
      "Ask for one bounded experience and the present-day meaning it carries. Keep the premise ordinary enough to answer without disclosing trauma.",
    aiGuidance:
      "Invite a specific story, then connect it to how the person thinks or acts now. Prefer everyday turning points, advice that gained meaning over time, and quietly influential people or moments. Do not assume hardship, loss, family closeness, or a dramatic backstory.",
    safetyNotes:
      "Make disclosure voluntary and answerable at multiple depths. Never ask for trauma, abuse, grief, estrangement, or a person's most painful memory.",
    commonFailureModes: [
      "assumes a painful or dramatic past",
      "asks for an entire life story",
      "uses therapy or diagnosis language",
      "stops at nostalgia without connecting to the present",
    ],
    distinctFrom: ["open-ended", "time-capsule-snapshot", "values-in-practice"],
    examples: [
      {
        text: "What ordinary moment taught you something important about the kind of friend you want to be?",
        note: "A bounded memory connected to a present relational value.",
      },
      {
        text: "What's a piece of advice you didn't understand until life gave it context?",
        note: "Invites a story without presuming pain.",
      },
      {
        text: "What experience quietly changed what success means to you?",
        note: "Serious and identity-revealing without requiring a dramatic confession.",
      },
    ],
    antiExamples: [
      {
        text: "What is your deepest childhood wound?",
        note: "Clinical, coercive, and explicitly trauma-seeking.",
      },
      {
        text: "How did your past make you who you are?",
        note: "Too broad to produce a concrete, conversational answer.",
      },
    ],
    quality: quality(5, 5, 5, 4, 5, 4, 5),
    cognitiveMove: "connect",
    socialFunction:
      "Shows how lived experience became present-day meaning, giving others a respectful path into the person's story.",
    answerShape: "specific story plus present-day meaning",
    idealPromptLength: { minChars: 55, maxChars: 165 },
    riskLevel: "medium" as const,
    color: "#4338CA",
    icon: "BookOpen",
    order: 7,
  },
  {
    slug: "values-in-practice",
    name: "Values in Practice",
    status: "active" as const,
    version: 1,
    description:
      "Reveals values through real choices, routines, and trade-offs instead of abstract labels.",
    structure:
      "What <ordinary choice, commitment, or use of time> shows what you value, and why does it keep mattering to you?",
    structuralInstruction:
      "Ask where a value becomes visible in an ordinary behavior, decision, boundary, or use of time. Require a concrete example rather than a virtue label.",
    aiGuidance:
      "Ground values in observable life: what someone protects, makes time for, follows through on, or feels quietly proud of. Invite explanation without grading the answer. Avoid moral tests, political sorting, virtue signaling, and prompts with an obviously admirable response.",
    safetyNotes:
      "Do not frame the answer as proof of goodness or maturity. Avoid money, religion, politics, and family duty unless the selected topic explicitly calls for them.",
    commonFailureModes: [
      "asks for abstract values with no lived example",
      "has an obviously virtuous answer",
      "sounds like a job interview",
      "turns a preference into a moral judgment",
    ],
    distinctFrom: ["open-ended", "formative-moment", "would-you-rather"],
    examples: [
      {
        text: "What's an ordinary choice you make that says more about your values than any label could?",
        note: "Concrete behavior replaces abstract self-description.",
      },
      {
        text: "When have you felt proud of how you handled something, even though nobody else noticed?",
        note: "Surfaces internal standards without demanding achievement.",
      },
      {
        text: "What do you keep making time for when life gets crowded, and why does it keep earning that time?",
        note: "Reveals priorities through a real constraint.",
      },
    ],
    antiExamples: [
      {
        text: "What are your three core values?",
        note: "Abstract, generic, and easy to answer performatively.",
      },
      {
        text: "Would you lie to protect someone you love?",
        note: "Moral dilemma framing creates judgment rather than connection.",
      },
    ],
    quality: quality(5, 5, 5, 5, 5, 4, 5),
    cognitiveMove: "demonstrate",
    socialFunction:
      "Makes priorities legible through behavior, creating substantive conversation without moral scoring.",
    answerShape: "concrete choice or habit plus the value behind it",
    idealPromptLength: { minChars: 55, maxChars: 160 },
    riskLevel: "medium" as const,
    color: "#0F766E",
    icon: "Scale",
    order: 8,
  },
  {
    slug: "how-to-know-me",
    name: "How to Know Me",
    status: "active" as const,
    version: 1,
    description:
      "Invites someone to explain what helps them feel understood, trusted, supported, or at ease.",
    structure:
      "What <specific cue, action, or condition> helps you feel <understood, cared for, trusted, or at ease>, and what makes it meaningful?",
    structuralInstruction:
      "Ask for one relational preference or signal and enough context to understand it. Phrase the prompt as an invitation, not a test or diagnosis.",
    aiGuidance:
      "Focus on usable, human-scale knowledge: helpful check-ins, signs of trust, ways people show attention, conditions for honest conversation, or things others often learn with time. Keep answers optional in depth. Avoid attachment labels, conflict autopsies, sexual intimacy, secrets, and demands to disclose unmet needs.",
    safetyNotes:
      "Never pressure the respondent to reveal secrets, relationship history, family dynamics, or painful experiences. Leave room for a simple preference-based answer.",
    commonFailureModes: [
      "sounds like a relationship assessment",
      "demands vulnerability instead of inviting it",
      "asks for secrets or painful history",
      "uses clinical labels or therapy jargon",
    ],
    distinctFrom: ["reflective", "values-in-practice", "open-ended"],
    examples: [
      {
        text: "What kind of check-in makes you feel genuinely cared for rather than simply monitored?",
        note: "Produces practical relational knowledge with room for nuance.",
      },
      {
        text: "What's something people usually understand about you only after knowing you for a while?",
        note: "Invites intimacy without demanding a secret.",
      },
      {
        text: "When you trust someone, what becomes easier for you to share or ask for?",
        note: "Relationally revealing while preserving choice over depth.",
      },
    ],
    antiExamples: [
      {
        text: "What's your attachment style, and how has it damaged your relationships?",
        note: "Clinical, leading, and shame-oriented.",
      },
      {
        text: "What secret have you never told anyone?",
        note: "Coerces disclosure and creates unsafe social pressure.",
      },
    ],
    quality: quality(5, 5, 5, 4, 5, 4, 5),
    cognitiveMove: "articulate",
    socialFunction:
      "Gives people a respectful vocabulary for understanding and caring for one another.",
    answerShape: "relational preference or cue plus context",
    idealPromptLength: { minChars: 55, maxChars: 165 },
    riskLevel: "medium" as const,
    color: "#BE185D",
    icon: "HeartHandshake",
    order: 9,
  },
  {
    slug: "future-chapter",
    name: "Future Chapter",
    status: "active" as const,
    version: 1,
    description:
      "Explores hopes and direction through a bounded future chapter rather than a grand life plan.",
    structure:
      "Looking toward <bounded future>, what would make <part of life> feel <meaningful, settled, alive, or true to you>, even if <external measure> stayed modest?",
    structuralInstruction:
      "Use a realistic time horizon and ask what quality or change would make that chapter meaningful. Separate personal meaning from status or achievement.",
    aiGuidance:
      "Invite hopes that reveal priorities without requiring certainty. Ask about a next chapter, a quality someone wants more of, or what meaningful progress would feel like. Avoid five-year-plan language, productivity pressure, fantasies of wealth, assumptions about marriage or children, and predictions of regret.",
    safetyNotes:
      "Keep the future open and non-prescriptive. Do not assume conventional milestones, current dissatisfaction, or access to money, health, partnership, or parenthood.",
    commonFailureModes: [
      "sounds like a career-planning exercise",
      "assumes conventional life milestones",
      "rewards impressive goals over honest hopes",
      "asks for certainty about an unknowable future",
    ],
    distinctFrom: ["desert-island", "values-in-practice", "bucket-list-rank"],
    examples: [
      {
        text: "What would make the next year feel meaningful even if it didn't look impressive from the outside?",
        note: "Separates personal meaning from performance.",
      },
      {
        text: "What part of your life would you like to feel more settled three years from now?",
        note: "Bounded and serious without prescribing a milestone.",
      },
      {
        text: "What are you hoping to become better at giving the people you care about?",
        note: "Future-oriented and relational rather than achievement-driven.",
      },
    ],
    antiExamples: [
      {
        text: "Where do you see yourself in five years?",
        note: "Generic interview language with little relational texture.",
      },
      {
        text: "When do you want to get married and have children?",
        note: "Prescriptive, intrusive, and built on unsupported assumptions.",
      },
    ],
    quality: quality(5, 5, 5, 4, 5, 4, 5),
    cognitiveMove: "envision",
    socialFunction:
      "Reveals what someone is moving toward and what a meaningful life chapter means to them.",
    answerShape: "bounded hope plus why it would matter",
    idealPromptLength: { minChars: 55, maxChars: 165 },
    riskLevel: "medium" as const,
    color: "#B45309",
    icon: "TrendingUp",
    order: 10,
  },
];

/**
 * Serious, intimacy-capable language registers. Each remains usable with any
 * style and avoids equating closeness with emotional pressure.
 */
export const seriousRelationshipTones = [
  {
    slug: "candid",
    name: "Candid",
    status: "active" as const,
    version: 1,
    description:
      "Plainspoken, honest, and direct enough for real answers without becoming confrontational.",
    aiGuidance:
      "Use clear, adult, unembellished language that makes honest uncertainty and nuanced answers welcome. Ask the meaningful part directly, but preserve the respondent's agency. Avoid provocative framing, forced confession, bluntness for its own sake, and claims that there is one correct emotional answer.",
    safetyNotes:
      "Directness must not become pressure. Do not demand secrets, admissions, painful history, or disclosure beyond what the respondent chooses.",
    commonFailureModes: [
      "confuses honesty with harshness",
      "corners the respondent into disclosure",
      "sounds accusatory",
      "uses provocation to manufacture depth",
    ],
    distinctFrom: ["bold", "reflective", "tender"],
    examples: [
      {
        text: "What's something you need from close relationships that you're getting better at asking for?",
        note: "Direct and intimate while leaving the answerer's depth under their control.",
      },
    ],
    antiExamples: [
      {
        text: "Be honest: what do people dislike most about you?",
        note: "Hostile, leading, and shame-oriented.",
      },
    ],
    quality: quality(5, 5, 5, 4, 5, 4, 5),
    languageCues: [
      "plainspoken",
      "direct",
      "honest",
      "specific",
      "nonjudgmental",
      "comfortable with uncertainty",
    ],
    avoidCues: [
      "be honest",
      "interrogation",
      "brutal honesty",
      "gotcha framing",
      "forced confession",
    ],
    emotionalAxes: {
      warmth: 3,
      playfulness: 1,
      seriousness: 5,
      surrealness: 1,
      sharpness: 3,
      intimacy: 5,
    },
    color: "#334155",
    icon: "MessageCircle",
    order: 6,
  },
  {
    slug: "tender",
    name: "Tender",
    status: "active" as const,
    version: 1,
    description:
      "Warm, careful, and emotionally attentive without becoming sentimental or clinical.",
    aiGuidance:
      "Use gentle, sincere language that treats the answer as something worth receiving carefully. Invite closeness through specificity and warmth, not emotional intensity. Avoid therapy voice, pity, precious metaphors, assumptions of pain, and language that implies vulnerability is owed.",
    safetyNotes:
      "Tenderness should lower pressure, not signal that a painful answer is expected. Keep every question answerable at a light or deeper level.",
    commonFailureModes: [
      "becomes saccharine",
      "assumes sadness or hurt",
      "sounds like a therapist",
      "uses poetic language that obscures the question",
    ],
    distinctFrom: ["cozy", "reflective", "candid"],
    examples: [
      {
        text: "What small act makes you feel remembered by someone?",
        note: "Warm and relational without demanding a vulnerable story.",
      },
    ],
    antiExamples: [
      {
        text: "What ache in your heart most needs to be witnessed?",
        note: "Overwritten, clinical-adjacent, and presumes pain.",
      },
    ],
    quality: quality(5, 5, 5, 5, 5, 4, 5),
    languageCues: [
      "gentle",
      "sincere",
      "attentive",
      "warm",
      "unhurried",
      "emotionally spacious",
    ],
    avoidCues: [
      "therapy-speak",
      "pity",
      "precious metaphors",
      "presumed pain",
      "emotional obligation",
    ],
    emotionalAxes: {
      warmth: 5,
      playfulness: 1,
      seriousness: 4,
      surrealness: 1,
      sharpness: 1,
      intimacy: 5,
    },
    color: "#9F1239",
    icon: "Heart",
    order: 7,
  },
  {
    slug: "grounded",
    name: "Grounded",
    status: "active" as const,
    version: 1,
    description:
      "Steady, mature, and concrete; serious without sounding grand or emotionally loaded.",
    aiGuidance:
      "Use calm, practical language and anchor big ideas in ordinary life. Prefer real choices, routines, relationships, and observable moments over abstract identity claims. Avoid grandiosity, self-help slogans, philosophical vagueness, and language that turns the prompt into an assessment.",
    safetyNotes:
      "Keep the seriousness proportionate and everyday. Do not imply that a simple answer is shallow or that the respondent needs to justify their life.",
    commonFailureModes: [
      "too abstract",
      "sounds like a self-help workbook",
      "mistakes seriousness for heaviness",
      "asks the respondent to summarize their whole identity",
    ],
    distinctFrom: ["reflective", "professional", "tender"],
    examples: [
      {
        text: "What does a good life look like in the ordinary parts of your week?",
        note: "A large idea made concrete and answerable.",
      },
    ],
    antiExamples: [
      {
        text: "What is the ultimate purpose that defines your existence?",
        note: "Grandiose, abstract, and too demanding for conversation.",
      },
    ],
    quality: quality(5, 5, 5, 5, 5, 5, 5),
    languageCues: [
      "steady",
      "mature",
      "concrete",
      "calm",
      "practical",
      "unforced",
    ],
    avoidCues: [
      "grandiosity",
      "self-help slogans",
      "philosophical fog",
      "clinical assessment",
      "performative depth",
    ],
    emotionalAxes: {
      warmth: 3,
      playfulness: 1,
      seriousness: 5,
      surrealness: 1,
      sharpness: 2,
      intimacy: 4,
    },
    color: "#3F6212",
    icon: "Anchor",
    order: 8,
  },
];
