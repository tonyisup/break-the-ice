// src/server/api/routers/questions.ts
import { z } from "zod";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "../trpc";
import { generateIcebreakerQuestion } from "~/server/openai";
import type { Question } from "~/app/_components/types";

export const questionsRouter = createTRPCRouter({
  // Get a random question
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
      const [dbQuestions, aiQuestionData] = await Promise.all([
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

      // Insert the AI-generated question into the database with its tags
      const [aiQuestion, dbQuestionsWIthTags] = await Promise.all([
        ctx.db.question.create({
          data: {
            text: aiQuestionData.text,
            category: 'ai-generated',
            tags: {
              create: aiQuestionData.tags.map(tagName => ({
                tag: {
                  connectOrCreate: {
                    where: { name: tagName },
                    create: { name: tagName }
                  }
                }
              }))
            }
          },
          include: {
            tags: {
              include: {
                tag: true
              }
            }
          }
        }),
        ctx.db.questionTag.findMany({
          where: {
            questionId: {
              in: dbQuestions.map(q => q.id)
            }
          },
          include: {
            tag: true
          }
        })
      ])
      dbQuestions.forEach(question => {
        question.tags = dbQuestionsWIthTags.filter(q => q.questionId == question.id).map(t => ({
          tag: {
            id: t.tag.id,
            name: t.tag.name
          }
        }))
      })
      const questions: Question[] = [...dbQuestions, aiQuestion];

      // Randomize the order of questions before returning
      return questions.sort(() => Math.random() - 0.5);
    }),
  // Admin procedures (protected by auth)
  create: protectedProcedure
    .input(z.object({
      text: z.string().min(5),
      category: z.string().default("general"),
      tags: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.question.create({
        data: {
          text: input.text,
          category: input.category,
          tags: input.tags ? {
            create: input.tags.map(tagName => ({
              tag: {
                connectOrCreate: {
                  where: { name: tagName },
                  create: { name: tagName }
                }
              }
            }))
          } : undefined
        },
        include: {
          tags: {
            include: {
              tag: true
            }
          }
        }
      });
    }),
  // Get a question by ID
  getById: publicProcedure
    .input(z.object({
      id: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      return await ctx.db.question.findUnique({
        where: { id: input.id },
        include: {
          tags: {
            include: {
              tag: true
            }
          }
        }
      });
    }),
  getByIDs: publicProcedure
    .input(z.object({
      ids: z.array(z.string()),
    }))
    .query(async ({ ctx, input }) => {
      if (input.ids.length === 0) return [];

      return await ctx.db.question.findMany({
        where: { id: { in: input.ids } },
        include: {
          tags: {
            include: {
              tag: true
            }
          }
        }
      });
    }),
});
