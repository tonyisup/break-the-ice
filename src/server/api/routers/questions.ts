// src/server/api/routers/questions.ts
import { z } from "zod";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "../trpc";
import { generateIcebreakerQuestion } from "~/server/openai";

export const questionsRouter = createTRPCRouter({
  // Get a random question
  getRandom: publicProcedure.query(async ({ ctx }) => {
    const count = await ctx.db.question.count();
    const skip = Math.floor(Math.random() * count);
    
    const question = await ctx.db.question.findFirst({
      skip,
    });
    
    return question;
  }),
  getRandomStack: publicProcedure.query(async ({ ctx }) => {
    const count = await ctx.db.question.count();
    const skip = Math.floor(Math.random() * Math.max(0, count - 4)); // Reduced by 1 to make room for AI question
    
    // Run database query and AI generation in parallel
    const [questions, aiQuestionText] = await Promise.all([
      ctx.db.question.findMany({
        take: 4, // Reduced by 1 to make room for AI question
        skip,
        orderBy: {
          id: 'asc',
        },  
      }),
      generateIcebreakerQuestion(),
    ]);
    
    // Add the AI question to the stack
    questions.push({
      id: 'ai-' + Date.now(), // Generate a unique ID for the AI question
      text: aiQuestionText,
      category: 'ai-generated',
      createdAt: new Date(),
      updatedAt: null,
    });
    // Randomize the order of questions before returning
    return [...questions].sort(() => Math.random() - 0.5);
  }),
  // Admin procedures (protected by auth)
  create: protectedProcedure
    .input(z.object({
      text: z.string().min(5),
      category: z.string().default("general"),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.question.create({
        data: {
          text: input.text,
          category: input.category,
        },
      });
    }),
});
