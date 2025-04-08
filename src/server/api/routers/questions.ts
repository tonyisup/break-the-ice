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
      skipIds: z.array(z.string()).optional(),
      likeIds: z.array(z.string()).optional(),
    }))
    .query(async ({ ctx, input }) => {      
      
      const skip = input.skipIds?.length ?? 0;
      const like = input.likeIds?.length ?? 0;

      const skipIDs = input.skipIds?.join(',') + 
        (like ? `,${input.likeIds?.join(',')}` : '');

      // Fetch skipped and liked questions from the database
      const skippedQuestions = skip > 0 
        ? await ctx.db.$queryRaw<Question[]>`
          SELECT [id], [text], [category]
          FROM [ice].[Question]
          WHERE [id] IN (${input.skipIds?.join(',')})
        ` 
        : [];
      
      const likedQuestions = like > 0
        ? await ctx.db.$queryRaw<Question[]>`
          SELECT [id], [text], [category]
          FROM [ice].[Question]
          WHERE [id] IN (${input.likeIds?.join(',')})
        `
        : [];

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
        generateIcebreakerQuestion(skippedQuestions, likedQuestions),
      ]);
      
      
      // Insert the AI-generated question into the database
      const aiQuestion = await ctx.db.question.create({
        data: {
          text: aiQuestionText,
          category: 'ai-generated',
        },
        select: {
          id: true,
          text: true,
          category: true,
        },
      });

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
