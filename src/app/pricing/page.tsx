import {
  SignedIn,
  SignedOut,
  SignInButton,
  CreateOrganization,
  PricingTable,
  OrganizationSwitcher,
  useAuth,
  useUser,
} from "@clerk/clerk-react";
import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import posthog from "posthog-js";
import { ArrowRight, CheckCircle2, Users, WandSparkles, FolderKanban, MessageSquareQuote } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PricingPage() {
  const { orgId } = useAuth();
  const { user, isLoaded } = useUser();
  const [searchParams] = useSearchParams();
  const source = searchParams.get("source") ?? "direct";
  const organizationMemberships = ((user as any)?.organizationMemberships ?? []) as unknown[];
  const hasMemberships = organizationMemberships.length > 0;

  useEffect(() => {
    posthog.capture("pricing_viewed", { source });
  }, [source]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
          <div className="flex items-center justify-between gap-4 py-3">
            <Link to="/" className="flex items-center gap-2 text-sm font-semibold">
              <span className="flex size-8 items-center justify-center rounded-md border bg-card">
                <MessageSquareQuote className="size-4 text-primary" />
              </span>
              Break the Ice
            </Link>
            <Button asChild variant="ghost" className="h-9 px-3 text-xs sm:h-10 sm:px-4 sm:text-sm">
              <Link to="/app">Back to app</Link>
            </Button>
          </div>
        </header>

        <div className="mt-10 grid gap-10 lg:mt-14 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="space-y-8">
            <div className="space-y-4">
              <p className="inline-flex rounded-md border bg-background/90 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground shadow-sm">
                Team plan
              </p>
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
                Icebreakers for classes, workshops, and teams.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
                Shared prompt collections, collaborator invites, and more AI room for the people actually running the room.
              </p>
              <p className="max-w-2xl text-sm text-muted-foreground">
                You’ll sign in, choose the organization to bill, then open Clerk checkout for that workspace.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {[
                {
                  icon: Users,
                  title: "Shared workspaces",
                  copy: "Keep class, workshop, and team prompts in one place.",
                },
                {
                  icon: FolderKanban,
                  title: "Reusable collections",
                  copy: "Build themed sets once and run them again without prep.",
                },
                {
                  icon: WandSparkles,
                  title: "Higher AI limits",
                  copy: "Use AI as backup support, not the whole sales pitch.",
                },
              ].map((item) => (
                <div key={item.title} className="rounded-lg border bg-card p-5 shadow-sm">
                  <item.icon className="mb-4 size-6 text-primary" />
                  <h2 className="font-semibold">{item.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.copy}</p>
                </div>
              ))}
            </div>

            <div className="rounded-lg border bg-muted/30 p-6">
              <h2 className="text-xl font-semibold">What Team unlocks</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  "Create and manage workspaces",
                  "Invite staff or co-facilitators",
                  "Save shared question collections",
                  "Use higher monthly AI limits",
                  "Manage billing from Clerk",
                  "Keep your team setup ready for each session",
                ].map((feature) => (
                  <div key={feature} className="flex items-center gap-3 rounded-lg bg-card px-4 py-3 text-sm shadow-sm">
                    <CheckCircle2 className="size-4 text-emerald-500" />
                    {feature}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="order-first rounded-lg border bg-card p-6 shadow-sm lg:order-none">
            <SignedOut>
              <div className="space-y-5 text-center">
                <h2 className="text-2xl font-bold">Sign in to start a Team workspace</h2>
                <div className="rounded-lg border bg-muted/30 p-4 text-left text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">Checkout flow</p>
                  <p className="mt-2">1. Sign in.</p>
                  <p>2. Pick the organization to bill.</p>
                  <p>3. Review Clerk checkout for that workspace.</p>
                </div>
                <SignInButton mode="modal">
                  <Button
                    variant="default"
                    onClick={() => posthog.capture("upgrade_clicked", { source, payer: "organization" })}
                    className="w-full"
                  >
                    Sign in to continue
                    <ArrowRight className="ml-2 size-4" />
                  </Button>
                </SignInButton>
              </div>
            </SignedOut>

            <SignedIn>
              {!orgId && !isLoaded ? (
                <div className="space-y-4">
                  <h2 className="text-2xl font-bold">Loading workspaces</h2>
                  <p className="text-sm text-muted-foreground">
                    Checking your organization memberships before we open checkout.
                  </p>
                </div>
              ) : !orgId && hasMemberships ? (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-2xl font-bold">Select a workspace first</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      You already belong to at least one organization. Pick the workspace you want to bill before opening checkout.
                    </p>
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <OrganizationSwitcher />
                  </div>
                </div>
              ) : !orgId ? (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-2xl font-bold">Create a workspace first</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Clerk billing for organizations needs an active organization. Create one here, then return to pricing.
                    </p>
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <CreateOrganization />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-2xl font-bold">Start Team Plan</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Billing opens for your active organization. When checkout completes you will return to the app with team features enabled.
                    </p>
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <PricingTable
                      for="organization"
                      collapseFeatures={false}
                      ctaPosition="bottom"
                      newSubscriptionRedirectUrl="/billing/success"
                    />
                  </div>
                </div>
              )}
            </SignedIn>
          </section>
        </div>
      </div>
    </div>
  );
}
