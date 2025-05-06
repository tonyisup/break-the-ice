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
    }))
    .mutation(async ({ ctx, input }) => {
      return await ctx.db.question.update({
        where: { id: input.id },
        data: { text: input.text }
      });
    }),
  removeQuestion: protectedProcedure
    .input(z.object({
      id: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      return await ctx.db.question.delete({ where: { id: input.id } });
    }),
  getAll: protectedProcedure.query(async ({ ctx }) => {
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
          text: 'asc'
        }
      ]
    });
  }),
  getRandom: publicProcedure.query(async ({ ctx }) => {
    const count = await ctx.db.question.count();
    const skip = Math.floor(Math.random() * count);
    
    const question = await ctx.db.question.findFirst({
      skip,
      include: {
        tags: {
          include: {
            tag: true
          }
        }
      }
    });
    
    if (!question) {
      return [];
    }
    return [question];
  }),

  // Get a random question
  getRandomStack: publicProcedure
    .input(z.object({
      drawCount: z.number().optional(),
      skipIds: z.array(z.number()).optional(),
      likeIds: z.array(z.number()).optional(),
      skipTags: z.array(z.string()).optional(),
      likeTags: z.array(z.string()).optional(),
      blockedTags: z.array(z.string()).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const drawCount = input.drawCount ?? 5;

      // Run database query and AI generation in parallel
      const dbQuestions = await ctx.db.$queryRaw<Question[]>`
          SELECT top (${drawCount})
            [q].[id]
            ,[q].[text]
          FROM [ice].[Question] [q]
          LEFT JOIN [ice].[QuestionTag] [qt] ON [q].[id] = [qt].[questionId]
          LEFT JOIN [ice].[Tag] [t] ON [qt].[tagId] = [t].[id]
          WHERE (1=1)
          AND (0=${input?.skipIds?.length ?? 0} or [q].[id] NOT IN (${input?.skipIds?.length ?? 0 > 0 ? Prisma.join(input.skipIds ?? [0]) : "0"}))
          AND (0=${input.skipTags?.length ?? 0} or [t].[name] NOT IN (${input.skipTags?.length ?? 0 > 0 ? Prisma.join(input.skipTags ?? [""]) : "0"}))
          AND (0=${input.blockedTags?.length ?? 0} or [t].[name] NOT IN (${input.blockedTags?.length ?? 0 > 0 ? Prisma.join(input.blockedTags ?? [""]) : "0"}))

          ORDER BY newid()
        `
      // Insert the AI-generated question into the database with its tags
      const dbQuestionsWIthTags = await   
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

      dbQuestions.forEach(question => {
        question.tags = dbQuestionsWIthTags.filter(q => q.questionId == question.id)
      })

      // Randomize the order of questions before returning
      return dbQuestions.sort(() => Math.random() - 0.5);
    }),
  // Get all unique tags
  getAllTags: publicProcedure.query(async ({ ctx }) => {
    const tags = await ctx.db.tag.findMany({
      orderBy: {
        name: 'asc'
      }
    });
    return tags.map(t => t.name);
  }),
  // Admin procedures (protected by auth)
  create: protectedProcedure
    .input(z.object({
      text: z.string().min(5),
      tags: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.question.create({
        data: {
          text: input.text,
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
