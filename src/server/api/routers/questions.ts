// src/server/api/routers/questions.ts
import { z } from "zod";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "../trpc";
import { generateIcebreakerQuestion } from "~/server/openai";
import type { Question } from "~/app/_components/types";
import { TRPCError } from "@trpc/server";

interface Tag {
  id: string;
  name: string;
}

interface QuestionTag {
  tag: Tag;
}

interface QuestionWithTags {
  id: string;
  text: string;
  category: string;
  tags: QuestionTag[];
}

interface TagForQuestion {
  questionId: string;
  id: string;
  name: string;
}

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
          id: t.tag.id,
          name: t.tag.name
        }))
      })
      const questions: Question[] = [...dbQuestions];
      questions.push({
        id: aiQuestion.id,
        text: aiQuestion.text,
        category: aiQuestion.category,
        tags: (aiQuestion as QuestionWithTags).tags.map(t => ({
          id: t.tag.id,
          name: t.tag.name
        }))
      });

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
      const question = await ctx.db.question.findUnique({
        where: { id: input.id },
        include: {
          tags: {
            include: {
              tag: true
            }
          }
        }
      });

      if (!question) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Question not found",
        });
      }

      return {
        id: question.id,
        text: question.text,
        category: question.category,
        tags: question.tags.map(t => ({
          id: t.tag.id,
          name: t.tag.name
        }))
      };
    }),
});
