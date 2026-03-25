import { useEffect } from "react";
import { Link } from "react-router-dom";
import posthog from "posthog-js";
import { Button } from "@/components/ui/button";

export default function BillingCancelPage() {
  useEffect(() => {
    posthog.capture("team_checkout_canceled");
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
      <div className="w-full max-w-xl rounded-[2rem] border border-white/10 bg-white/5 p-8 text-center">
        <h1 className="text-3xl font-black">Checkout canceled</h1>
        <p className="mt-3 text-slate-300">
          Nothing changed. Your workspace is still on the free plan until you complete Team checkout.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button asChild className="bg-amber-400 text-slate-950 hover:bg-amber-300">
            <Link to="/pricing?source=cancel">Return to pricing</Link>
          </Button>
          <Button asChild variant="outline" className="border-white/15 bg-transparent text-white hover:bg-white/10">
            <Link to="/settings?expand=subscription">Back to settings</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
