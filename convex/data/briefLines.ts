// One line for each live style and tone and each everyday topic: what the generator and the
// judge read about it (lib/brief.ts). These are the lines the blind tests were run with
// (evals/README.md), plus one for Micro-Ritual, which the test seeds didn't cover.
// `internal/migrations:seedBriefLines` writes them onto the rows that have none. Seasonal
// topics have no line here and are read by their description.

export type BriefLine = { brief: string; form?: string };

export const STYLE_BRIEF_LINES: Record<string, BriefLine> = {
  "desert-island": { brief: "The person can keep only a few things from some part of their life and has to choose which. What they pick shows what they can't do without." },
  "formative-moment": { brief: "The person recalls one ordinary moment from their past and what it left them with. Nothing that needs them to share something painful." },
  "future-chapter": { brief: "The person looks a little way ahead, a season or a year, and says what they hope it holds or what would make it a good one." },
  "gratitude-lightning": { brief: "The person gives the first answer that comes to mind, in a few words, with no explaining." },
  "how-to-know-me": { brief: "The person tells the group one thing that helps others understand them or get along with them: how they like to be asked, helped, thanked or left alone." },
  "if-this-but-that": { brief: "The person is offered something tempting that comes with a catch, and decides whether to take it." },
  "micro-ritual": { brief: "The person owns up to a small, unnecessary step they always take in some everyday task." },
  "one-word-whip-around": { brief: "Everyone answers with a single word, so the whole group can go around in under a minute.", form: "Says that the answer is one word." },
  "open-ended": { brief: "The person shares a small story, opinion or habit of their own. There is no right answer and no list to pick from." },
  "rapid-fire-either": { brief: "The person picks one of two short options on the spot. Quick enough to ask a whole room by a show of hands.", form: "Two short options joined by 'or' and nothing else, as in 'X or Y?'." },
  "super-power-caveats": { brief: "The person is offered a playful power with a silly drawback and says whether they would take it." },
  "time-capsule-snapshot": { brief: "The person names an object or small detail that would bring back a particular time in their life." },
  "values-in-practice": { brief: "The person describes something they actually do, a habit, a choice or a line they hold, that shows what matters to them." },
  "would-you-rather": { brief: "The person chooses between two situations that are equally tempting, or equally awful, and says why.", form: "Begins 'Would you rather' and offers two options." },
};

export const TONE_BRIEF_LINES: Record<string, BriefLine> = {
  "bold": { brief: "Direct and confident. It invites a strong take without picking a fight." },
  "candid": { brief: "Plainspoken and honest, the way you would ask a friend who won't judge the answer." },
  "cozy": { brief: "Soft and comfortable, about small pleasures and feeling at home." },
  "deep-thoughtful": { brief: "Slower and more serious. It gives people room for an answer that means something to them." },
  "edgy-provocative": { brief: "A little cheeky. It nudges people toward an opinion others might argue with, without being mean." },
  "fun-silly": { brief: "Light and a bit ridiculous. The goal is a laugh." },
  "grounded": { brief: "Steady and practical, about real life as it is and not about grand ideas." },
  "health-fitness": { brief: "About bodies, training, food, sleep and looking after yourself." },
  "mysterious-intriguing": { brief: "Curious and slightly strange. It makes people wonder for a second before they answer." },
  "nerdy-geeky": { brief: "For people who love their fandoms, gadgets, games and science, asked with affection." },
  "nostalgic": { brief: "Looks back fondly at childhood, old habits and earlier decades." },
  "outdoorsy-adventurous": { brief: "About being outside: trips, weather, trails, sport and a bit of risk." },
  "playful": { brief: "Light and teasing, easy to answer with a smile." },
  "professional": { brief: "Fine for a workplace with the boss in the room, about work and how people do it." },
  "quick-energizer": { brief: "Fast and lively, to wake up a room in under a minute." },
  "reflective": { brief: "Thoughtful and calm. It asks people to notice something about themselves without getting heavy." },
  "tender": { brief: "Warm and gentle, about the people and things someone cares for." },
  "wholesome-uplifting": { brief: "Kind and positive. It leaves people feeling good." },
  "witty": { brief: "Clever and dry, with a light edge." },
};

export const TOPIC_BRIEF_LINES: Record<string, BriefLine> = {
  "childhood-nostalgia": { brief: "Growing up: the objects, routines and habits of being a kid." },
  "food": { brief: "Everyday eating: snacks, cravings, kitchens, groceries, eating out." },
  "home-life": { brief: "Life at home: rooms, chores, routines and household quirks." },
  "internet-habits": { brief: "How people behave online: scrolling, searching, posting, lurking." },
  "music": { brief: "Listening: playlists, songs on repeat, concerts, the music that goes with a mood." },
  "technology": { brief: "Everyday tech: phones, apps, notifications, open tabs." },
  "travel": { brief: "Trips and getting there: packing, airports, hotels, road trips." },
  "work": { brief: "Everyday working life: meetings, email, desks, coworkers." },
};
