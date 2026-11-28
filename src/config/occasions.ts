export type OccasionIconName =
  | "sparkles"
  | "utensils"
  | "car"
  | "heart"
  | "home"
  | "dice"
  | "message-circle"
  | "users";

export type OccasionSampleCard = {
  style: string;
  styleColor: string;
  tone: string;
  toneColor: string;
  topic: string;
  text: string;
};

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
      style: "open-ended",
      tone: "playful",
    },
    tips: [
      "Keep it light early on—pick a Playful or Witty card before going deeper.",
      "Answer the question yourself too so it feels like a conversation, not a quiz.",
      "Use the Remix button if you want a slightly bolder or cozier spin on any prompt.",
    ],
    sampleCards: [
      {
        style: "Open-ended",
        styleColor: "#0E7490",
        tone: "Playful",
        toneColor: "#059669",
        topic: "Everyday joy",
        text: "What’s a completely harmless hill you’re willing to die on?",
      },
      {
        style: "Micro-ritual",
        styleColor: "#D97706",
        tone: "Candid",
        toneColor: "#2563EB",
        topic: "Home life",
        text: "What tiny, unnecessary step do you always take when making coffee, getting ready, or winding down?",
      },
      {
        style: "Would you rather",
        styleColor: "#7C3AED",
        tone: "Playful",
        toneColor: "#059669",
        topic: "Travel",
        text: "Would you rather always know the best restaurant in any city or always get the best seat on every flight?",
      },
      {
        style: "Desert island",
        styleColor: "#0F766E",
        tone: "Witty",
        toneColor: "#E11D48",
        topic: "Music",
        text: "You can only keep three albums for the rest of the year—which ones survive?",
      },
    ],
  },
  {
    slug: "dinner-party",
    name: "Dinner Party",
    shortName: "Dinner party",
    tagline: "Warm, lively questions that pull the whole table into one conversation.",
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
      topic: "food",
    },
    tips: [
      "Wait until everyone has a drink or plate in front of them, then toss one card into the middle.",
      "Mix one Food or Travel prompt with one Hot Take to keep the energy moving.",
      "Save your favorites before guests arrive so you have 3–4 backups ready.",
    ],
    sampleCards: [
      {
        style: "Open-ended",
        styleColor: "#0E7490",
        tone: "Cozy",
        toneColor: "#D97706",
        topic: "Food",
        text: "What meal from someone else’s kitchen do you still think about years later?",
      },
      {
        style: "Hot take",
        styleColor: "#E11D48",
        tone: "Bold",
        toneColor: "#7C3AED",
        topic: "Food",
        text: "What’s an overrated restaurant trend everyone politely pretends to enjoy?",
      },
      {
        style: "Time capsule",
        styleColor: "#0F766E",
        tone: "Nostalgic",
        toneColor: "#D97706",
        topic: "Everyday joy",
        text: "What smell immediately drops you back into a specific season of your life?",
      },
      {
        style: "Open-ended",
        styleColor: "#0E7490",
        tone: "Witty",
        toneColor: "#2563EB",
        topic: "Culture",
        text: "If you had to host a last-minute dinner for six people in 30 minutes, what’s on the table?",
      },
    ],
  },
  {
    slug: "road-trip",
    name: "Road Trip",
    shortName: "Road trip",
    tagline: "Pass the miles with debates, hypotheticals, and stories you haven’t heard yet.",
    seoTitle: "Road Trip Questions for Friends & Couples | Break the Ice(berg)",
    seoDescription:
      "Fun, debate-worthy road trip questions, would-you-rathers, and stories to make long drives fly by.",
    heroHeading: "Make the next three hours of highway fly by.",
    heroCopy:
      "Built for the passenger seat: rapid hypotheticals, playful debates, and nostalgic rabbit holes that beat another quiet stretch of interstate.",
    accentColor: "#0E7490",
    icon: "car",
    filters: {
      style: "would-you-rather",
      topic: "travel",
    },
    tips: [
      "Hand the phone to the co-pilot and draw a new card every time the playlist ends.",
      "Would You Rather and Superpower Caveats work best when everyone has to defend their pick.",
      "Switch to Nostalgic or Music tones once the sun goes down.",
    ],
    sampleCards: [
      {
        style: "Would you rather",
        styleColor: "#7C3AED",
        tone: "Fun & silly",
        toneColor: "#059669",
        topic: "Travel",
        text: "Would you rather teleport anywhere instantly but always arrive 20 minutes late, or fly first class anywhere for free?",
      },
      {
        style: "Superpower caveats",
        styleColor: "#E11D48",
        tone: "Playful",
        toneColor: "#D97706",
        topic: "Imagination",
        text: "You can speak every language fluently, but only when whispering—do you take it?",
      },
      {
        style: "Open-ended",
        styleColor: "#0E7490",
        tone: "Nostalgic",
        toneColor: "#4F46E5",
        topic: "Travel",
        text: "What’s the best detour or wrong turn you’ve ever taken on a trip?",
      },
      {
        style: "If this, but that",
        styleColor: "#0F766E",
        tone: "Witty",
        toneColor: "#2563EB",
        topic: "Music",
        text: "You get free concert tickets for life, but you can never listen to recorded music in the car again. Deal or no deal?",
      },
    ],
  },
  {
    slug: "date-night",
    name: "Date Night",
    shortName: "Date night",
    tagline: "Go deeper than logistics and reconnect over what’s next.",
    seoTitle: "Date Night & Couples Conversation Starters | Break the Ice(berg)",
    seoDescription:
      "Thoughtful, warm date night questions for couples to reconnect, laugh, and talk about more than the weekly calendar.",
    heroHeading: "Talk about more than this week’s errands.",
    heroCopy:
      "Even when you know each other well, the right question opens up a new story, a shared memory, or a glimpse of the next chapter.",
    accentColor: "#9333EA",
    icon: "heart",
    filters: {
      style: "future-chapter",
      tone: "deep-thoughtful",
    },
    tips: [
      "Put phones face down after drawing a card and give each question a few minutes to breathe.",
      "Alternate between one Deep/Reflective card and one Cozy or Playful card.",
      "Save favorites to revisit on an anniversary or weekend away.",
    ],
    sampleCards: [
      {
        style: "Future chapter",
        styleColor: "#4F46E5",
        tone: "Tender",
        toneColor: "#E11D48",
        topic: "Perspective",
        text: "What’s one small tradition you hope we’re still doing five years from now?",
      },
      {
        style: "How to know me",
        styleColor: "#0E7490",
        tone: "Candid",
        toneColor: "#059669",
        topic: "Home life",
        text: "When you’ve had a rough day, what’s the quickest way someone can actually help without saying much?",
      },
      {
        style: "Formative moment",
        styleColor: "#0F766E",
        tone: "Reflective",
        toneColor: "#4F46E5",
        topic: "Perspective",
        text: "What piece of advice sounded like a cliché until you lived through it yourself?",
      },
      {
        style: "Open-ended",
        styleColor: "#0E7490",
        tone: "Cozy",
        toneColor: "#D97706",
        topic: "Everyday joy",
        text: "What small, ordinary routine in your week quietly makes everything else better?",
      },
    ],
  },
  {
    slug: "family-dinner",
    name: "Family Dinner",
    shortName: "Family dinner",
    tagline: "All-ages prompts for weeknight tables, holidays, and reunions.",
    seoTitle: "Family Dinner & Holiday Conversation Starters | Break the Ice(berg)",
    seoDescription:
      "Wholesome, nostalgic conversation starters for family dinners, Thanksgiving tables, and multi-generational gatherings.",
    heroHeading: "Questions everyone at the table can actually answer.",
    heroCopy:
      "From weeknight dinners to holiday reunions—warm, nostalgic prompts that bridge generations without stepping on any landmines.",
    accentColor: "#059669",
    icon: "home",
    filters: {
      tone: "wholesome-uplifting",
      topic: "childhood-nostalgia",
    },
    tips: [
      "Let the youngest or quietest person at the table go first—or pick the card.",
      "Nostalgic and Time Capsule prompts are gold when grandparents and kids are at the same table.",
      "Keep Gratitude Lightning handy for a quick, warm round before dessert.",
    ],
    sampleCards: [
      {
        style: "Time capsule",
        styleColor: "#0F766E",
        tone: "Nostalgic",
        toneColor: "#D97706",
        topic: "Childhood",
        text: "What object from your childhood bedroom would instantly take you back if you held it today?",
      },
      {
        style: "Gratitude lightning",
        styleColor: "#059669",
        tone: "Wholesome",
        toneColor: "#0E7490",
        topic: "Everyday joy",
        text: "First thing that comes to mind: one small win from this week, in five words or fewer.",
      },
      {
        style: "Open-ended",
        styleColor: "#0E7490",
        tone: "Cozy",
        toneColor: "#D97706",
        topic: "Food",
        text: "What snack or treat from growing up do you still secretly crave?",
      },
      {
        style: "One-word whip-around",
        styleColor: "#7C3AED",
        tone: "Playful",
        toneColor: "#059669",
        topic: "Home life",
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
      style: "super-power-caveats",
      tone: "fun-silly",
    },
    tips: [
      "Use Rapid-Fire Either/Or as a quick show-of-hands round to wake up a big group.",
      "Superpower Caveats and If This, But That spark instant friendly arguments.",
      "Mix in Bold or Edgy tones once everyone’s loosened up.",
    ],
    sampleCards: [
      {
        style: "Superpower caveats",
        styleColor: "#E11D48",
        tone: "Fun & silly",
        toneColor: "#059669",
        topic: "Imagination",
        text: "You can fly, but only at brisk walking speed and two feet off the ground—how are you using it?",
      },
      {
        style: "Rapid-fire either/or",
        styleColor: "#7C3AED",
        tone: "Quick energizer",
        toneColor: "#D97706",
        topic: "Everyday",
        text: "Always hit green lights or always find front-row parking?",
      },
      {
        style: "If this, but that",
        styleColor: "#0F766E",
        tone: "Bold",
        toneColor: "#E11D48",
        topic: "Culture",
        text: "You win $100,000, but every time you enter a room a dramatic movie soundtrack plays out loud. In or out?",
      },
      {
        style: "One-word whip-around",
        styleColor: "#2563EB",
        tone: "Playful",
        toneColor: "#059669",
        topic: "Food",
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
      topic: "internet-habits",
    },
    tips: [
      "Pick a card with a clean either/or or hot take so people can reply in two seconds.",
      "Copy the link or text straight from any card to start a thread.",
      "Save a few in your Liked list for slow Tuesday afternoons.",
    ],
    sampleCards: [
      {
        style: "Open-ended",
        styleColor: "#0E7490",
        tone: "Witty",
        toneColor: "#2563EB",
        topic: "Internet habits",
        text: "How many browser tabs do you have open right now, and what’s the oldest one about?",
      },
      {
        style: "If this, but that",
        styleColor: "#0F766E",
        tone: "Bold",
        toneColor: "#E11D48",
        topic: "Technology",
        text: "Your phone battery never dies again, but autocorrect is permanently turned off. Taking it?",
      },
      {
        style: "Rapid-fire either/or",
        styleColor: "#7C3AED",
        tone: "Playful",
        toneColor: "#059669",
        topic: "Internet habits",
        text: "Voice notes or three-paragraph texts?",
      },
      {
        style: "Micro-ritual",
        styleColor: "#D97706",
        tone: "Candid",
        toneColor: "#2563EB",
        topic: "Technology",
        text: "What app do you close only to immediately reopen two seconds later?",
      },
    ],
  },
  {
    slug: "new-friends",
    name: "Meeting New People",
    shortName: "New friends",
    tagline: "Easy, low-pressure openers for mixers, hangouts, and new faces.",
    seoTitle: "Icebreaker Questions for Meeting New People | Break the Ice(berg)",
    seoDescription:
      "Low-pressure, natural icebreaker questions for parties, meetups, and getting past small talk with new people.",
    heroHeading: "Get past small talk without making it weird.",
    heroCopy:
      "Low-stakes, genuinely interesting openers for housewarmings, friend-of-a-friend hangouts, and any room full of new faces.",
    accentColor: "#0F766E",
    icon: "users",
    filters: {
      style: "micro-ritual",
      tone: "candid",
    },
    tips: [
      "Start with something grounded and relatable—everyone has an answer for everyday habits.",
      "Avoid overly personal prompts until the group has warmed up.",
      "One-Word Whip-Around is an easy way to include a whole circle in under a minute.",
    ],
    sampleCards: [
      {
        style: "Micro-ritual",
        styleColor: "#D97706",
        tone: "Candid",
        toneColor: "#2563EB",
        topic: "Everyday joy",
        text: "What’s a tiny routine you have that nobody asked for, yet you refuse to skip?",
      },
      {
        style: "Open-ended",
        styleColor: "#0E7490",
        tone: "Grounded",
        toneColor: "#059669",
        topic: "Culture",
        text: "What’s something you got into recently that you’d happily recommend to a stranger?",
      },
      {
        style: "One-word whip-around",
        styleColor: "#7C3AED",
        tone: "Quick energizer",
        toneColor: "#D97706",
        topic: "Travel",
        text: "One word: the best city or town you’ve ever visited.",
      },
      {
        style: "Values in practice",
        styleColor: "#0F766E",
        tone: "Warm",
        toneColor: "#D97706",
        topic: "Everyday joy",
        text: "What’s a small kindness someone did for you that you still try to pass on?",
      },
    ],
  },
] as const;

export const OCCASIONS_BY_SLUG: Readonly<Record<string, OccasionConfig>> =
  Object.fromEntries(OCCASIONS.map((occasion) => [occasion.slug, occasion]));

export const getOccasionBySlug = (
  slug: string | null | undefined,
): OccasionConfig | undefined => {
  if (!slug) return undefined;
  return OCCASIONS_BY_SLUG[slug];
};

export const getOccasionAppUrl = (occasion: Pick<OccasionConfig, "slug">) =>
  `/app?occasion=${encodeURIComponent(occasion.slug)}`;
