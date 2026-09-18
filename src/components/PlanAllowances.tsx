import { useCallback, useEffect, useState } from "react";
import { useConvex } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "./ui/button";

type Limits = { free: number; team: number; cycleDays: number };

export function PlanAllowances() {
  const convex = useConvex();
  const [limits, setLimits] = useState<Limits | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => { setFailed(false); setAttempt(value => value + 1); }, []);

  useEffect(() => {
    let active = true;
    void convex.query(api.core.billing.getPublicPlanLimits, {}).then(result => {
      if (active) setLimits(result);
    }).catch(() => {
      if (active) setFailed(true);
    });
    return () => { active = false; };
  }, [convex, attempt]);

  return (
    <div className="mt-6 border-t border-border pt-5 text-sm text-muted-foreground" aria-live="polite">
      {limits ? (
        <p>AI generation: <strong className="text-foreground">{limits.free} on Free</strong> or <strong className="text-foreground">{limits.team} on Team</strong> per person, per workspace, every {limits.cycleDays} days.</p>
      ) : failed ? (
        <p>Couldn't load the AI allowances. <Button variant="link" onClick={retry} className="text-foreground">Retry</Button></p>
      ) : <p>Loading AI allowances…</p>}
    </div>
  );
}
