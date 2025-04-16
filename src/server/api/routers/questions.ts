// src/server/api/routers/questions.ts
import { z } from "zod";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "../trpc";
import { generateIcebreakerQuestion } from "~/server/openai";
import { Prisma } from "@prisma/client";
import type { Question as PrismaQuestion, Tag } from "@prisma/client";

type Question = PrismaQuestion & {
  tags: Array<{
    tag: Tag;
  }>;
};
export const questionsRouter = createTRPCRouter({
  removeTag: protectedProcedure
    .input(z.object({
      questionId: z.number(),
      tagId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      return await ctx.db.questionTag.delete({ where: { questionId_tagId: { questionId: input.questionId, tagId: input.tagId } } });
    }),
  updateQuestion: protectedProcedure
    .input(z.object({
      id: z.number(),
      text: z.string(),
      category: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      return await ctx.db.question.update({
        where: { id: input.id },
        data: { text: input.text, category: input.category }
      });
    }),
  removeQuestion: protectedProcedure
    .input(z.object({
      id: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      return await ctx.db.question.delete({ where: { id: input.id } });
    }),
  getAll: protectedProcedure .query(async ({ ctx }) => {
    return await ctx.db.question.findMany({
      include: {
        tags: {
          include: {
            tag: true
          }
        }
      },
      orderBy: [
        {
          category: 'asc',
        },
        {
          text: 'asc'
        }
      ]
    });
  }),
  // Get a random question
  getRandomStack: publicProcedure
    .input(z.object({
      skipIds: z.array(z.number()).optional(),
      likeIds: z.array(z.number()).optional(),
      skipCategories: z.array(z.string()).optional(),
      likeCategories: z.array(z.string()).optional(),
      skipTags: z.array(z.string()).optional(),
      likeTags: z.array(z.string()).optional(),
    }))
    .query(async ({ ctx, input }) => {
      
      // Fetch skipped and liked questions from the database
      const skippedQuestions = input.skipIds && input.skipIds.length > 0
        ? await ctx.db.$queryRaw<Question[]>`
          SELECT [id], [text], [category]
          FROM [ice].[Question]
          WHERE [id] IN (${Prisma.join(input.skipIds)})
        `
        : [];

      const likedQuestions = input.likeIds && input.likeIds.length > 0
        ? await ctx.db.$queryRaw<Question[]>`
          SELECT [id], [text], [category]
          FROM [ice].[Question]
          WHERE [id] IN (${Prisma.join(input.likeIds)})
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
          AND (0=${input?.skipIds?.length ?? 0} or [q].[id] NOT IN (${input?.skipIds?.length ?? 0 > 0 ? Prisma.join(input.skipIds ?? [0]) : "0"}))
          AND (0=${input?.likeIds?.length ?? 0} or [q].[id] NOT IN (${input?.likeIds?.length ?? 0 > 0 ? Prisma.join(input.likeIds ?? [0]) : "0"}))
          AND (0=${input.skipCategories?.length ?? 0} or [q].[category] NOT IN (${input.skipCategories?.length ?? 0 > 0 ? Prisma.join(input.skipCategories ?? [""]) : "0"}))
          AND (0=${input.likeCategories?.length ?? 0} or [q].[category] IN (${input.likeCategories?.length ?? 0 > 0 ? Prisma.join(input.likeCategories ?? [""]) : "0"}))
          AND (0=${input.skipTags?.length ?? 0} or [t].[name] NOT IN (${input.skipTags?.length ?? 0 > 0 ? Prisma.join(input.skipTags ?? [""]) : "0"}))
          AND (0=${input.likeTags?.length ?? 0} or [t].[name] IN (${input.likeTags?.length ?? 0 > 0 ? Prisma.join(input.likeTags ?? [""]) : "0"}))

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
        question.tags = dbQuestionsWIthTags.filter(q => q.questionId == question.id)
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
      id: z.number(),
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
      ids: z.array(z.number()),
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
