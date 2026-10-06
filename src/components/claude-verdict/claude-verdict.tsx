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

function ConcernBadges({ reasons, safety }: Pick<Concerns, "reasons" | "safety">) {
  return (
    <>
      {reasons.map((reason) => (
        <Badge key={reason} variant="outline" className="border-amber-500/50">
          {editorialReasonLabels[reason]}
        </Badge>
      ))}
      {safety.map((flag) => (
        <Badge key={flag} variant="destructive">
          {safetyLabels[flag] ?? flag}
        </Badge>
      ))}
    </>
  );
}

/** The quality check's verdict on a question in the review queue. */
export function ClaudeVerdict({
  check,
}: {
  check: Concerns & { verdict: "keep" | "hold"; wouldPublish: boolean };
}) {
  const hold = check.verdict === "hold";
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2 text-sm",
        hold ? "border-amber-500/40 bg-amber-500/10" : "border-emerald-500/40 bg-emerald-500/10",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{hold ? "Claude: hold" : "Claude: keep"}</span>
        {check.wouldPublish && (
          <Badge variant="outline" className="border-emerald-500/50">
            Would publish
          </Badge>
        )}
        <ConcernBadges reasons={check.reasons} safety={check.safety} />
      </div>
      {check.note && <p className="mt-1 text-muted-foreground">{check.note}</p>}
    </div>
  );
}

/** Why the quality check would hold a question, for someone choosing questions for their team. */
export function ClaudeFlagDetails({ flag }: { flag: Concerns }) {
  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">Flagged by Claude</span>
        <ConcernBadges reasons={flag.reasons} safety={flag.safety} />
      </div>
      {flag.note && <p className="mt-1 text-muted-foreground">{flag.note}</p>}
    </div>
  );
}
