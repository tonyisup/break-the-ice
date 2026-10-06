/** How many pending questions the admin review queue shows at once, oldest first. */
export const PENDING_QUEUE_LIMIT = 200;

/** The longest question a person can write, in characters. */
export const MAX_QUESTION_TEXT_LENGTH = 500;

/**
 * The most tags a person's question can carry, and the longest tag, in characters. Tag names
 * are short single words (see PREDEFINED_TAGS); the count leaves room above normal use, since
 * admin and generated questions can carry more tags than a person would pick.
 */
export const MAX_QUESTION_TAGS = 20;
export const MAX_QUESTION_TAG_LENGTH = 50;

/** The longest Team topic name, outcome guidance and boundaries a manager can write. */
export const MAX_TEAM_TOPIC_NAME_LENGTH = 100;
export const MAX_TEAM_TOPIC_GUIDANCE_LENGTH = 1000;
export const MAX_TEAM_TOPIC_BOUNDARIES_LENGTH = 1000;

/** The most questions one feed request generates. The feed page asks for no more, and the public feed action holds every caller to it. */
export const MAX_FEED_GENERATION_COUNT = 5;

export const ERROR_CODES = {
  AI_LIMIT_REACHED: "AI_LIMIT_REACHED",
  AI_BUDGET_PAUSED: "AI_BUDGET_PAUSED",
  AI_RATE_LIMITED: "AI_RATE_LIMITED",
  AI_PROMPT_TOO_LARGE: "AI_PROMPT_TOO_LARGE",
  AI_GENERATION_FAILED: "AI_GENERATION_FAILED",
  AI_COUNT_INVALID: "AI_COUNT_INVALID",
  QUESTION_TEXT_REQUIRED: "QUESTION_TEXT_REQUIRED",
  QUESTION_TEXT_TOO_LONG: "QUESTION_TEXT_TOO_LONG",
  QUESTION_TAGS_TOO_MANY: "QUESTION_TAGS_TOO_MANY",
  QUESTION_TAG_TOO_LONG: "QUESTION_TAG_TOO_LONG",
  QUESTION_MERGED_AS_DUPLICATE: "QUESTION_MERGED_AS_DUPLICATE",
  QUESTION_HAS_MERGED_COPIES: "QUESTION_HAS_MERGED_COPIES",
  SCHEDULE_NOT_DRAFT: "SCHEDULE_NOT_DRAFT",
  SCHEDULE_DAY_INACTIVE: "SCHEDULE_DAY_INACTIVE",
  TEAM_TOPIC_REQUIRED: "TEAM_TOPIC_REQUIRED",
  TEAM_TOPIC_TOO_LONG: "TEAM_TOPIC_TOO_LONG",
  STYLE_UNAVAILABLE: "STYLE_UNAVAILABLE",
  TONE_UNAVAILABLE: "TONE_UNAVAILABLE",
} as const;

export const ERROR_MESSAGES = {
  AI_LIMIT_REACHED: "AI generation limit reached. Please upgrade your plan for more generations.",
  AI_BUDGET_PAUSED: "New AI questions are paused for today. Check back tomorrow.",
  AI_RATE_LIMITED: "That's a lot of AI requests in a short time. Try again in a few minutes.",
  AI_MATRIX_FILL_LIMITED: "Your team has used its matrix fills for now. More become available through the day.",
  AI_DAILY_LIMITED: "You've used today's AI requests. More are available tomorrow.",
  AI_UNANSWERED_LIMITED: "Several of your AI requests are still running or got no answer today. Try again later.",
  AI_REMIX_TOO_LONG: "That question is too long to remix. Remix works on questions up to 1,000 characters.",
  AI_REMIX_RESULT_TOO_LONG: "That remix came out too long. Try remixing again.",
  AI_PROMPT_TOO_LARGE: "That request is too large to send to the AI.",
  AI_GENERATION_FAILED: "The AI sent back an answer we couldn't use. Please try again.",
  AI_COUNT_INVALID: "The number of questions to generate isn't a valid number.",
  QUESTION_TEXT_REQUIRED: "Please enter a question.",
  QUESTION_TEXT_TOO_LONG: `Questions can be up to ${MAX_QUESTION_TEXT_LENGTH} characters.`,
  QUESTION_TAGS_TOO_MANY: `Questions can have up to ${MAX_QUESTION_TAGS} tags.`,
  QUESTION_TAG_TOO_LONG: `Tags can be up to ${MAX_QUESTION_TAG_LENGTH} characters.`,
  QUESTION_MERGED_AS_DUPLICATE: "This question was merged with a matching one in the library, so it can no longer be edited.",
  QUESTION_HAS_MERGED_COPIES: "Other questions were merged into this one, so ask an admin to change or remove it.",
  // Team prompt refusals. A topic field shares one code per refusal, with a message
  // that names the field.
  SCHEDULE_NOT_DRAFT: "This schedule is already published or completed, so it can't be changed.",
  SCHEDULE_DAY_INACTIVE: "That day is no longer a delivery day for this schedule.",
  TEAM_TOPIC_NAME_REQUIRED: "Please enter a topic name.",
  TEAM_TOPIC_GUIDANCE_REQUIRED: "Please describe what this conversation should surface.",
  TEAM_TOPIC_NAME_TOO_LONG: `Topic names can be up to ${MAX_TEAM_TOPIC_NAME_LENGTH} characters.`,
  TEAM_TOPIC_GUIDANCE_TOO_LONG: `Answers to "What should this conversation surface?" can be up to ${MAX_TEAM_TOPIC_GUIDANCE_LENGTH.toLocaleString("en-US")} characters.`,
  TEAM_TOPIC_BOUNDARIES_TOO_LONG: `Boundaries can be up to ${MAX_TEAM_TOPIC_BOUNDARIES_LENGTH.toLocaleString("en-US")} characters.`,
  STYLE_UNAVAILABLE: "That style isn't available to your workspace. Pick another one.",
  TONE_UNAVAILABLE: "That tone isn't available to your workspace. Pick another one.",
} as const;
