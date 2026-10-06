import { CheckCircle2, CircleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { editorialReasonLabels } from "../../../convex/lib/questionReviewValidators";

type Reason = keyof typeof editorialReasonLabels;

const safetyLabels: Record<string, string> = {
  trauma: "Trauma",
  targets_person: "Targets a person",
  sexual_illegal: "Sexual or illegal",
  politics_religion: "Politics or religion",
  humiliation: "Humiliation",
};

type Concerns = { reasons: Reason[]; safety: string[]; note: string };

const concernBox = "border-amber-500/40 bg-amber-500/10";
const concernText = "text-amber-600 dark:text-amber-400";
// red-300 in dark mode: red-400 on this tint falls under 4.5:1 on the review queue's grey card.
const safetyBadge = "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300";

/** A hold, or a keep with a safety flag: the app's rule for what a team is shown (flagsQuestion). */
const isConcern = (check: { verdict: "keep" | "hold"; safety: string[] }) => check.verdict === "hold" || check.safety.length > 0;

function ConcernBadges({ reasons, safety }: Pick<Concerns, "reasons" | "safety">) {
  return (
    <>
      {reasons.map((reason) => (
        <Badge key={reason} variant="outline" className="border-amber-500/50">
          {editorialReasonLabels[reason]}
        </Badge>
      ))}
      {safety.map((flag) => (
        // Named as a safety flag in words, not by its colour alone.
        <Badge key={flag} variant="outline" className={safetyBadge}>
          <span className="font-normal">Safety:&nbsp;</span>
          {safetyLabels[flag] ?? flag}
        </Badge>
      ))}
    </>
  );
}

/**
 * The quality check's verdict on a question, for an admin. `outdated` is for a page where the
 * admin is editing what the check read: the verdict is about the saved question, and saving
 * the edit clears it.
 */
export function ClaudeVerdict({
  check,
  outdated = false,
}: {
  check: Concerns & { verdict: "keep" | "hold"; wouldPublish: boolean };
  outdated?: boolean;
}) {
  const concern = isConcern(check);
  const Icon = concern ? CircleAlert : CheckCircle2;
  return (
    // A plain keep stays quiet, so a concern is what the eye lands on in a long queue.
    <div className={cn("rounded-md border px-3 py-2 text-sm", concern ? concernBox : "border-emerald-500/40", outdated && "opacity-70")}>
      <div className="flex flex-wrap items-center gap-2">
        <Icon aria-hidden="true" className={cn("size-4 shrink-0", concern ? concernText : "text-emerald-600 dark:text-emerald-400")} />
        <span className="font-semibold">{check.verdict === "hold" ? "Claude: hold" : "Claude: keep"}</span>
        {check.wouldPublish && (
          <Badge
            variant="outline"
            className="border-emerald-500/50"
            title="A keep at the top confidence with no concerns. Nothing is published automatically."
          >
            Would publish
          </Badge>
        )}
        <ConcernBadges reasons={check.reasons} safety={check.safety} />
      </div>
      {check.note && <p className="mt-1 text-foreground/80">{check.note}</p>}
      {outdated && <p className="mt-1 text-xs font-medium">About the saved question. Saving this edit clears it.</p>}
    </div>
  );
}

/**
 * One line for an admin's list of questions: only a hold or a safety flag is worth a row's
 * space. A safety flag is named whatever the verdict, and takes the safety badge's red.
 */
export function ClaudeConcernBadge({ check }: { check: { verdict: "keep" | "hold"; safety: string[]; note: string } }) {
  if (!isConcern(check)) return null;
  const safety = check.safety.length > 0;
  const label = check.verdict === "keep" ? "Claude: safety flag" : safety ? "Claude: hold, safety flag" : "Claude: hold";
  return (
    <Badge
      variant="outline"
      className={cn("gap-1 font-medium", safety ? safetyBadge : cn(concernBox, "text-amber-800 dark:text-amber-400"))}
      title={check.note || undefined}
    >
      <CircleAlert aria-hidden="true" className="size-3" />
      {label}
    </Badge>
  );
}

/** Why the quality check flagged a question, for someone choosing questions for their team. */
export function ClaudeFlagDetails({ flag }: { flag: Concerns }) {
  return (
    <div className={cn("rounded-lg border p-3 text-sm", concernBox)}>
      <div className="flex flex-wrap items-center gap-2">
        <CircleAlert aria-hidden="true" className={cn("size-4 shrink-0", concernText)} />
        <span className="font-semibold">Flagged by AI review</span>
        <ConcernBadges reasons={flag.reasons} safety={flag.safety} />
      </div>
      {flag.note && <p className="mt-1 text-foreground/80">{flag.note}</p>}
      <p className="mt-1 text-xs text-foreground/80">An automated check raised this. You decide whether to use it.</p>
    </div>
  );
}
