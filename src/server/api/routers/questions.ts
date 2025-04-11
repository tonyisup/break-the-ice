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
      skipCategories: z.array(z.string()).optional(),
      likeCategories: z.array(z.string()).optional(),
      skipTags: z.array(z.string()).optional(),
      likeTags: z.array(z.string()).optional(),
    }))
    .query(async ({ ctx, input }) => {

      const skip = input.skipIds?.length ?? 0;
      const like = input.likeIds?.length ?? 0;

      const skipIDs = input.skipIds?.join(',');
      const likeIDs = input.likeIds?.join(',');
      
      // Fetch skipped and liked questions from the database
      const skippedQuestions = skip > 0
        ? await ctx.db.$queryRaw<Question[]>`
          SELECT [id], [text], [category]
          FROM [ice].[Question]
          WHERE [id] IN (${skipIDs})
        `
        : [];

      const likedQuestions = like > 0
        ? await ctx.db.$queryRaw<Question[]>`
          SELECT [id], [text], [category]
          FROM [ice].[Question]
          WHERE [id] IN (${likeIDs})
        `
        : [];

      // Run database query and AI generation in parallel
      const [dbQuestions, aiQuestionData] = await Promise.all([
        ctx.db.$queryRaw<Question[]>`
          SELECT top 4 
            [q].[id]
            ,[q].[text]
            ,[q].[category]
          FROM [ice].[Question] [q]
          LEFT JOIN [ice].[QuestionTag] [qt] ON [q].[id] = [qt].[questionId]
          LEFT JOIN [ice].[Tag] [t] ON [qt].[tagId] = [t].[id]
          WHERE (1=1)
          AND (1=${skip > 0 ? `1 and [q].[id] NOT IN (${skipIDs})` : "1"})
          AND (1=${like > 0 ? `1 and [q].[id] IN (${likeIDs})` : "1"})
          AND (${input.skipCategories?.length ?? 0} = 0 or [q].[category] NOT IN (${input.skipCategories}))
          AND (${input.likeCategories?.length ?? 0} = 0 or [q].[category] IN (${input.likeCategories}))
          AND (${input.skipTags?.length ?? 0} = 0 or [t].[name] NOT IN (${input.skipTags}))
          AND (${input.likeTags?.length ?? 0} = 0 or [t].[name] IN (${input.likeTags}))

          ORDER BY newid()
        `,
        generateIcebreakerQuestion({ 
          skips: skippedQuestions, 
          likes: likedQuestions, 
          skipTags: input.skipTags ?? [], 
          likeTags: input.likeTags ?? [], 
          skipCategories: input.skipCategories ?? [], 
          likeCategories: input.likeCategories ?? [] }),
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
