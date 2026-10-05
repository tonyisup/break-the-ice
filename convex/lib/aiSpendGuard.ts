import { ConvexError, type Value } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { ERROR_CODES, ERROR_MESSAGES } from "../constants";
import { completionUsage, dailyCaps, spendDay, type SpendClass } from "./aiSpend";
import { convexErrorData } from "./errorData";

function budgetPaused(): ConvexError<{ code: string; message: string }> {
  return new ConvexError({ code: ERROR_CODES.AI_BUDGET_PAUSED, message: ERROR_MESSAGES.AI_BUDGET_PAUSED });
}

/** Throws AI_BUDGET_PAUSED when today's budget for this class is spent. Call before any work. */
export async function ensureAiBudget(ctx: Pick<ActionCtx, "runQuery">, spendClass: SpendClass): Promise<void> {
  const allowed = await ctx.runQuery(internal.internal.aiSpend.checkAiBudget, {
    spendClass,
    day: spendDay(Date.now()),
    ...dailyCaps(),
  });
  if (!allowed) throw budgetPaused();
}

export type AiReservation = { spendClass: SpendClass; day: string; reservedUsd: number };
type SpendCtx = Pick<ActionCtx, "runMutation" | "scheduler">;

/** Sets aside `reserveUsd` for one call right before the provider call, or throws AI_BUDGET_PAUSED. */
export async function reserveAiSpend(ctx: SpendCtx, spendClass: SpendClass, reserveUsd: number): Promise<AiReservation> {
  const reservation = { spendClass, day: spendDay(Date.now()), reservedUsd: reserveUsd };
  const reserved = await ctx.runMutation(internal.internal.aiSpend.reserveAiSpend, {
    spendClass,
    day: reservation.day,
    ...dailyCaps(),
    reserveUsd: reservation.reservedUsd,
  });
  if (!reserved) throw budgetPaused();
  return reservation;
}

/** Gives the reservation back when the provider call failed. Never throws. */
export async function releaseAiReservation(ctx: SpendCtx, reservation: AiReservation): Promise<void> {
  try {
    await ctx.runMutation(internal.internal.aiSpend.releaseAiSpend, reservation);
  } catch (error) {
    // The reservation stays counted, which errs on the side of spending less.
    console.error("Failed to release AI spend reservation", error);
  }
}

/**
 * Settles a reservation to what the completion actually cost and stores its usage on
 * the run; a completion with no reported cost keeps the whole reservation. Never throws: the
 * call is already paid for. If the write fails it is retried through the scheduler; until it
 * lands, the reservation still counts toward the cap.
 */
export async function settleAiCompletion(
  ctx: SpendCtx,
  reservation: AiReservation,
  runId: Id<"generationRuns"> | undefined,
  completion: { model?: string; usage?: unknown },
): Promise<void> {
  const args = { ...reservation, runId, resolvedModel: completion.model, ...completionUsage(completion.usage, reservation.reservedUsd) };
  try {
    await ctx.runMutation(internal.internal.aiSpend.settleAiSpend, args);
  } catch (error) {
    console.error("Failed to record AI spend; retrying in the background", error);
    try {
      await ctx.scheduler.runAfter(0, internal.internal.aiSpend.settleAiSpend, args);
    } catch (retryError) {
      console.error("Failed to schedule the AI spend retry", retryError);
    }
  }
}

/** A generation that failed after the provider was paid: the caller shouldn't refund usage. */
export function billedFailure(error: unknown): unknown {
  // Keep a ConvexError's code and message (a paused budget still reads as one), but mark it
  // billed: the paid attempt may be followed by a retry that fails this way.
  if (error instanceof ConvexError) {
    const data = convexErrorData(error);
    return data ? new ConvexError({ ...(data as Record<string, Value>), billed: true }) : error;
  }
  return new ConvexError({
    code: ERROR_CODES.AI_GENERATION_FAILED,
    message: ERROR_MESSAGES.AI_GENERATION_FAILED,
    billed: true,
  });
}

/** Whether a failed generation had already been paid for (see billedFailure). */
export function wasAiCallBilled(error: unknown): boolean {
  return convexErrorData(error)?.billed === true;
}
