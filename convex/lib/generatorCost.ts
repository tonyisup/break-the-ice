/** What a call and a check cost lately, at Opus prices (admin/generator.ts costRates). */
export type CostRates = { perCallUsd: number; perQuestionUsd: number; perCheckUsd: number };

/**
 * A generator experiment's estimated cost: each call's prompt, each question it asks for, and
 * Claude's check of each question. The page shows it and the server refuses a run over the
 * budget left with the same formula.
 */
export function estimateCostUsd(rates: CostRates, calls: number, questionsPerCall: number): number {
  const questions = calls * questionsPerCall;
  return calls * rates.perCallUsd + questions * rates.perQuestionUsd + questions * rates.perCheckUsd;
}
