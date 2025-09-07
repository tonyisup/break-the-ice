import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// Shared predefined tags configuration
export const PREDEFINED_TAGS = [
  { name: "fitness", category: "health", description: "Questions about fitness and exercise" },
  { name: "work", category: "professional", description: "Questions about work and career" },
  { name: "travel", category: "lifestyle", description: "Questions about travel and adventures" },
  { name: "food", category: "lifestyle", description: "Questions about food and cooking" },
  { name: "music", category: "entertainment", description: "Questions about music and entertainment" },
  { name: "movies", category: "entertainment", description: "Questions about movies and TV shows" },
  { name: "books", category: "entertainment", description: "Questions about books and reading" },
  { name: "technology", category: "professional", description: "Questions about technology and gadgets" },
  { name: "family", category: "personal", description: "Questions about family and relationships" },
  { name: "hobbies", category: "personal", description: "Questions about hobbies and interests" },
  { name: "dreams", category: "personal", description: "Questions about dreams and aspirations" },
  { name: "childhood", category: "personal", description: "Questions about childhood memories" },
  { name: "learning", category: "personal", description: "Questions about learning and education" },
  { name: "adventure", category: "lifestyle", description: "Questions about adventure and exploration" },
  { name: "creativity", category: "personal", description: "Questions about creativity and art" },
  { name: "superheroes", category: "entertainment", description: "Questions about superheroes and powers" },
  { name: "time-travel", category: "fantasy", description: "Questions about time travel and alternate realities" },
  { name: "aliens", category: "fantasy", description: "Questions about aliens and space exploration" },
  { name: "zombies", category: "fantasy", description: "Questions about zombie apocalypse scenarios" },
  { name: "magic", category: "fantasy", description: "Questions about magic and supernatural abilities" },
  { name: "dancing", category: "entertainment", description: "Questions about dance and movement" },
  { name: "comedy", category: "entertainment", description: "Questions about humor and funny situations" },
  { name: "fashion", category: "lifestyle", description: "Questions about style and fashion choices" },
  { name: "gaming", category: "entertainment", description: "Questions about video games and gaming" },
  { name: "sports", category: "health", description: "Questions about sports and athletic achievements" },
  { name: "pets", category: "personal", description: "Questions about pets and animal companions" },
  { name: "cooking", category: "lifestyle", description: "Questions about cooking and culinary adventures" },
  { name: "art", category: "creativity", description: "Questions about art and creative expression" },
  { name: "photography", category: "creativity", description: "Questions about photography and visual storytelling" },
  { name: "writing", category: "creativity", description: "Questions about writing and storytelling" },
  { name: "science", category: "learning", description: "Questions about science and discoveries" },
  { name: "history", category: "learning", description: "Questions about history and historical events" },
  { name: "languages", category: "learning", description: "Questions about languages and communication" },
  { name: "nature", category: "lifestyle", description: "Questions about nature and the outdoors" },
  { name: "ocean", category: "lifestyle", description: "Questions about the ocean and marine life" },
  { name: "mountains", category: "lifestyle", description: "Questions about mountains and climbing" },
  { name: "cities", category: "lifestyle", description: "Questions about cities and urban life" },
  { name: "villages", category: "lifestyle", description: "Questions about small towns and rural life" },
  { name: "festivals", category: "entertainment", description: "Questions about festivals and celebrations" },
  { name: "birthdays", category: "personal", description: "Questions about birthdays and celebrations" },
  { name: "holidays", category: "lifestyle", description: "Questions about holidays and traditions" },
  { name: "seasons", category: "lifestyle", description: "Questions about seasons and weather" },
  { name: "colors", category: "personal", description: "Questions about colors and visual preferences" },
  { name: "smells", category: "personal", description: "Questions about smells and scents" },
  { name: "tastes", category: "personal", description: "Questions about tastes and flavors" },
  { name: "sounds", category: "personal", description: "Questions about sounds and music" },
  { name: "textures", category: "personal", description: "Questions about textures and touch" },
  { name: "emotions", category: "personal", description: "Questions about emotions and feelings" },
  { name: "fears", category: "personal", description: "Questions about fears and phobias" },
  { name: "wishes", category: "personal", description: "Questions about wishes and desires" },
  { name: "regrets", category: "personal", description: "Questions about regrets and lessons learned" },
  { name: "achievements", category: "personal", description: "Questions about achievements and successes" },
  { name: "failures", category: "personal", description: "Questions about failures and learning experiences" },
  { name: "friends", category: "personal", description: "Questions about friendships and social connections" },
  { name: "romance", category: "personal", description: "Questions about romance and relationships" },
  { name: "marriage", category: "personal", description: "Questions about marriage and partnerships" },
  { name: "parenting", category: "personal", description: "Questions about parenting and family life" },
  { name: "aging", category: "personal", description: "Questions about aging and life stages" },
  { name: "wisdom", category: "personal", description: "Questions about wisdom and life lessons" },
  { name: "money", category: "professional", description: "Questions about money and financial decisions" },
  { name: "investments", category: "professional", description: "Questions about investments and wealth" },
  { name: "business", category: "professional", description: "Questions about business and entrepreneurship" },
  { name: "leadership", category: "professional", description: "Questions about leadership and management" },
  { name: "teamwork", category: "professional", description: "Questions about teamwork and collaboration" },
  { name: "innovation", category: "professional", description: "Questions about innovation and creativity" },
  { name: "success", category: "professional", description: "Questions about success and achievement" },
  { name: "stress", category: "health", description: "Questions about stress and mental health" },
  { name: "sleep", category: "health", description: "Questions about sleep and rest" },
  { name: "nutrition", category: "health", description: "Questions about nutrition and healthy eating" },
  { name: "meditation", category: "health", description: "Questions about meditation and mindfulness" },
  { name: "yoga", category: "health", description: "Questions about yoga and wellness" },
  { name: "running", category: "health", description: "Questions about running and endurance" },
  { name: "swimming", category: "health", description: "Questions about swimming and water sports" },
  { name: "cycling", category: "health", description: "Questions about cycling and biking" },
  { name: "hiking", category: "health", description: "Questions about hiking and outdoor activities" },
  { name: "camping", category: "lifestyle", description: "Questions about camping and outdoor adventures" },
  { name: "fishing", category: "lifestyle", description: "Questions about fishing and water activities" },
  { name: "gardening", category: "lifestyle", description: "Questions about gardening and plants" },
  { name: "DIY", category: "creativity", description: "Questions about DIY projects and crafts" },
  { name: "woodworking", category: "creativity", description: "Questions about woodworking and building" },
  { name: "knitting", category: "creativity", description: "Questions about knitting and fiber arts" },
  { name: "painting", category: "creativity", description: "Questions about painting and visual arts" },
  { name: "sculpture", category: "creativity", description: "Questions about sculpture and 3D art" },
  { name: "pottery", category: "creativity", description: "Questions about pottery and ceramics" },
  { name: "jewelry", category: "creativity", description: "Questions about jewelry making and accessories" },
  { name: "cosplay", category: "entertainment", description: "Questions about cosplay and costume design" },
  { name: "theater", category: "entertainment", description: "Questions about theater and performing arts" },
  { name: "opera", category: "entertainment", description: "Questions about opera and classical music" },
  { name: "jazz", category: "entertainment", description: "Questions about jazz and improvisation" },
  { name: "rock", category: "entertainment", description: "Questions about rock music and bands" },
  { name: "classical", category: "entertainment", description: "Questions about classical music and composers" },
  { name: "folk", category: "entertainment", description: "Questions about folk music and traditions" },
  { name: "electronic", category: "entertainment", description: "Questions about electronic music and DJs" },
  { name: "podcasts", category: "entertainment", description: "Questions about podcasts and audio content" },
  { name: "streaming", category: "entertainment", description: "Questions about streaming and digital content" },
  { name: "social-media", category: "technology", description: "Questions about social media and online presence" },
  { name: "virtual-reality", category: "technology", description: "Questions about VR and immersive experiences" },
  { name: "artificial-intelligence", category: "technology", description: "Questions about AI and machine learning" },
  { name: "robots", category: "technology", description: "Questions about robots and automation" },
  { name: "drones", category: "technology", description: "Questions about drones and aerial technology" },
  { name: "smartphones", category: "technology", description: "Questions about smartphones and mobile tech" },
  { name: "computers", category: "technology", description: "Questions about computers and computing" },
  { name: "internet", category: "technology", description: "Questions about the internet and connectivity" },
  { name: "cybersecurity", category: "technology", description: "Questions about cybersecurity and privacy" },
  { name: "blockchain", category: "technology", description: "Questions about blockchain and cryptocurrency" },
  { name: "quantum-computing", category: "technology", description: "Questions about quantum computing and physics" },
  { name: "space-exploration", category: "technology", description: "Questions about space exploration and astronomy" },
  { name: "climate-change", category: "learning", description: "Questions about climate change and environment" },
  { name: "renewable-energy", category: "learning", description: "Questions about renewable energy and sustainability" },
  { name: "conservation", category: "learning", description: "Questions about conservation and wildlife" },
  { name: "ocean-conservation", category: "learning", description: "Questions about ocean conservation and marine life" },
  { name: "forest-conservation", category: "learning", description: "Questions about forest conservation and trees" },
  { name: "recycling", category: "lifestyle", description: "Questions about recycling and waste reduction" },
  { name: "zero-waste", category: "lifestyle", description: "Questions about zero-waste living and sustainability" },
  { name: "minimalism", category: "lifestyle", description: "Questions about minimalism and simple living" },
  { name: "mindfulness", category: "lifestyle", description: "Questions about mindfulness and present moment" },
  { name: "gratitude", category: "personal", description: "Questions about gratitude and appreciation" },
  { name: "kindness", category: "personal", description: "Questions about kindness and compassion" },
  { name: "empathy", category: "personal", description: "Questions about empathy and understanding others" },
  { name: "forgiveness", category: "personal", description: "Questions about forgiveness and letting go" },
  { name: "courage", category: "personal", description: "Questions about courage and bravery" },
  { name: "perseverance", category: "personal", description: "Questions about perseverance and determination" },
  { name: "adaptability", category: "personal", description: "Questions about adaptability and flexibility" },
  { name: "curiosity", category: "personal", description: "Questions about curiosity and wonder" },
  { name: "imagination", category: "personal", description: "Questions about imagination and creativity" },
  { name: "intuition", category: "personal", description: "Questions about intuition and gut feelings" },
  { name: "synchronicity", category: "personal", description: "Questions about synchronicity and meaningful coincidences" },
  { name: "destiny", category: "personal", description: "Questions about destiny and fate" },
  { name: "free-will", category: "personal", description: "Questions about free will and choice" },
  { name: "consciousness", category: "personal", description: "Questions about consciousness and awareness" },
  { name: "lucid-dreaming", category: "personal", description: "Questions about lucid dreaming and dream control" },
  { name: "astral-projection", category: "fantasy", description: "Questions about astral projection and out-of-body experiences" },
  { name: "telepathy", category: "fantasy", description: "Questions about telepathy and mind reading" },
  { name: "precognition", category: "fantasy", description: "Questions about precognition and future sight" },
  { name: "psychokinesis", category: "fantasy", description: "Questions about psychokinesis and mind over matter" },
  { name: "parallel-universes", category: "fantasy", description: "Questions about parallel universes and multiverse theory" },
  { name: "time-dilation", category: "fantasy", description: "Questions about time dilation and relativity" },
  { name: "wormholes", category: "fantasy", description: "Questions about wormholes and space-time travel" },
  { name: "dark-matter", category: "fantasy", description: "Questions about dark matter and cosmic mysteries" },
  { name: "black-holes", category: "fantasy", description: "Questions about black holes and cosmic phenomena" },
  { name: "quantum-entanglement", category: "fantasy", description: "Questions about quantum entanglement and spooky action" },
  { name: "consciousness-transfer", category: "fantasy", description: "Questions about consciousness transfer and mind uploading" },
  { name: "immortality", category: "fantasy", description: "Questions about immortality and eternal life" },
  { name: "reincarnation", category: "fantasy", description: "Questions about reincarnation and past lives" },
  { name: "ghosts", category: "fantasy", description: "Questions about ghosts and supernatural entities" },
  { name: "vampires", category: "fantasy", description: "Questions about vampires and immortal beings" },
  { name: "werewolves", category: "fantasy", description: "Questions about werewolves and shape-shifters" },
  { name: "dragons", category: "fantasy", description: "Questions about dragons and mythical creatures" },
  { name: "unicorns", category: "fantasy", description: "Questions about unicorns and magical creatures" },
  { name: "fairies", category: "fantasy", description: "Questions about fairies and magical beings" },
  { name: "wizards", category: "fantasy", description: "Questions about wizards and magical powers" },
  { name: "witches", category: "fantasy", description: "Questions about witches and spellcasting" },
  { name: "sorcerers", category: "fantasy", description: "Questions about sorcerers and arcane magic" },
  { name: "necromancers", category: "fantasy", description: "Questions about necromancers and death magic" },
  { name: "paladins", category: "fantasy", description: "Questions about paladins and divine magic" },
  { name: "druids", category: "fantasy", description: "Questions about druids and nature magic" },
  { name: "bards", category: "fantasy", description: "Questions about bards and musical magic" },
  { name: "rogues", category: "fantasy", description: "Questions about rogues and stealth" },
  { name: "warriors", category: "fantasy", description: "Questions about warriors and combat" },
  { name: "archers", category: "fantasy", description: "Questions about archers and ranged combat" },
  { name: "knights", category: "fantasy", description: "Questions about knights and chivalry" },
  { name: "samurai", category: "fantasy", description: "Questions about samurai and bushido" },
  { name: "ninjas", category: "fantasy", description: "Questions about ninjas and stealth" },
  { name: "pirates", category: "fantasy", description: "Questions about pirates and seafaring adventures" },
  { name: "cowboys", category: "fantasy", description: "Questions about cowboys and the wild west" },
  { name: "vikings", category: "fantasy", description: "Questions about vikings and Norse mythology" },
  { name: "gladiators", category: "fantasy", description: "Questions about gladiators and ancient combat" },
  { name: "spartans", category: "fantasy", description: "Questions about Spartans and ancient warriors" },
  { name: "mermaids", category: "fantasy", description: "Questions about mermaids and underwater kingdoms" },
  { name: "phoenix", category: "fantasy", description: "Questions about phoenixes and rebirth" },
  { name: "griffins", category: "fantasy", description: "Questions about griffins and mythical beasts" },
  { name: "centaurs", category: "fantasy", description: "Questions about centaurs and half-human creatures" },
  { name: "minotaurs", category: "fantasy", description: "Questions about minotaurs and labyrinth creatures" },
  { name: "sirens", category: "fantasy", description: "Questions about sirens and enchanting voices" },
];

