import { useEffect } from "react";
import { Link } from "react-router-dom";
import posthog from "posthog-js";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function BillingSuccessPage() {
  useEffect(() => {
    posthog.capture("team_checkout_completed");
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
      <div className="w-full max-w-xl rounded-[2rem] border border-emerald-400/20 bg-emerald-500/10 p-8 text-center shadow-2xl shadow-emerald-950/30">
        <CheckCircle2 className="mx-auto size-14 text-emerald-300" />
        <h1 className="mt-6 text-3xl font-black">Team plan is live</h1>
        <p className="mt-3 text-slate-200">
          Your workspace billing is active. You can now invite collaborators and create shared collections.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button asChild className="bg-emerald-400 text-slate-950 hover:bg-emerald-300">
            <Link to="/settings?expand=subscription,organization">Open workspace settings</Link>
          </Button>
          <Button asChild variant="outline" className="border-white/15 bg-transparent text-white hover:bg-white/10">
            <Link to="/app">Return to app</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
