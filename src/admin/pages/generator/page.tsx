import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { estimateCostUsd } from "@convex/lib/generatorCost";
import { AlertTriangle, ArrowLeft, Check, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Segmented } from "@/admin/components/Segmented";
import { useRevealModels } from "@/admin/components/useRevealModels";
import { CellPanel } from "./CellPanel";
import { ModelChips } from "./ModelChips";
import { cellKey, cellResults, gapCells, modelName, parseCellKey, progress, toggleAll, usd, type Experiment } from "./grid";

// The server's limits (admin/generator.ts).
const MAX_CALLS = 100;
const PER_CALL_OPTIONS = ["1", "2", "3", "4", "5"].map((value) => ({ value, label: value }));
const errorMessage = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

type Axis = { slug: string; name: string };

/** How full a cell is in the library: a gap stands out, a full cell recedes. */
function coverageClass(count: number): string {
  if (count === 0) return "bg-amber-500/15";
  if (count < 3) return "bg-amber-500/5";
  if (count < 6) return "bg-emerald-500/5";
  return "bg-emerald-500/15";
}

export default function GeneratorPage() {
  const [params, setParams] = useSearchParams();
  const experimentId = params.get("experiment") as Id<"generatorExperiments"> | null;
  const styles = useQuery(api.core.styles.getStyles, {});
  const tones = useQuery(api.core.tones.getTones, {});
  const topics = useQuery(api.core.topics.getTopics, {});
  const experiments = useQuery(api.admin.generator.listExperiments, {});

  const open = (id: Id<"generatorExperiments"> | null) => setParams(id ? { experiment: id } : {});

  if (!styles || !tones || !topics || !experiments) {
    return (
      <div className="flex h-[50vh] items-center justify-center" role="status">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <span className="sr-only">Loading the generator</span>
      </div>
    );
  }
  const styleAxis: Axis[] = styles.map((s) => ({ slug: s.slug ?? s.id, name: s.name }));
  const toneAxis: Axis[] = tones.map((t) => ({ slug: t.slug ?? t.id, name: t.name }));

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Generator</h1>
          <p className="text-sm text-muted-foreground">
            Pick cells and models, and compare what each model writes. Every question waits for review and gets Claude&rsquo;s check.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Experiment</span>
          <select
            aria-label="Experiment"
            value={experimentId ?? ""}
            onChange={(event) => open((event.target.value || null) as Id<"generatorExperiments"> | null)}
            className="h-9 max-w-72 rounded-md border bg-background px-2 text-sm"
          >
            <option value="">New experiment</option>
            {experiments.map(({ experiment, calls }) => (
              <option key={experiment._id} value={experiment._id}>
                {experiment.name}
                {calls.queued + calls.running > 0 ? " (running)" : ""}
              </option>
            ))}
          </select>
        </label>
      </header>

      {experimentId ? (
        <ExperimentView key={experimentId} id={experimentId} styles={styleAxis} tones={toneAxis} onBack={() => open(null)} />
      ) : (
        <PlanView
          styles={styleAxis}
          tones={toneAxis}
          topics={topics.map((t) => ({ slug: t.slug ?? t.id, name: t.name }))}
          lastModels={experiments[0]?.experiment.models.map((m) => m.model)}
          onStarted={open}
        />
      )}
    </div>
  );
}

