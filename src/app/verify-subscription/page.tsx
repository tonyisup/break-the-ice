"use client";

import { useEffect, useState, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { useTheme } from "../../hooks/useTheme";
import { Loader2, CheckCircle2, XCircle, ArrowRight } from "lucide-react";

export default function VerifySubscriptionPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const confirmSubscription = useAction(api.core.newsletter.confirmSubscription);
  useTheme();
  const navigate = useNavigate();

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const hasAttempted = useRef(false);

  useEffect(() => {
    const verify = async () => {
      if (!token) {
        setStatus("error");
        setErrorMessage("Missing verification token.");
        return;
      }

      if (hasAttempted.current) return;
      hasAttempted.current = true;

      try {
        await confirmSubscription({ token });
        setStatus("success");
      } catch (error) {
        console.error(error);
        setStatus("error");
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to verify subscription.",
        );
      }
    };

    void verify();
  }, [token, confirmSubscription]);

  return (
    <div className="deck-canvas flex min-h-screen flex-col text-foreground">
      <Header />

      <main className="flex flex-1 items-center justify-center px-4 pb-12 pt-[calc(var(--header-h,4rem)+2rem)]">
        <div className="deck-card w-full max-w-md space-y-6 p-7 text-center sm:p-8">
          <h1 className="text-2xl font-extrabold tracking-[-0.03em] text-card-foreground sm:text-3xl">
            Subscription Verification
          </h1>

          {status === "loading" && (
            <div className="flex flex-col items-center py-6" role="status">
              <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Verifying your subscription…
              </p>
            </div>
          )}

          {status === "success" && (
            <div className="space-y-5 py-2 animate-in fade-in zoom-in-95 duration-300">
              <div className="flex justify-center">
                <CheckCircle2 className="h-14 w-14 text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="text-base text-muted-foreground">
                Subscription Confirmed!
                <br />
                You are now subscribed to Daily Questions.
              </p>
              <Button
                type="button"
                onClick={() => navigate("/app")}
                className="min-h-12 w-full rounded-full font-semibold"
              >
                Go to App <ArrowRight size={18} aria-hidden="true" />
              </Button>
            </div>
          )}

          {status === "error" && (
            <div className="space-y-5 py-2">
              <div className="flex justify-center">
                <XCircle className="h-14 w-14 text-destructive" />
              </div>
              <p className="text-base font-semibold text-foreground">
                Verification Failed
              </p>
              <p className="text-sm text-muted-foreground">{errorMessage}</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/app")}
                className="min-h-11 rounded-full px-6 font-semibold"
              >
                Return to Questions
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
