import { useState, useEffect, useId } from "react";
import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { NewsletterSubscribeResponse } from "@/types/newsletter";

export function NewsletterCard({ prefilledEmail }: { prefilledEmail?: string }) {
  const [email, setEmail] = useState(prefilledEmail || "");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "verification_required">("idle");
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const subscribe = useAction(api.core.newsletter.subscribe);

  useEffect(() => {
    if (prefilledEmail) setEmail(prefilledEmail);
  }, [prefilledEmail]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || status === "submitting") return;
    setStatus("submitting");
    setError(null);
    try {
      const result = await subscribe({ email: email.trim() }) as NewsletterSubscribeResponse;
      if (result.status === "error" || result.success === false) {
        setError(result.message || "Couldn't subscribe. Try again.");
        setStatus("idle");
      } else {
        setStatus(result.status === "verification_required" ? "verification_required" : "success");
      }
    } catch {
      setError("Couldn't subscribe. Check your connection and try again.");
      setStatus("idle");
    }
  };
  const complete = status === "success" || status === "verification_required";

  return (
    <section className="promo-card" aria-label="Daily questions">
      <div role="status" aria-live="polite" aria-atomic="true">
        {complete && (
          <>
            <h3 className="text-xl font-bold tracking-tight">{status === "verification_required" ? "Check your email" : "You're subscribed"}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {status === "verification_required" ? "Use the link in your email to confirm your subscription." : "Your next daily question will arrive by email."}
            </p>
          </>
        )}
      </div>
      {!complete && (
        <>
          <div>
            <h3 className="text-xl font-bold tracking-tight">A question for tomorrow</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Get one conversation starter by email each morning.</p>
          </div>
          <form onSubmit={event => void handleSubmit(event)} className="space-y-3" aria-busy={status === "submitting"}>
            <label htmlFor={inputId} className="block text-sm font-semibold">Email address</label>
            <Input id={inputId} type="email" autoComplete="email" value={email} required disabled={status === "submitting"}
              onChange={event => setEmail(event.target.value)} className="min-h-11" aria-describedby={error ? `${inputId}-error` : undefined} />
            {error && <p id={`${inputId}-error`} role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" variant="default" disabled={status === "submitting"} className="min-h-11">
              {status === "submitting" ? "Subscribing…" : "Email me a question"}
            </Button>
          </form>
        </>
      )}
    </section>
  );
}
