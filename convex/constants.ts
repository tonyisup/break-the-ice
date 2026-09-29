export const ERROR_CODES = {
  AI_LIMIT_REACHED: "AI_LIMIT_REACHED",
  AI_BUDGET_PAUSED: "AI_BUDGET_PAUSED",
  AI_RATE_LIMITED: "AI_RATE_LIMITED",
  AI_PROMPT_TOO_LARGE: "AI_PROMPT_TOO_LARGE",
  AI_GENERATION_FAILED: "AI_GENERATION_FAILED",
} as const;

export const ERROR_MESSAGES = {
  AI_LIMIT_REACHED: "AI generation limit reached. Please upgrade your plan for more generations.",
  AI_BUDGET_PAUSED: "New AI questions are paused for today. Check back tomorrow.",
  AI_RATE_LIMITED: "That's a lot of AI requests in a short time. Try again in a few minutes.",
  AI_MATRIX_FILL_LIMITED: "Your team has used its matrix fills for now. More become available through the day.",
  AI_DAILY_LIMITED: "You've used today's AI requests. More are available tomorrow.",
  AI_REMIX_TOO_LONG: "That question is too long to remix. Remix works on questions up to 1,000 characters.",
  AI_PROMPT_TOO_LARGE: "That request is too large to send to the AI.",
  AI_GENERATION_FAILED: "The AI sent back an answer we couldn't use. Please try again.",
} as const;