// Get all available tags
export const getTags = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("tags"),
    _creationTime: v.number(),
    name: v.string(),
    category: v.string(),
    description: v.optional(v.string()),
  })),
  handler: async (ctx) => {
    return await ctx.db.query("tags").order("asc").collect();
  },
});

// Initialize tags in the database
export const initializeTags = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    // Check if tags already exist
    const existingTags = await ctx.db.query("tags").collect();
    if (existingTags.length > 0) {
      return null; // Tags already initialized
    }

    // Insert predefined tags
    for (const tag of PREDEFINED_TAGS) {
      await ctx.db.insert("tags", tag);
    }

    return null;
  },
});

export const createTag = mutation({
  args: {
    name: v.string(),
    category: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existingTag = await ctx.db
      .query("tags")
      .filter((q) => q.eq(q.field("name"), args.name))
      .first();
    if (existingTag) {
      throw new Error("Tag with this name already exists");
    }
    const tagId = await ctx.db.insert("tags", {
      name: args.name,
      category: args.category,
      description: args.description,
    });
    return tagId;
  },
});

export const updateTag = mutation({
  args: {
    id: v.id("tags"),
    name: v.string(),
    category: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...rest } = args;
    const existingTag = await ctx.db.get(args.id);
    if (existingTag) {
      await ctx.db.patch(args.id, {
        name: args.name,
        category: args.category,
        description: args.description,
      });
    }
  },
});

export const deleteTag = mutation({
  args: { id: v.id("tags") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
