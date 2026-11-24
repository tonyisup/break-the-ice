import { useEffect, useRef, useState } from "react";
import { Brain, Check, CircleDashed, ListChecks, Loader2, PenLine, PlugZap, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { Trace, TraceDescription, TraceIcon, TraceLine, TraceTitle } from "@/components/ui/trace";
import type { GenerationProgressStage } from "../../../convex/lib/generationProgress";

type WorkingStage = Exclude<GenerationProgressStage, "done" | "failed">;

const STEPS: { stage: WorkingStage; running: string; finished: string; Icon: LucideIcon }[] = [
  { stage: "preparing", running: "Reading your preferences", finished: "Read your preferences", Icon: SlidersHorizontal },
  { stage: "connecting", running: "Connecting to the writer", finished: "Connected to the writer", Icon: PlugZap },
  { stage: "thinking", running: "Thinking through ideas", finished: "Thought through ideas", Icon: Brain },
  { stage: "writing", running: "Writing your questions", finished: "Wrote your questions", Icon: PenLine },
  { stage: "saving", running: "Checking for repeats", finished: "Checked for repeats", Icon: ListChecks },
];

const stepIndex = (stage: WorkingStage) => STEPS.findIndex((step) => step.stage === stage);

/** Live steps of a feed generation, from the server's real progress. */
export function GenerationTrace({ stage }: { stage: GenerationProgressStage | undefined }) {
  const current = stage ?? "preparing";
  // The feed explains a failure or a refusal itself, so the last step simply holds until it does.
  const lastWorkingRef = useRef<WorkingStage>("preparing");
  if (current !== "done" && current !== "failed") lastWorkingRef.current = current;
  const activeIndex = current === "done" ? STEPS.length : stepIndex(lastWorkingRef.current);

  // Measured here rather than on the server, so a device's clock can't skew the durations.
  const startedAtRef = useRef<Map<number, number>>(new Map());
  const finishedAtRef = useRef<Map<number, number>>(new Map());
  const [now, setNow] = useState(() => Date.now());
  const seenIndexRef = useRef(-1);
  if (activeIndex !== seenIndexRef.current) {
    const changedAt = Date.now();
    if (seenIndexRef.current >= 0 && activeIndex > seenIndexRef.current) {
      finishedAtRef.current.set(seenIndexRef.current, changedAt);
    }
    // A retry can return to an earlier step, which is then running again.
    finishedAtRef.current.delete(activeIndex);
    startedAtRef.current.set(activeIndex, changedAt);
    seenIndexRef.current = activeIndex;
  }

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const secondsFor = (index: number) => {
    const startedAt = startedAtRef.current.get(index);
    if (startedAt === undefined) return null;
    const seconds = Math.floor(((finishedAtRef.current.get(index) ?? now) - startedAt) / 1000);
    return seconds >= 1 ? `${seconds}s` : null;
  };

  const activeStep = STEPS[activeIndex];

  return (
    <div className="mx-auto w-fit max-w-full py-6">
      <p role="status" className="sr-only">
        {activeStep ? `${activeStep.running}…` : "New questions are ready."}
      </p>
      <Trace aria-hidden="true">
        {STEPS.map((step, index) => {
          const isActive = index === activeIndex;
          const isFinished = index < activeIndex;
          const status = isActive ? "running" : isFinished ? undefined : "pending";
          const seconds = isActive || isFinished ? secondsFor(index) : null;
          const StepIcon = isFinished ? Check : isActive ? Loader2 : CircleDashed;
          return (
            <TraceLine key={step.stage} status={status}>
              <TraceIcon>
                <StepIcon className={isActive ? "motion-safe:animate-spin" : undefined} />
              </TraceIcon>
              <TraceTitle>{isFinished ? step.finished : step.running}</TraceTitle>
              {seconds && <TraceDescription>{seconds}</TraceDescription>}
            </TraceLine>
          );
        })}
      </Trace>
    </div>
  );
}
