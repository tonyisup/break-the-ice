"use client";

import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAction, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAuth } from "@clerk/clerk-react";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { useTheme } from "../../hooks/useTheme";
import { toast } from "sonner";
import { Loader2, Mail, CheckCircle2, XCircle, ArrowRight } from "lucide-react";
import { NewsletterSubscribeResponse } from "@/types/newsletter";

const UnsubscribePage = () => {
  const [searchParams] = useSearchParams();
  const { isSignedIn, isLoaded } = useAuth();
  useTheme();

  const currentUser = useQuery(api.core.users.getCurrentUser, {});
  const unsubscribeAction = useAction(api.resend.unsubscribeContact);
  const getStatusAction = useAction(api.resend.getContactStatus);
  const subscribeAction = useAction(api.core.newsletter.subscribe);

  const [email, setEmail] = useState<string | null>(null);
  const [formEmail, setFormEmail] = useState("");
  const [status, setStatus] = useState<
    | "loading"
    | "subscribed"
    | "unsubscribed"
    | "unset"
    | "error"
    | "success_subscribed"
    | "verification_sent"
  >("loading");
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const token = searchParams.get("token");
    if (token || (isLoaded && isSignedIn && currentUser?.email)) {
      void checkStatus(token ?? undefined);
    } else if (isLoaded) {
      setStatus("error");
    }
  }, [searchParams, isLoaded, isSignedIn, currentUser]);

  const checkStatus = async (token?: string) => {
    setStatus("loading");
    try {
      const result = await getStatusAction({ token });
      if (result.email) {
        setEmail(result.email);
        setFormEmail(result.email);
      }
      if (result.subscribed === true) {
        setStatus("subscribed");
      } else if (result.subscribed === false) {
        setStatus("unsubscribed");
      } else {
        setStatus("unset");
      }
    } catch (error) {
      console.error(error);
      setStatus("error");
    }
  };

  const handleUnsubscribe = async () => {
    setIsProcessing(true);
    try {
      await unsubscribeAction({
        token: searchParams.get("token") ?? undefined,
      });
      setStatus("unsubscribed");
      toast.success("You have been unsubscribed from daily questions.");
    } catch (error) {
      console.error(error);
      toast.error("Failed to unsubscribe. Please try again later.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubscribe = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const targetEmail =
      isSignedIn && currentUser?.email ? currentUser.email : formEmail || email;

    if (!targetEmail) {
      toast.error("Please enter a valid email address.");
      return;
    }

    setIsProcessing(true);
    try {
      const result = (await subscribeAction({
        email: targetEmail,
      })) as NewsletterSubscribeResponse;

      if (result.status === "verification_required") {
        setStatus("verification_sent");
        toast.success("Verification email sent!");
      } else if (result.status === "error" || result.success === false) {
        setStatus("error");
        toast.error(result.message || "Subscription failed");
      } else {
        setStatus("success_subscribed");
        toast.success("Successfully subscribed!");
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to subscribe. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="deck-canvas flex min-h-screen flex-col text-foreground">
      <Header />

      <main className="flex flex-1 items-center justify-center px-4 pb-12 pt-[calc(var(--header-h,4rem)+2rem)]">
        <div className="deck-card w-full max-w-md space-y-6 p-7 text-center sm:p-8">
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Mail className="h-8 w-8" aria-hidden="true" />
            </div>
          </div>

          <h1 className="text-2xl font-extrabold tracking-[-0.03em] text-card-foreground sm:text-3xl">
            Newsletter Settings
          </h1>

          {status === "loading" && (
            <div className="flex flex-col items-center py-6" role="status">
              <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Checking your subscription…
              </p>
            </div>
          )}

          {status === "subscribed" && (
            <div className="space-y-6 py-2">
              <p className="text-base text-muted-foreground">
                You are currently subscribed with:
                <br />
                <span className="font-bold text-foreground">{email}</span>
              </p>
              <Button
                variant="destructive"
                onClick={handleUnsubscribe}
                disabled={isProcessing}
                className="min-h-12 w-full rounded-full font-semibold"
              >
                {isProcessing ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  "Unsubscribe from Daily Questions"
                )}
              </Button>
            </div>
          )}

          {status === "unsubscribed" && (
            <div className="space-y-5 py-2 animate-in fade-in zoom-in-95 duration-300">
              <div className="flex justify-center">
                <CheckCircle2 className="h-12 w-12 text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="text-base text-muted-foreground">
                You have been unsubscribed.
                <br />
                We're sorry to see you go!
              </p>
              <div className="flex flex-col gap-2.5">
                <Button
                  onClick={() => handleSubscribe()}
                  disabled={isProcessing}
                  className="min-h-11 w-full rounded-full font-semibold"
                >
                  {isProcessing ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    "Mistake? Re-subscribe"
                  )}
                </Button>
                <Button asChild variant="outline" className="min-h-11 w-full rounded-full font-semibold">
                  <Link to="/app">Return to Questions</Link>
                </Button>
              </div>
            </div>
          )}

          {status === "success_subscribed" && (
            <div className="space-y-5 py-2 animate-in fade-in zoom-in-95 duration-300">
              <div className="flex justify-center">
                <CheckCircle2 className="h-12 w-12 text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="text-base text-muted-foreground">
                You're in! Welcome to Daily Questions.
              </p>
              <Button asChild className="min-h-11 w-full rounded-full font-semibold">
                <Link to="/app">Go to App</Link>
              </Button>
            </div>
          )}

          {status === "verification_sent" && (
            <div className="space-y-5 py-2 animate-in fade-in zoom-in-95 duration-300">
              <p className="text-base text-muted-foreground">
                Please check your email. We sent a confirmation link to{" "}
                <strong className="text-foreground">{formEmail || email}</strong>.
              </p>
              <Button asChild className="min-h-11 w-full rounded-full font-semibold">
                <Link to="/app">Go to App</Link>
              </Button>
            </div>
          )}

          {(status === "error" || status === "unset") && (
            <div className="space-y-5 py-2">
              {status === "error" && (
                <div className="flex justify-center">
                  <XCircle className="h-12 w-12 text-destructive" />
                </div>
              )}
              <p className="text-base text-muted-foreground">
                We couldn't find your subscription details.
              </p>

              <div className="rounded-2xl border border-border bg-muted/40 p-5">
                <p className="mb-4 text-sm text-muted-foreground">
                  Would you like to subscribe instead?
                </p>

                {isSignedIn && currentUser?.email ? (
                  <Button
                    onClick={() => handleSubscribe()}
                    disabled={isProcessing}
                    className="min-h-11 w-full rounded-full font-semibold"
                  >
                    {isProcessing ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      `Subscribe as ${currentUser.email}`
                    )}
                  </Button>
                ) : (
                  <form onSubmit={handleSubscribe} className="space-y-3">
                    <input
                      type="email"
                      placeholder="Enter your email"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      required
                    />
                    <Button
                      type="submit"
                      disabled={isProcessing}
                      className="min-h-11 w-full rounded-full font-semibold"
                    >
                      {isProcessing ? <Loader2 className="animate-spin" /> : "Subscribe"}
                    </Button>
                  </form>
                )}
              </div>

              <Button asChild variant="ghost" className="rounded-full text-muted-foreground hover:text-foreground">
                <Link to="/app">
                  Go to App <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default UnsubscribePage;