function GridTable({
  styles,
  tones,
  renderCell,
  onRow,
  onColumn,
}: {
  styles: Axis[];
  tones: Axis[];
  renderCell: (style: Axis, tone: Axis) => React.ReactNode;
  onRow?: (style: Axis) => void;
  onColumn?: (tone: Axis) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th scope="col" className="w-36 border-b p-2 text-left text-xs font-medium text-muted-foreground">
              Style \ Tone
            </th>
            {tones.map((tone) => (
              <th key={tone.slug} scope="col" className="min-w-[8rem] border-b border-l p-2 text-left font-medium">
                {onColumn ? (
                  <button type="button" onClick={() => onColumn(tone)} className="hover:underline" aria-label={`Select tone ${tone.name}`}>
                    {tone.name}
                  </button>
                ) : (
                  tone.name
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {styles.map((style) => (
            <tr key={style.slug}>
              <th scope="row" className="border-b p-2 text-left font-medium">
                {onRow ? (
                  <button type="button" onClick={() => onRow(style)} className="text-left hover:underline" aria-label={`Select style ${style.name}`}>
                    {style.name}
                  </button>
                ) : (
                  style.name
                )}
              </th>
              {tones.map((tone) => (
                <td key={tone.slug} className="border-b border-l p-0 align-top">
                  {renderCell(style, tone)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PlanView({
  styles,
  tones,
  topics,
  lastModels,
  onStarted,
}: {
  styles: Axis[];
  tones: Axis[];
  topics: Axis[];
  lastModels?: string[];
  onStarted: (id: Id<"generatorExperiments">) => void;
}) {
  const models = useQuery(api.admin.generator.listModels, {});
  const createExperiment = useMutation(api.admin.generator.createExperiment);
  const [topic, setTopic] = React.useState("");
  const setup = useQuery(api.admin.generator.getSetup, topic ? { topicSlug: topic } : {});
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [chosenModels, setChosenModels] = React.useState<Set<string> | null>(null);
  const [perCall, setPerCall] = React.useState("2");
  const [direction, setDirection] = React.useState("");
  const [gapBelow, setGapBelow] = React.useState(3);
  const [starting, setStarting] = React.useState(false);

  // Until a chip is touched, the last run's models that are still saved are on, or else the first saved model.
  const defaultModels = React.useMemo(() => {
    const saved = (models ?? []).map((m) => m.model);
    const last = (lastModels ?? []).filter((m) => saved.includes(m));
    return new Set(last.length > 0 ? last : saved.slice(0, 1));
  }, [models, lastModels]);
  const activeModels = chosenModels ?? defaultModels;
  const toggleModel = (model: string) => {
    const next = new Set(activeModels);
    if (next.has(model)) next.delete(model);
    else next.add(model);
    setChosenModels(next);
  };

  const allKeys = styles.flatMap((s) => tones.map((t) => cellKey(s.slug, t.slug)));
  const coverage = setup?.coverage ?? {};
  const calls = selected.size * activeModels.size;
  const questions = calls * Number(perCall);
  const estimate = setup ? estimateCostUsd(setup.rates, calls, Number(perCall)) : 0;
  const blocker =
    selected.size === 0
      ? "Pick at least one cell."
      : activeModels.size === 0
        ? "Pick at least one model."
        : calls > MAX_CALLS
          ? `That is ${calls} calls; the limit is ${MAX_CALLS}.`
          : setup && estimate > setup.budget.leftUsd
            ? `Estimated ${usd(estimate)}, more than the ${usd(setup.budget.leftUsd)} left today.`
            : null;

  const start = async () => {
    setStarting(true);
    try {
      const id = await createExperiment({
        cells: [...selected].map(parseCellKey),
        models: [...activeModels],
        questionsPerCall: Number(perCall),
        ...(topic ? { topicSlug: topic } : {}),
        ...(direction.trim() ? { direction: direction.trim() } : {}),
      });
      onStarted(id);
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't start the experiment"));
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Settings" className="grid gap-4 rounded-xl border bg-card p-4 lg:grid-cols-[1fr_auto]">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Models</p>
            {models ? <ModelChips models={models} selected={activeModels} onToggle={toggleModel} /> : <Loader2 className="size-4 animate-spin" />}
          </div>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Extra direction (optional)</span>
            <Textarea
              value={direction}
              onChange={(event) => setDirection(event.target.value)}
              maxLength={500}
              placeholder="Anything every model should know for this run, like a theme or an audience."
              className="min-h-[60px] text-sm"
            />
          </label>
        </div>
        <div className="flex flex-wrap items-start gap-4 lg:flex-col">
          <label className="space-y-1.5">
            <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Topic</span>
            <select aria-label="Topic" value={topic} onChange={(event) => setTopic(event.target.value)} className="h-9 w-48 rounded-md border bg-background px-2 text-sm">
              <option value="">None</option>
              {topics.map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <div className="space-y-1.5">
            <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Questions per call</span>
            <Segmented label="Questions per call" value={perCall} options={PER_CALL_OPTIONS} onChange={setPerCall} />
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setSelected(new Set(allKeys))}>
          Select all
        </Button>
        <Button size="sm" variant="outline" className="gap-1" onClick={() => setSelected(new Set(gapCells(styles.map((s) => s.slug), tones.map((t) => t.slug), coverage, gapBelow)))}>
          Select gaps below
        </Button>
        <Input
          type="number"
          min={1}
          aria-label="Gap threshold"
          value={gapBelow}
          onChange={(event) => setGapBelow(Math.max(1, Math.floor(Number(event.target.value)) || 1))}
          className="h-8 w-16 text-sm"
        />
        {selected.size > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">Shading: library questions in each cell{topic ? " with this topic" : ""}.</span>
      </div>

      <GridTable
        styles={styles}
        tones={tones}
        onRow={(style) => setSelected((current) => toggleAll(current, tones.map((t) => cellKey(style.slug, t.slug))))}
        onColumn={(tone) => setSelected((current) => toggleAll(current, styles.map((s) => cellKey(s.slug, tone.slug))))}
        renderCell={(style, tone) => {
          const key = cellKey(style.slug, tone.slug);
          const count = coverage[key] ?? 0;
          const on = selected.has(key);
          return (
            <button
              type="button"
              aria-pressed={on}
              aria-label={`${style.name} × ${tone.name}: ${count} in the library`}
              onClick={() =>
                setSelected((current) => {
                  const next = new Set(current);
                  if (next.has(key)) next.delete(key);
                  else next.add(key);
                  return next;
                })
              }
              className={cn(
                "flex h-16 w-full flex-col items-start justify-between p-2 text-left transition-colors hover:ring-1 hover:ring-inset hover:ring-primary/40",
                coverageClass(count),
                on && "bg-primary/15 ring-2 ring-inset ring-primary",
              )}
            >
              <span className="text-lg font-semibold tabular-nums">{count}</span>
              <span className="flex w-full items-center justify-between text-[11px] text-muted-foreground">
                in library
                {on && <Check aria-hidden="true" className="size-3.5 text-primary" />}
              </span>
            </button>
          );
        }}
      />

      <section aria-label="Run" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
        <div className="text-sm">
          <p className="font-medium">
            {selected.size} {selected.size === 1 ? "cell" : "cells"} × {activeModels.size} {activeModels.size === 1 ? "model" : "models"} = {calls}{" "}
            {calls === 1 ? "call" : "calls"}, {questions} questions
          </p>
          <p className="text-muted-foreground">
            {setup ? (
              <>
                About {usd(estimate)} with Claude&rsquo;s checks, at Opus prices · {usd(setup.budget.leftUsd)} left of today&rsquo;s{" "}
                {usd(setup.budget.hardCapUsd)}
                {setup.busyCalls > 0 && ` · ${setup.busyCalls} calls from earlier runs still going`}
              </>
            ) : (
              "Working out the cost…"
            )}
          </p>
          {blocker && selected.size > 0 && (
            <p className="mt-1 flex items-center gap-1 text-amber-700 dark:text-amber-400">
              <AlertTriangle aria-hidden="true" className="size-3.5" /> {blocker}
            </p>
          )}
        </div>
        <Button className="gap-2" disabled={!!blocker || starting || !setup} onClick={() => void start()}>
          {starting ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          Generate
        </Button>
      </section>
    </div>
  );
}

function ExperimentView({ id, styles, tones, onBack }: { id: Id<"generatorExperiments">; styles: Axis[]; tones: Axis[]; onBack: () => void }) {
  const data = useQuery(api.admin.generator.getExperiment, { id });
  const update = useMutation(api.admin.generator.updateExperiment);
  const [reveal, setReveal] = useRevealModels();
  const [openCell, setOpenCell] = React.useState<string | null>(null);

  if (data === undefined) {
    return (
      <div className="flex h-[40vh] items-center justify-center" role="status">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <span className="sr-only">Loading the experiment</span>
      </div>
    );
  }
  if (data === null) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center text-sm">
        <p>That experiment no longer exists.</p>
        <Button variant="link" onClick={onBack}>
          Start a new one
        </Button>
      </div>
    );
  }
  return <ExperimentResults data={data} styles={styles} tones={tones} reveal={reveal} setReveal={setReveal} openCell={openCell} setOpenCell={setOpenCell} onBack={onBack} update={update} />;
}

function ExperimentResults({
  data,
  styles,
  tones,
  reveal,
  setReveal,
  openCell,
  setOpenCell,
  onBack,
  update,
}: {
  data: Experiment;
  styles: Axis[];
  tones: Axis[];
  reveal: boolean;
  setReveal: (reveal: boolean) => void;
  openCell: string | null;
  setOpenCell: (key: string | null) => void;
  onBack: () => void;
  update: (args: { id: Id<"generatorExperiments">; name?: string; note?: string }) => Promise<null>;
}) {
  const { experiment } = data;
  const results = React.useMemo(() => cellResults(data), [data]);
  const counts = progress(data);
  // Cells of styles or tones no longer active still show, after the current ones.
  const rowAxis = [...styles, ...experiment.cells.filter((c) => !styles.some((s) => s.slug === c.style)).map((c) => ({ slug: c.style, name: c.style }))].filter(
    (axis, index, all) => all.findIndex((a) => a.slug === axis.slug) === index,
  );
  const columnAxis = [...tones, ...experiment.cells.filter((c) => !tones.some((t) => t.slug === c.tone)).map((c) => ({ slug: c.tone, name: c.tone }))].filter(
    (axis, index, all) => all.findIndex((a) => a.slug === axis.slug) === index,
  );
  const save = (fields: { name?: string; note?: string }) => void update({ id: experiment._id, ...fields }).catch((error) => toast.error(errorMessage(error, "Couldn't save")));
  const name = (axis: Axis[], slug: string) => axis.find((a) => a.slug === slug)?.name ?? slug;

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Experiment" className="flex flex-wrap items-start justify-between gap-4 rounded-xl border bg-card p-4">
        <div className="min-w-0 flex-1 space-y-2">
          <Button variant="ghost" size="sm" className="-ml-2 h-7 gap-1 px-2 text-muted-foreground" onClick={onBack}>
            <ArrowLeft aria-hidden="true" className="size-3.5" /> New experiment
          </Button>
          <Input
            key={`name-${experiment.name}`}
            aria-label="Experiment name"
            defaultValue={experiment.name}
            onBlur={(event) => event.target.value.trim() && event.target.value.trim() !== experiment.name && save({ name: event.target.value })}
            className="h-9 max-w-md text-base font-semibold"
          />
          <Textarea
            key={`note-${experiment.note ?? ""}`}
            aria-label="Note"
            placeholder="Add a note"
            defaultValue={experiment.note ?? ""}
            onBlur={(event) => event.target.value.trim() !== (experiment.note ?? "") && save({ note: event.target.value })}
            className="min-h-[40px] max-w-md text-sm"
          />
          <p className="text-sm text-muted-foreground">
            {counts.finished} of {counts.total} calls finished
            {counts.failed > 0 && `, ${counts.failed} failed`} · {counts.questions} questions, {counts.waiting} waiting for review · {experiment.questionsPerCall} per call
            {experiment.topicSlug && ` · Topic: ${experiment.topicSlug}`}
          </p>
          {experiment.direction && <p className="text-sm">Direction: {experiment.direction}</p>}
        </div>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium">
            <Switch checked={reveal} onCheckedChange={setReveal} aria-label="Reveal models" />
            Reveal models
          </label>
          <ul aria-label="Models in this experiment" className="space-y-0.5 text-sm text-muted-foreground">
            {experiment.models.map((m) => (
              <li key={m.model}>{reveal ? `${m.blindLabel}: ${m.label}` : m.blindLabel}</li>
            ))}
          </ul>
        </div>
      </section>

      <GridTable
        styles={rowAxis}
        tones={columnAxis}
        renderCell={(style, tone) => {
          const key = cellKey(style.slug, tone.slug);
          const cell = results.get(key);
          if (!cell) return <div className="h-full min-h-16 bg-muted/30" aria-hidden="true" />;
          return (
            <button
              type="button"
              aria-label={`Open ${style.name} × ${tone.name}`}
              onClick={() => setOpenCell(key)}
              className="flex min-h-16 w-full flex-col gap-1 p-2 text-left text-[11px] hover:bg-muted/40"
            >
              {cell.map((result) => (
                <span key={result.model} className="flex flex-wrap items-center gap-x-1.5">
                  <span className="font-semibold text-foreground">{modelName(experiment, result.model, reveal)}</span>
                  {result.pending > 0 && <Loader2 aria-label="Generating" className="size-3 animate-spin text-muted-foreground" />}
                  {result.failed > 0 && <span className="font-medium text-destructive">failed</span>}
                  {result.waiting > 0 && <span className="text-muted-foreground">{result.waiting} waiting</span>}
                  {result.approved > 0 && <span className="text-emerald-700 dark:text-emerald-400">{result.approved} ✓</span>}
                  {result.rejected > 0 && <span className="text-amber-700 dark:text-amber-400">{result.rejected} ✗</span>}
                </span>
              ))}
            </button>
          );
        }}
      />

      {openCell && results.get(openCell) && (
        <CellPanel
          open
          onOpenChange={(isOpen) => !isOpen && setOpenCell(null)}
          title={`${name(rowAxis, parseCellKey(openCell).style)} × ${name(columnAxis, parseCellKey(openCell).tone)}`}
          experiment={experiment}
          results={results.get(openCell)!}
          reveal={reveal}
        />
      )}
    </div>
  );
}
