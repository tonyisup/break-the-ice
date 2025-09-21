import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// Shared predefined tags configuration
export const PREDEFINED_TAGS = [
  { name: "fitness", grouping: "health", description: "Questions about fitness and exercise" },
  { name: "work", grouping: "professional", description: "Questions about work and career" },
  { name: "travel", grouping: "lifestyle", description: "Questions about travel and adventures" },
  { name: "food", grouping: "lifestyle", description: "Questions about food and cooking" },
  { name: "music", grouping: "entertainment", description: "Questions about music and entertainment" },
  { name: "movies", grouping: "entertainment", description: "Questions about movies and TV shows" },
  { name: "books", grouping: "entertainment", description: "Questions about books and reading" },
  { name: "technology", grouping: "professional", description: "Questions about technology and gadgets" },
  { name: "family", grouping: "personal", description: "Questions about family and relationships" },
  { name: "hobbies", grouping: "personal", description: "Questions about hobbies and interests" },
  { name: "dreams", grouping: "personal", description: "Questions about dreams and aspirations" },
  { name: "childhood", grouping: "personal", description: "Questions about childhood memories" },
  { name: "learning", grouping: "personal", description: "Questions about learning and education" },
  { name: "adventure", grouping: "lifestyle", description: "Questions about adventure and exploration" },
  { name: "creativity", grouping: "personal", description: "Questions about creativity and art" },
  { name: "superheroes", grouping: "entertainment", description: "Questions about superheroes and powers" },
  { name: "time-travel", grouping: "fantasy", description: "Questions about time travel and alternate realities" },
  { name: "aliens", grouping: "fantasy", description: "Questions about aliens and space exploration" },
  { name: "zombies", grouping: "fantasy", description: "Questions about zombie apocalypse scenarios" },
  { name: "magic", grouping: "fantasy", description: "Questions about magic and supernatural abilities" },
  { name: "dancing", grouping: "entertainment", description: "Questions about dance and movement" },
  { name: "comedy", grouping: "entertainment", description: "Questions about humor and funny situations" },
  { name: "fashion", grouping: "lifestyle", description: "Questions about style and fashion choices" },
  { name: "gaming", grouping: "entertainment", description: "Questions about video games and gaming" },
  { name: "sports", grouping: "health", description: "Questions about sports and athletic achievements" },
  { name: "pets", grouping: "personal", description: "Questions about pets and animal companions" },
  { name: "cooking", grouping: "lifestyle", description: "Questions about cooking and culinary adventures" },
  { name: "art", grouping: "creativity", description: "Questions about art and creative expression" },
  { name: "photography", grouping: "creativity", description: "Questions about photography and visual storytelling" },
  { name: "writing", grouping: "creativity", description: "Questions about writing and storytelling" },
  { name: "science", grouping: "learning", description: "Questions about science and discoveries" },
  { name: "history", grouping: "learning", description: "Questions about history and historical events" },
  { name: "languages", grouping: "learning", description: "Questions about languages and communication" },
  { name: "nature", grouping: "lifestyle", description: "Questions about nature and the outdoors" },
  { name: "ocean", grouping: "lifestyle", description: "Questions about the ocean and marine life" },
  { name: "mountains", grouping: "lifestyle", description: "Questions about mountains and climbing" },
  { name: "cities", grouping: "lifestyle", description: "Questions about cities and urban life" },
  { name: "villages", grouping: "lifestyle", description: "Questions about small towns and rural life" },
  { name: "festivals", grouping: "entertainment", description: "Questions about festivals and celebrations" },
  { name: "birthdays", grouping: "personal", description: "Questions about birthdays and celebrations" },
  { name: "holidays", grouping: "lifestyle", description: "Questions about holidays and traditions" },
  { name: "seasons", grouping: "lifestyle", description: "Questions about seasons and weather" },
  { name: "colors", grouping: "personal", description: "Questions about colors and visual preferences" },
  { name: "smells", grouping: "personal", description: "Questions about smells and scents" },
  { name: "tastes", grouping: "personal", description: "Questions about tastes and flavors" },
  { name: "sounds", grouping: "personal", description: "Questions about sounds and music" },
  { name: "textures", grouping: "personal", description: "Questions about textures and touch" },
  { name: "emotions", grouping: "personal", description: "Questions about emotions and feelings" },
  { name: "fears", grouping: "personal", description: "Questions about fears and phobias" },
  { name: "wishes", grouping: "personal", description: "Questions about wishes and desires" },
  { name: "regrets", grouping: "personal", description: "Questions about regrets and lessons learned" },
  { name: "achievements", grouping: "personal", description: "Questions about achievements and successes" },
  { name: "failures", grouping: "personal", description: "Questions about failures and learning experiences" },
  { name: "friends", grouping: "personal", description: "Questions about friendships and social connections" },
  { name: "romance", grouping: "personal", description: "Questions about romance and relationships" },
  { name: "marriage", grouping: "personal", description: "Questions about marriage and partnerships" },
  { name: "parenting", grouping: "personal", description: "Questions about parenting and family life" },
  { name: "aging", grouping: "personal", description: "Questions about aging and life stages" },
  { name: "wisdom", grouping: "personal", description: "Questions about wisdom and life lessons" },
  { name: "money", grouping: "professional", description: "Questions about money and financial decisions" },
  { name: "investments", grouping: "professional", description: "Questions about investments and wealth" },
  { name: "business", grouping: "professional", description: "Questions about business and entrepreneurship" },
  { name: "leadership", grouping: "professional", description: "Questions about leadership and management" },
  { name: "teamwork", grouping: "professional", description: "Questions about teamwork and collaboration" },
  { name: "innovation", grouping: "professional", description: "Questions about innovation and creativity" },
  { name: "success", grouping: "professional", description: "Questions about success and achievement" },
  { name: "stress", grouping: "health", description: "Questions about stress and mental health" },
  { name: "sleep", grouping: "health", description: "Questions about sleep and rest" },
  { name: "nutrition", grouping: "health", description: "Questions about nutrition and healthy eating" },
  { name: "meditation", grouping: "health", description: "Questions about meditation and mindfulness" },
  { name: "yoga", grouping: "health", description: "Questions about yoga and wellness" },
  { name: "running", grouping: "health", description: "Questions about running and endurance" },
  { name: "swimming", grouping: "health", description: "Questions about swimming and water sports" },
  { name: "cycling", grouping: "health", description: "Questions about cycling and biking" },
  { name: "hiking", grouping: "health", description: "Questions about hiking and outdoor activities" },
  { name: "camping", grouping: "lifestyle", description: "Questions about camping and outdoor adventures" },
  { name: "fishing", grouping: "lifestyle", description: "Questions about fishing and water activities" },
  { name: "gardening", grouping: "lifestyle", description: "Questions about gardening and plants" },
  { name: "DIY", grouping: "creativity", description: "Questions about DIY projects and crafts" },
  { name: "woodworking", grouping: "creativity", description: "Questions about woodworking and building" },
  { name: "knitting", grouping: "creativity", description: "Questions about knitting and fiber arts" },
  { name: "painting", grouping: "creativity", description: "Questions about painting and visual arts" },
  { name: "sculpture", grouping: "creativity", description: "Questions about sculpture and 3D art" },
  { name: "pottery", grouping: "creativity", description: "Questions about pottery and ceramics" },
  { name: "jewelry", grouping: "creativity", description: "Questions about jewelry making and accessories" },
  { name: "cosplay", grouping: "entertainment", description: "Questions about cosplay and costume design" },
  { name: "theater", grouping: "entertainment", description: "Questions about theater and performing arts" },
  { name: "opera", grouping: "entertainment", description: "Questions about opera and classical music" },
  { name: "jazz", grouping: "entertainment", description: "Questions about jazz and improvisation" },
  { name: "rock", grouping: "entertainment", description: "Questions about rock music and bands" },
  { name: "classical", grouping: "entertainment", description: "Questions about classical music and composers" },
  { name: "folk", grouping: "entertainment", description: "Questions about folk music and traditions" },
  { name: "electronic", grouping: "entertainment", description: "Questions about electronic music and DJs" },
  { name: "podcasts", grouping: "entertainment", description: "Questions about podcasts and audio content" },
  { name: "streaming", grouping: "entertainment", description: "Questions about streaming and digital content" },
  { name: "social-media", grouping: "technology", description: "Questions about social media and online presence" },
  { name: "virtual-reality", grouping: "technology", description: "Questions about VR and immersive experiences" },
  { name: "artificial-intelligence", grouping: "technology", description: "Questions about AI and machine learning" },
  { name: "robots", grouping: "technology", description: "Questions about robots and automation" },
  { name: "drones", grouping: "technology", description: "Questions about drones and aerial technology" },
  { name: "smartphones", grouping: "technology", description: "Questions about smartphones and mobile tech" },
  { name: "computers", grouping: "technology", description: "Questions about computers and computing" },
  { name: "internet", grouping: "technology", description: "Questions about the internet and connectivity" },
  { name: "cybersecurity", grouping: "technology", description: "Questions about cybersecurity and privacy" },
  { name: "blockchain", grouping: "technology", description: "Questions about blockchain and cryptocurrency" },
  { name: "quantum-computing", grouping: "technology", description: "Questions about quantum computing and physics" },
  { name: "space-exploration", grouping: "technology", description: "Questions about space exploration and astronomy" },
  { name: "climate-change", grouping: "learning", description: "Questions about climate change and environment" },
  { name: "renewable-energy", grouping: "learning", description: "Questions about renewable energy and sustainability" },
  { name: "conservation", grouping: "learning", description: "Questions about conservation and wildlife" },
  { name: "ocean-conservation", grouping: "learning", description: "Questions about ocean conservation and marine life" },
  { name: "forest-conservation", grouping: "learning", description: "Questions about forest conservation and trees" },
  { name: "recycling", grouping: "lifestyle", description: "Questions about recycling and waste reduction" },
  { name: "zero-waste", grouping: "lifestyle", description: "Questions about zero-waste living and sustainability" },
  { name: "minimalism", grouping: "lifestyle", description: "Questions about minimalism and simple living" },
  { name: "mindfulness", grouping: "lifestyle", description: "Questions about mindfulness and present moment" },
  { name: "gratitude", grouping: "personal", description: "Questions about gratitude and appreciation" },
  { name: "kindness", grouping: "personal", description: "Questions about kindness and compassion" },
  { name: "empathy", grouping: "personal", description: "Questions about empathy and understanding others" },
  { name: "forgiveness", grouping: "personal", description: "Questions about forgiveness and letting go" },
  { name: "courage", grouping: "personal", description: "Questions about courage and bravery" },
  { name: "perseverance", grouping: "personal", description: "Questions about perseverance and determination" },
  { name: "adaptability", grouping: "personal", description: "Questions about adaptability and flexibility" },
  { name: "curiosity", grouping: "personal", description: "Questions about curiosity and wonder" },
  { name: "imagination", grouping: "personal", description: "Questions about imagination and creativity" },
  { name: "intuition", grouping: "personal", description: "Questions about intuition and gut feelings" },
  { name: "synchronicity", grouping: "personal", description: "Questions about synchronicity and meaningful coincidences" },
  { name: "destiny", grouping: "personal", description: "Questions about destiny and fate" },
  { name: "free-will", grouping: "personal", description: "Questions about free will and choice" },
  { name: "consciousness", grouping: "personal", description: "Questions about consciousness and awareness" },
  { name: "lucid-dreaming", grouping: "personal", description: "Questions about lucid dreaming and dream control" },
  { name: "astral-projection", grouping: "fantasy", description: "Questions about astral projection and out-of-body experiences" },
  { name: "telepathy", grouping: "fantasy", description: "Questions about telepathy and mind reading" },
  { name: "precognition", grouping: "fantasy", description: "Questions about precognition and future sight" },
  { name: "psychokinesis", grouping: "fantasy", description: "Questions about psychokinesis and mind over matter" },
  { name: "parallel-universes", grouping: "fantasy", description: "Questions about parallel universes and multiverse theory" },
  { name: "time-dilation", grouping: "fantasy", description: "Questions about time dilation and relativity" },
  { name: "wormholes", grouping: "fantasy", description: "Questions about wormholes and space-time travel" },
  { name: "dark-matter", grouping: "fantasy", description: "Questions about dark matter and cosmic mysteries" },
  { name: "black-holes", grouping: "fantasy", description: "Questions about black holes and cosmic phenomena" },
  { name: "quantum-entanglement", grouping: "fantasy", description: "Questions about quantum entanglement and spooky action" },
  { name: "consciousness-transfer", grouping: "fantasy", description: "Questions about consciousness transfer and mind uploading" },
  { name: "immortality", grouping: "fantasy", description: "Questions about immortality and eternal life" },
  { name: "reincarnation", grouping: "fantasy", description: "Questions about reincarnation and past lives" },
  { name: "ghosts", grouping: "fantasy", description: "Questions about ghosts and supernatural entities" },
  { name: "vampires", grouping: "fantasy", description: "Questions about vampires and immortal beings" },
  { name: "werewolves", grouping: "fantasy", description: "Questions about werewolves and shape-shifters" },
  { name: "dragons", grouping: "fantasy", description: "Questions about dragons and mythical creatures" },
  { name: "unicorns", grouping: "fantasy", description: "Questions about unicorns and magical creatures" },
  { name: "fairies", grouping: "fantasy", description: "Questions about fairies and magical beings" },
  { name: "wizards", grouping: "fantasy", description: "Questions about wizards and magical powers" },
  { name: "witches", grouping: "fantasy", description: "Questions about witches and spellcasting" },
  { name: "sorcerers", grouping: "fantasy", description: "Questions about sorcerers and arcane magic" },
  { name: "necromancers", grouping: "fantasy", description: "Questions about necromancers and death magic" },
  { name: "paladins", grouping: "fantasy", description: "Questions about paladins and divine magic" },
  { name: "druids", grouping: "fantasy", description: "Questions about druids and nature magic" },
  { name: "bards", grouping: "fantasy", description: "Questions about bards and musical magic" },
  { name: "rogues", grouping: "fantasy", description: "Questions about rogues and stealth" },
  { name: "warriors", grouping: "fantasy", description: "Questions about warriors and combat" },
  { name: "archers", grouping: "fantasy", description: "Questions about archers and ranged combat" },
  { name: "knights", grouping: "fantasy", description: "Questions about knights and chivalry" },
  { name: "samurai", grouping: "fantasy", description: "Questions about samurai and bushido" },
  { name: "ninjas", grouping: "fantasy", description: "Questions about ninjas and stealth" },
  { name: "pirates", grouping: "fantasy", description: "Questions about pirates and seafaring adventures" },
  { name: "cowboys", grouping: "fantasy", description: "Questions about cowboys and the wild west" },
  { name: "vikings", grouping: "fantasy", description: "Questions about vikings and Norse mythology" },
  { name: "gladiators", grouping: "fantasy", description: "Questions about gladiators and ancient combat" },
  { name: "spartans", grouping: "fantasy", description: "Questions about Spartans and ancient warriors" },
  { name: "mermaids", grouping: "fantasy", description: "Questions about mermaids and underwater kingdoms" },
  { name: "phoenix", grouping: "fantasy", description: "Questions about phoenixes and rebirth" },
  { name: "griffins", grouping: "fantasy", description: "Questions about griffins and mythical beasts" },
  { name: "centaurs", grouping: "fantasy", description: "Questions about centaurs and half-human creatures" },
  { name: "minotaurs", grouping: "fantasy", description: "Questions about minotaurs and labyrinth creatures" },
  { name: "sirens", grouping: "fantasy", description: "Questions about sirens and enchanting voices" },
];

// Get all available tags
export const getTags = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("tags"),
    _creationTime: v.number(),
    name: v.string(),
    grouping: v.string(),
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
    grouping: v.string(),
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
      grouping: args.grouping,
      description: args.description,
    });
    return tagId;
  },
});

export const updateTag = mutation({
  args: {
    id: v.id("tags"),
    name: v.string(),
    grouping: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...rest } = args;
    const existingTag = await ctx.db.get(args.id);
    if (existingTag) {
      await ctx.db.patch(args.id, {
        name: args.name,
        grouping: args.grouping,
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
