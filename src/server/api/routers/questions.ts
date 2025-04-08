// src/server/api/routers/questions.ts
import { z } from "zod";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "../trpc";
import { generateIcebreakerQuestion } from "~/server/openai";
import type { Question } from "@prisma/client";

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
  getRandomStack: publicProcedure
    .input(z.object({
      discardPile: z.array(z.object({
        id: z.string(),
        text: z.string(),
        category: z.string(),
        createdAt: z.date(),
        updatedAt: z.date().nullable(),
      })).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const count = await ctx.db.question.count();
      const skip = Math.floor(Math.random() * Math.max(0, count - 4)); // Reduced by 1 to make room for AI question
      
      // Run database query and AI generation in parallel
      const [dbQuestions, aiQuestionText] = await Promise.all([
        ctx.db.question.findMany({
          take: 4, // Reduced by 1 to make room for AI question
          skip,
          orderBy: {
            id: 'asc',
          },  
        }),
        generateIcebreakerQuestion(input.discardPile ?? []),
      ]);
      
      const aiQuestion: Question = {
        id: 'ai-' + Date.now(), // Generate a unique ID for the AI question
        text: aiQuestionText,
        category: 'ai-generated',
        createdAt: new Date(),
        updatedAt: null,
      };
      
      const questions: Question[] = [...dbQuestions, aiQuestion];
      
      // Randomize the order of questions before returning
      return questions.sort(() => Math.random() - 0.5);
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
