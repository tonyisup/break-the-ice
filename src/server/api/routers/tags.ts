import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const tagsRouter = createTRPCRouter({
  getAll: protectedProcedure.query(async ({ ctx }) => {
    return await ctx.db.tag.findMany({
      include: {
        _count: {
          select: {
            questions: true
          }
        }
      },
      orderBy: {
        name: 'asc'
      }
    });
  }),

  remove: protectedProcedure
    .input(z.object({
      id: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Delete the tag and all its question associations (cascade delete)
      return await ctx.db.tag.delete({
        where: { id: input.id }
      });
    }),

  merge: protectedProcedure
    .input(z.object({
      sourceId: z.number(),
      targetId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Start a transaction to ensure data consistency
      return await ctx.db.$transaction(async (tx) => {
        // Get all questions associated with the source tag
        const sourceTag = await tx.tag.findUnique({
          where: { id: input.sourceId },
          include: {
            questions: {
              include: {
                question: true
              }
            }
          }
        });

        if (!sourceTag) {
          throw new Error("Source tag not found");
        }

        // For each question associated with the source tag
        for (const questionTag of sourceTag.questions) {
          // Check if the question already has the target tag
          const existingTag = await tx.questionTag.findUnique({
            where: {
              questionId_tagId: {
                questionId: questionTag.questionId,
                tagId: input.targetId
              }
            }
          });

          // If the question doesn't have the target tag, add it
          if (!existingTag) {
            await tx.questionTag.create({
              data: {
                questionId: questionTag.questionId,
                tagId: input.targetId
              }
            });
          }
        }

        // Delete the source tag (this will cascade delete all QuestionTag associations)
        await tx.tag.delete({
          where: { id: input.sourceId }
        });

        return { success: true };
      });
    }),
}); 