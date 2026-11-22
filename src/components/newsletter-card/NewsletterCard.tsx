import React, { useState, useEffect, useId, useRef } from "react";
import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { toast } from "sonner";
import { Mail, Loader2, Check } from "lucide-react";
import { NewsletterSubscribeResponse } from "@/types/newsletter";
import { Button } from "@/components/ui/button";

interface NewsletterCardProps {
  /** Retained for backwards compatibility; all cards now use the unified deck aesthetic. */
  variant?: "blend" | "standout";
  prefilledEmail?: string;
}

export function NewsletterCard({ prefilledEmail }: NewsletterCardProps) {
  const [email, setEmail] = useState(prefilledEmail || "");
  const [status, setStatus] = useState<
    "idle" | "submitting" | "success" | "verification_required"
  >("idle");
  const emailId = useId();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const isComplete = status === "success" || status === "verification_required";
  useEffect(() => {
    if (isComplete) resultRef.current?.focus();
  }, [isComplete]);
  const subscribe = useAction(api.core.newsletter.subscribe);

  useEffect(() => {
    if (prefilledEmail) {
      setEmail(prefilledEmail);
    }
  }, [prefilledEmail]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setErrorMessage(null);
    setStatus("submitting");
    try {
      const result = (await subscribe({
        email,
      })) as NewsletterSubscribeResponse;

      if (result.status === "verification_required") {
        setStatus("verification_required");
        toast.success("Verification email sent!");
      } else if (result.status === "error" || result.success === false) {
        setStatus("idle");
        setErrorMessage(result.message || "Couldn’t subscribe. Try again.");
      } else {
        setStatus("success");
        toast.success("Successfully subscribed!");
      }
    } catch (error) {
      console.error(error);
      setErrorMessage("Couldn’t subscribe. Please try again.");
      setStatus("idle");
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="deck-card overflow-hidden">
        <div
          aria-hidden="true"
          className="h-1.5 w-full bg-primary/70"
        />
        <div className="flex min-h-[280px] flex-col items-center justify-center p-7 sm:p-8">
          <div role="status" aria-live="polite">
            {isComplete && (
              <div className="flex flex-col items-center justify-center px-2 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  {status === "verification_required" ? (
                    <Mail className="h-7 w-7" />
                  ) : (
                    <Check className="h-7 w-7" />
                  )}
                </div>
                <h3
                  ref={resultRef}
                  tabIndex={-1}
                  className="mb-2 text-xl font-bold tracking-[-0.02em] text-card-foreground outline-none"
                >
                  {status === "verification_required"
                    ? "Check your email"
                    : "You’re subscribed"}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {status === "verification_required"
                    ? "We've sent you a link to confirm your subscription."
                    : "Your daily questions will arrive by email."}
                </p>
              </div>
            )}
          </div>

          {!isComplete && (
            <div className="flex w-full flex-col items-center text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Mail className="h-6 w-6" aria-hidden="true" />
              </div>

              <h2 className="mb-1.5 text-xl font-bold tracking-[-0.02em] text-card-foreground">
                Daily Questions?
              </h2>

              <p className="mb-6 max-w-xs text-sm leading-relaxed text-muted-foreground">
                Get a fresh question delivered to your inbox every morning.
              </p>

              <form
                onSubmit={(event) => {
                  void handleSubmit(event);
                }}
                className="w-full space-y-3"
              >
                {!prefilledEmail && (
                  <div>
                    <label htmlFor={emailId} className="sr-only">
                      Email address
                    </label>
                    <input
                      id={emailId}
                      autoComplete="email"
                      type="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={status === "submitting"}
                      className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                )}
                {errorMessage && (
                  <p role="alert" className="text-sm font-medium text-destructive">
                    {errorMessage}
                  </p>
                )}
                <Button
                  type="submit"
                  disabled={status === "submitting"}
                  className="min-h-11 w-full rounded-full font-semibold"
                >
                  {status === "submitting" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Subscribing...
                    </>
                  ) : prefilledEmail ? (
                    "Subscribe"
                  ) : (
                    "Subscribe Now"
                  )}
                </Button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
