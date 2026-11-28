export type OccasionIconName =
  | "sparkles"
  | "utensils"
  | "car"
  | "heart"
  | "home"
  | "dice"
  | "message-circle"
  | "users";

type TaxonomyLabel = { name: string; color: string };

// Names and colors as the live deck shows them, so sample cards look like real ones.
// occasions.test.ts checks every slug against convex/data/briefLines.ts.
export const SAMPLE_STYLES = {
  "desert-island": { name: "Desert Island", color: "#0F766E" },
  "formative-moment": { name: "Formative Moment", color: "#4338CA" },
  "future-chapter": { name: "Future Chapter", color: "#B45309" },
  "gratitude-lightning": { name: "Lightning Round", color: "#81ECEC" },
  "how-to-know-me": { name: "How to Know Me", color: "#BE185D" },
  "if-this-but-that": { name: "If This But That", color: "#7C3AED" },
  "micro-ritual": { name: "Micro-Ritual", color: "#318505" },
  "one-word-whip-around": { name: "One-Word Whip-Around", color: "#7C3AED" },
  "open-ended": { name: "Open Ended", color: "#0F766E" },
  "rapid-fire-either": { name: "Either/Or", color: "#AA96DA" },
  "super-power-caveats": { name: "Super-Power Caveats", color: "#1D4ED8" },
  "time-capsule-snapshot": { name: "Time-Capsule Snapshot", color: "#7C3AED" },
  "values-in-practice": { name: "Values in Practice", color: "#0F766E" },
  "would-you-rather": { name: "Would You Rather", color: "#D97706" },
} satisfies Record<string, TaxonomyLabel>;

export const SAMPLE_TONES = {
  candid: { name: "Candid", color: "#334155" },
  cozy: { name: "Cozy", color: "#0891B2" },
  "deep-thoughtful": { name: "Thoughtful", color: "#6A67CE" },
  "fun-silly": { name: "Fun & Silly", color: "#FFAB91" },
  nostalgic: { name: "Nostalgic", color: "#F97316" },
  playful: { name: "Playful", color: "#EA580C" },
  "wholesome-uplifting": { name: "Wholesome", color: "#81C784" },
  witty: { name: "Witty", color: "#EA580C" },
} satisfies Record<string, TaxonomyLabel>;

export const SAMPLE_TOPICS = {
  "childhood-nostalgia": { name: "Childhood Nostalgia", color: "#EC4899" },
  food: { name: "Food", color: "#14B8A6" },
  "home-life": { name: "Home Life", color: "#22C55E" },
  "internet-habits": { name: "Internet Habits", color: "#F59E0B" },
  music: { name: "Music", color: "#EC4899" },
  technology: { name: "Technology", color: "#8B5CF6" },
  travel: { name: "Travel", color: "#22C55E" },
} satisfies Record<string, TaxonomyLabel>;

export type OccasionSampleCard = {
  style: keyof typeof SAMPLE_STYLES;
  tone: keyof typeof SAMPLE_TONES;
  topic: keyof typeof SAMPLE_TOPICS;
  text: string;
};

/** The display names and colors for a sample card's style, tone and topic. */
export const describeSampleCard = (card: OccasionSampleCard) => ({
  style: SAMPLE_STYLES[card.style],
  tone: SAMPLE_TONES[card.tone],
  topic: SAMPLE_TOPICS[card.topic],
});

export type OccasionFilters = {
  style?: string;
  tone?: string;
  topic?: string;
};

export type OccasionConfig = {
  slug: string;
  name: string;
  shortName: string;
  tagline: string;
  seoTitle: string;
  seoDescription: string;
  heroHeading: string;
  heroCopy: string;
  accentColor: string;
  icon: OccasionIconName;
  filters: OccasionFilters;
  tips: string[];
  sampleCards: OccasionSampleCard[];
};

