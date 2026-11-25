import type { FunctionReturnType } from "convex/server";
import type { api } from "@convex/_generated/api";

export type Experiment = NonNullable<FunctionReturnType<typeof api.admin.generator.getExperiment>>;
export type ExperimentCall = Experiment["calls"][number];
export type Cell = { style: string; tone: string };

export const cellKey = (style: string, tone: string) => `${style}|${tone}`;
export const parseCellKey = (key: string): Cell => {
  const [style, tone] = key.split("|");
  return { style, tone };
};

/** Cells with fewer than `below` library questions: the gaps. */
export function gapCells(styles: string[], tones: string[], coverage: Record<string, number>, below: number): string[] {
  return styles.flatMap((style) => tones.map((tone) => cellKey(style, tone))).filter((key) => (coverage[key] ?? 0) < below);
}

/** Adds every key, or takes them all away when they are all in already (a row or column header). */
export function toggleAll(selected: ReadonlySet<string>, keys: string[]): Set<string> {
  const next = new Set(selected);
  const all = keys.every((key) => next.has(key));
  for (const key of keys) {
    if (all) next.delete(key);
    else next.add(key);
  }
  return next;
}

export type ModelResult = {
  model: string;
  calls: ExperimentCall[];
  /** Calls not finished yet. */
  pending: number;
  failed: number;
  waiting: number;
  approved: number;
  rejected: number;
  retired: number;
};

/** Each cell's results, per model in the experiment's model order (blind label order). */
export function cellResults(experiment: Experiment): Map<string, ModelResult[]> {
  const byCell = new Map<string, ModelResult[]>();
  for (const { style, tone } of experiment.experiment.cells) {
    byCell.set(
      cellKey(style, tone),
      experiment.experiment.models.map(({ model }) => ({ model, calls: [], pending: 0, failed: 0, waiting: 0, approved: 0, rejected: 0, retired: 0 })),
    );
  }
  for (const entry of experiment.calls) {
    const result = byCell.get(cellKey(entry.call.style, entry.call.tone))?.find((r) => r.model === entry.call.model);
    if (!result) continue;
    result.calls.push(entry);
    if (entry.call.status === "queued" || entry.call.status === "running") result.pending++;
    if (entry.call.status === "failed") result.failed++;
    for (const { status } of entry.questions) {
      if (status === "pending") result.waiting++;
      else if (status === "live") result.approved++;
      else if (status === "rejected") result.rejected++;
      else result.retired++;
    }
  }
  return byCell;
}

/** How far the experiment has got, over all its calls. */
export function progress(experiment: Experiment) {
  const counts = { total: experiment.calls.length, finished: 0, failed: 0, questions: 0, waiting: 0 };
  for (const { call, questions } of experiment.calls) {
    if (call.status === "done" || call.status === "failed") counts.finished++;
    if (call.status === "failed") counts.failed++;
    counts.questions += questions.length;
    counts.waiting += questions.filter((q) => q.status === "pending").length;
  }
  return counts;
}

/** A model's name in the experiment: its blind label unless models are revealed. */
export function modelName(experiment: Experiment["experiment"], model: string, reveal: boolean): string {
  const entry = experiment.models.find((m) => m.model === model);
  if (!entry) return model;
  return reveal ? entry.label : entry.blindLabel;
}

export const usd = (value: number) => (value > 0 && value < 0.01 ? "<$0.01" : `$${value.toFixed(2)}`);
