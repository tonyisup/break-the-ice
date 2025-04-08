// src/server/api/routers/questions.ts
import { z } from "zod";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "../trpc";
import { generateIcebreakerQuestion } from "~/server/openai";
import type { Question } from "~/app/_components/types";

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
      skips: z.array(z.object({
        id: z.string(),
        text: z.string(),
        category: z.string(),
      })).optional(),
      likes: z.array(z.object({
        id: z.string(),
        text: z.string(),
        category: z.string(),
      })).optional(),
    }))
    .query(async ({ ctx, input }) => {      
      
      const skip = input.skips?.length ?? 0;
      const like = input.likes?.length ?? 0;

      const skipIDs = input.skips?.map(question => question.id).join(',') + 
        (like ? `,${input.likes?.map(question => question.id).join(',')}` : '');

      // Run database query and AI generation in parallel
      const [dbQuestions, aiQuestionText] = await Promise.all([
        skip ? ctx.db.$queryRaw<Question[]>`
          SELECT top 4 
            [id]
            ,[text]
            ,[category]
          FROM [ice].[Question]
          WHERE [id] NOT IN (${skipIDs})
          ORDER BY newid()
        ` : ctx.db.$queryRaw<Question[]>`
          SELECT top 4 
            [id]
            ,[text]
            ,[category]
          FROM [ice].[Question]
          ORDER BY newid()
        ` ,
        generateIcebreakerQuestion(input.skips ?? [], input.likes ?? []),
      ]);
      
      const aiQuestion: Question = {
        id: 'ai-' + Date.now(), // Generate a unique ID for the AI question
        text: aiQuestionText,
        category: 'ai-generated',
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