export const OCCASIONS: readonly OccasionConfig[] = [
  {
    slug: "first-date",
    name: "First Date",
    shortName: "First date",
    tagline: "Skip the interview questions and find out who they actually are.",
    seoTitle: "First Date Conversation Starters | Break the Ice(berg)",
    seoDescription:
      "Playful, natural first date questions that skip the resume talk and spark real conversation.",
    heroHeading: "First date questions that don’t feel like a job interview.",
    heroCopy:
      "Trade “so, what do you do?” for playful, candid prompts that let both of you relax, laugh, and see how the other person thinks.",
    accentColor: "#E11D48",
    icon: "sparkles",
    filters: {
      tone: "playful",
    },
    tips: [
      "Keep it light early on: this deck stays Playful, so nobody feels put on the spot.",
      "Answer the question yourself too so it feels like a conversation, not a quiz.",
      "Use the Remix button if you want a slightly bolder or cozier spin on any prompt.",
    ],
    sampleCards: [
      {
        style: "open-ended",
        tone: "playful",
        topic: "home-life",
        text: "What’s a completely harmless hill you’re willing to die on?",
      },
      {
        style: "micro-ritual",
        tone: "playful",
        topic: "home-life",
        text: "What tiny, unnecessary step do you always take when making coffee, getting ready, or winding down?",
      },
      {
        style: "would-you-rather",
        tone: "playful",
        topic: "travel",
        text: "Would you rather always know the best restaurant in any city or always get the best seat on every flight?",
      },
      {
        style: "desert-island",
        tone: "playful",
        topic: "music",
        text: "You can only keep three albums for the rest of the year—which ones survive?",
      },
    ],
  },
  {
    slug: "dinner-party",
    name: "Dinner Party",
    shortName: "Dinner party",
    tagline:
      "Warm, lively questions that pull the whole table into one conversation.",
    seoTitle: "Dinner Party Conversation Starters | Break the Ice(berg)",
    seoDescription:
      "Thoughtful and lively dinner party questions to keep the whole table talking, laughing, and sharing stories.",
    heroHeading: "Give the table somewhere better to go than small talk.",
    heroCopy:
      "Whether your guests already know each other or just met at the door, one good question turns a quiet table into the best part of the night.",
    accentColor: "#D97706",
    icon: "utensils",
    filters: {
      tone: "cozy",
    },
    tips: [
      "Wait until everyone has a drink or plate in front of them, then toss one card into the middle.",
      "Want a livelier round? Switch the tone to Bold once everyone has settled in.",
      "Like a few cards before guests arrive so you have 3–4 backups ready.",
    ],
    sampleCards: [
      {
        style: "open-ended",
        tone: "cozy",
        topic: "food",
        text: "What meal from someone else’s kitchen do you still think about years later?",
      },
      {
        style: "open-ended",
        tone: "cozy",
        topic: "food",
        text: "What dish would you happily eat every Sunday for the rest of your life?",
      },
      {
        style: "time-capsule-snapshot",
        tone: "cozy",
        topic: "childhood-nostalgia",
        text: "What smell immediately drops you back into a specific season of your life?",
      },
      {
        style: "open-ended",
        tone: "cozy",
        topic: "food",
        text: "If you had to host a last-minute dinner for six people in 30 minutes, what’s on the table?",
      },
    ],
  },
  {
    slug: "road-trip",
    name: "Road Trip",
    shortName: "Road trip",
    tagline:
      "Pass the miles with debates, hypotheticals, and stories you haven’t heard yet.",
    seoTitle: "Road Trip Questions for Friends & Couples | Break the Ice(berg)",
    seoDescription:
      "Fun, debate-worthy road trip questions, would-you-rathers, and stories to make long drives fly by.",
    heroHeading: "Make the next three hours of highway fly by.",
    heroCopy:
      "Built for the passenger seat: rapid hypotheticals, playful debates, and nostalgic rabbit holes that beat another quiet stretch of interstate.",
    accentColor: "#0E7490",
    icon: "car",
    filters: {
      topic: "travel",
    },
    tips: [
      "Hand the phone to the co-pilot and draw a new card every time the playlist ends.",
      "Would You Rather and Super-Power Caveats work best when everyone has to defend their pick.",
      "Switch to the Nostalgic tone or the Music topic once the sun goes down.",
    ],
    sampleCards: [
      {
        style: "would-you-rather",
        tone: "fun-silly",
        topic: "travel",
        text: "Would you rather teleport anywhere instantly but always arrive 20 minutes late, or fly first class anywhere for free?",
      },
      {
        style: "super-power-caveats",
        tone: "playful",
        topic: "travel",
        text: "You can speak every language fluently, but only when whispering—do you take it?",
      },
      {
        style: "open-ended",
        tone: "nostalgic",
        topic: "travel",
        text: "What’s the best detour or wrong turn you’ve ever taken on a trip?",
      },
      {
        style: "if-this-but-that",
        tone: "witty",
        topic: "travel",
        text: "You get free concert tickets for life, but you can never listen to recorded music in the car again. Deal or no deal?",
      },
    ],
  },
  {
    slug: "date-night",
    name: "Date Night",
    shortName: "Date night",
    tagline: "Go deeper than logistics and reconnect over what’s next.",
    seoTitle:
      "Date Night & Couples Conversation Starters | Break the Ice(berg)",
    seoDescription:
      "Thoughtful, warm date night questions for couples to reconnect, laugh, and talk about more than the weekly calendar.",
    heroHeading: "Talk about more than this week’s errands.",
    heroCopy:
      "Even when you know each other well, the right question opens up a new story, a shared memory, or a glimpse of the next chapter.",
    accentColor: "#9333EA",
    icon: "heart",
    filters: {
      tone: "deep-thoughtful",
    },
    tips: [
      "Put phones face down after drawing a card and give each question a few minutes to breathe.",
      "If a card lands heavy, switch the tone to Cozy for a round, then come back.",
      "Like the ones you want to revisit on an anniversary or weekend away.",
    ],
    sampleCards: [
      {
        style: "future-chapter",
        tone: "deep-thoughtful",
        topic: "home-life",
        text: "What’s one small tradition you hope we’re still doing five years from now?",
      },
      {
        style: "how-to-know-me",
        tone: "deep-thoughtful",
        topic: "home-life",
        text: "When you’ve had a rough day, what’s the quickest way someone can actually help without saying much?",
      },
      {
        style: "formative-moment",
        tone: "deep-thoughtful",
        topic: "home-life",
        text: "What piece of advice sounded like a cliché until you lived through it yourself?",
      },
      {
        style: "open-ended",
        tone: "deep-thoughtful",
        topic: "home-life",
        text: "What small, ordinary routine in your week quietly makes everything else better?",
      },
    ],
  },
  {
    slug: "family-dinner",
    name: "Family Dinner",
    shortName: "Family dinner",
    tagline: "All-ages prompts for weeknight tables, holidays, and reunions.",
    seoTitle:
      "Family Dinner & Holiday Conversation Starters | Break the Ice(berg)",
    seoDescription:
      "Wholesome, nostalgic conversation starters for family dinners, Thanksgiving tables, and multi-generational gatherings.",
    heroHeading: "Questions everyone at the table can actually answer.",
    heroCopy:
      "From weeknight dinners to holiday reunions—warm, nostalgic prompts that bridge generations without stepping on any landmines.",
    accentColor: "#059669",
    icon: "home",
    filters: {
      tone: "wholesome-uplifting",
    },
    tips: [
      "Let the youngest or quietest person at the table go first—or pick the card.",
      "Time-Capsule Snapshot cards are gold when grandparents and kids are at the same table.",
      "Keep a Lightning Round card handy for a quick, warm round before dessert.",
    ],
    sampleCards: [
      {
        style: "time-capsule-snapshot",
        tone: "wholesome-uplifting",
        topic: "childhood-nostalgia",
        text: "What object from your childhood bedroom would instantly take you back if you held it today?",
      },
      {
        style: "gratitude-lightning",
        tone: "wholesome-uplifting",
        topic: "home-life",
        text: "First thing that comes to mind: one small win from this week, in five words or fewer.",
      },
      {
        style: "open-ended",
        tone: "wholesome-uplifting",
        topic: "food",
        text: "What snack or treat from growing up do you still secretly crave?",
      },
      {
        style: "one-word-whip-around",
        tone: "wholesome-uplifting",
        topic: "home-life",
        text: "In one word, what’s been the mood of your week so far?",
      },
    ],
  },
  {
    slug: "game-night",
    name: "Game Night",
    shortName: "Game night",
    tagline: "Fast, funny prompts and playful debates to kick off the night.",
    seoTitle: "Game Night & Party Icebreaker Questions | Break the Ice(berg)",
    seoDescription:
      "Funny party icebreakers, rapid-fire either/or questions, and playful debates to warm up game night.",
    heroHeading: "Warm up the room before the board comes out.",
    heroCopy:
      "Fast, silly, and just a little chaotic—great for waiting on late arrivals, breaking teams in, or keeping laughs going between rounds.",
    accentColor: "#7C3AED",
    icon: "dice",
    filters: {
      tone: "fun-silly",
    },
    tips: [
      "Use an Either/Or card as a quick show-of-hands round to wake up a big group.",
      "Super-Power Caveats and If This But That spark instant friendly arguments.",
      "Once everyone’s loosened up, switch the tone to Bold or Edgy & Provocative.",
    ],
    sampleCards: [
      {
        style: "super-power-caveats",
        tone: "fun-silly",
        topic: "travel",
        text: "You can fly, but only at brisk walking speed and two feet off the ground—how are you using it?",
      },
      {
        style: "rapid-fire-either",
        tone: "fun-silly",
        topic: "travel",
        text: "Always hit green lights or always find front-row parking?",
      },
      {
        style: "if-this-but-that",
        tone: "fun-silly",
        topic: "music",
        text: "You win $100,000, but every time you enter a room a dramatic movie soundtrack plays out loud. In or out?",
      },
      {
        style: "one-word-whip-around",
        tone: "fun-silly",
        topic: "food",
        text: "One word: the single best late-night snack.",
      },
    ],
  },
  {
    slug: "group-chat",
    name: "Group Chat",
    shortName: "Group chat",
    tagline: "Drop one card into a quiet chat and watch everyone chime in.",
    seoTitle: "Questions to Revive a Group Chat | Break the Ice(berg)",
    seoDescription:
      "Witty, shareable questions and quick debates you can copy and drop into any group chat.",
    heroHeading: "Revive a quiet group chat in one message.",
    heroCopy:
      "Short, punchy prompts designed to get instant replies—copy any card and drop it straight into iMessage, WhatsApp, or Discord.",
    accentColor: "#2563EB",
    icon: "message-circle",
    filters: {
      tone: "witty",
    },
    tips: [
      "Pick an Either/Or card so people can reply in two seconds.",
      "Tap Share on any card to send it straight into the thread.",
      "Save a few in your Liked list for slow Tuesday afternoons.",
    ],
    sampleCards: [
      {
        style: "open-ended",
        tone: "witty",
        topic: "internet-habits",
        text: "How many browser tabs do you have open right now, and what’s the oldest one about?",
      },
      {
        style: "if-this-but-that",
        tone: "witty",
        topic: "technology",
        text: "Your phone battery never dies again, but autocorrect is permanently turned off. Taking it?",
      },
      {
        style: "rapid-fire-either",
        tone: "witty",
        topic: "internet-habits",
        text: "Voice notes or three-paragraph texts?",
      },
      {
        style: "micro-ritual",
        tone: "witty",
        topic: "technology",
        text: "What app do you close only to immediately reopen two seconds later?",
      },
    ],
  },
  {
    slug: "new-friends",
    name: "Meeting New People",
    shortName: "New friends",
    tagline: "Easy, low-pressure openers for mixers, hangouts, and new faces.",
    seoTitle:
      "Icebreaker Questions for Meeting New People | Break the Ice(berg)",
    seoDescription:
      "Low-pressure, natural icebreaker questions for parties, meetups, and getting past small talk with new people.",
    heroHeading: "Get past small talk without making it weird.",
    heroCopy:
      "Low-stakes, genuinely interesting openers for housewarmings, friend-of-a-friend hangouts, and any room full of new faces.",
    accentColor: "#0F766E",
    icon: "users",
    filters: {
      tone: "candid",
    },
    tips: [
      "Start with something grounded and relatable—everyone has an answer for everyday habits.",
      "Avoid overly personal prompts until the group has warmed up.",
      "One-Word Whip-Around is an easy way to include a whole circle in under a minute.",
    ],
    sampleCards: [
      {
        style: "micro-ritual",
        tone: "candid",
        topic: "home-life",
        text: "What’s a tiny routine you have that nobody asked for, yet you refuse to skip?",
      },
      {
        style: "open-ended",
        tone: "candid",
        topic: "music",
        text: "What’s something you got into recently that you’d happily recommend to a stranger?",
      },
      {
        style: "one-word-whip-around",
        tone: "candid",
        topic: "travel",
        text: "One word: the best city or town you’ve ever visited.",
      },
      {
        style: "values-in-practice",
        tone: "candid",
        topic: "home-life",
        text: "What’s a small kindness someone did for you that you still try to pass on?",
      },
    ],
  },
] as const;

// A Map, not a plain object: slugs come from the URL, and a plain object would also
// answer for built-in keys such as "constructor" or "__proto__".
const OCCASIONS_BY_SLUG: ReadonlyMap<string, OccasionConfig> = new Map(
  OCCASIONS.map((occasion) => [occasion.slug, occasion]),
);

export const getOccasionBySlug = (
  slug: string | null | undefined,
): OccasionConfig | undefined => {
  if (!slug) return undefined;
  return OCCASIONS_BY_SLUG.get(slug);
};

const OCCASION_FILTER_KEYS = ["style", "tone", "topic"] as const;

/**
 * Writes the occasion's filters into `params` as plain style/tone/topic filters, keeping
 * any filter the params already set, and removes `occasion`.
 */
export const applyOccasionFilters = (
  params: URLSearchParams,
  occasion: Pick<OccasionConfig, "filters">,
) => {
  for (const key of OCCASION_FILTER_KEYS) {
    const value = occasion.filters[key];
    if (value && !params.get(key)) params.set(key, value);
  }
  params.delete("occasion");
};

export const getOccasionAppUrl = (occasion: Pick<OccasionConfig, "slug">) =>
  `/app?occasion=${encodeURIComponent(occasion.slug)}`;
