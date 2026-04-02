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
import { ArrowRight, CheckCircle2, Users, WandSparkles, FolderKanban } from "lucide-react";
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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.16),_transparent_30%),linear-gradient(180deg,#08111f_0%,#122033_40%,#0b1220_100%)] text-white">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-10">
        <div className="flex items-center justify-between">
          <Link to="/" className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-200/80">
            Break the Ice
          </Link>
          <Button asChild variant="ghost" className="text-white hover:bg-white/10">
            <Link to="/app">Back to app</Link>
          </Button>
        </div>

        <div className="mt-16 grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="space-y-8">
            <div className="space-y-4">
              <p className="inline-flex rounded-full border border-amber-300/20 bg-amber-300/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber-100">
                Team plan
              </p>
              <h1 className="max-w-3xl text-5xl font-black tracking-tight text-balance">
                Icebreakers for classes, workshops, and teams.
              </h1>
              <p className="max-w-2xl text-lg text-slate-300">
                Shared prompt collections, collaborator invites, and more AI room for the people actually running the room.
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
                <div key={item.title} className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                  <item.icon className="mb-4 size-6 text-amber-300" />
                  <h2 className="font-semibold">{item.title}</h2>
                  <p className="mt-2 text-sm text-slate-300">{item.copy}</p>
                </div>
              ))}
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-slate-950/40 p-6">
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
                  <div key={feature} className="flex items-center gap-3 rounded-2xl bg-white/5 px-4 py-3 text-sm text-slate-200">
                    <CheckCircle2 className="size-4 text-emerald-400" />
                    {feature}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
            <SignedOut>
              <div className="space-y-4 text-center">
                <h2 className="text-2xl font-bold">Sign in to start a Team workspace</h2>
                <p className="text-sm text-slate-300">
                  Billing is attached to your signed-in account and active organization.
                </p>
                <SignInButton mode="modal">
                  <Button
                    onClick={() => posthog.capture("upgrade_clicked", { source, payer: "organization" })}
                    className="w-full bg-amber-500 text-slate-950 hover:bg-amber-400"
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
                  <p className="text-sm text-slate-300">
                    Checking your organization memberships before we open checkout.
                  </p>
                </div>
              ) : !orgId && hasMemberships ? (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-2xl font-bold">Select a workspace first</h2>
                    <p className="mt-2 text-sm text-slate-300">
                      You already belong to at least one organization. Pick the workspace you want to bill before opening checkout.
                    </p>
                  </div>
                  <div className="rounded-3xl border border-white/10 bg-slate-950/50 p-4">
                    <OrganizationSwitcher />
                  </div>
                </div>
              ) : !orgId ? (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-2xl font-bold">Create a workspace first</h2>
                    <p className="mt-2 text-sm text-slate-300">
                      Clerk billing for organizations needs an active organization. Create one here, then return to pricing.
                    </p>
                  </div>
                  <div className="rounded-3xl border border-white/10 bg-slate-950/50 p-4">
                    <CreateOrganization />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-2xl font-bold">Start Team Plan</h2>
                    <p className="mt-2 text-sm text-slate-300">
                      Billing opens for your active organization. When checkout completes you will return to the app with team features enabled.
                    </p>
                  </div>
                  <div className="rounded-3xl border border-white/10 bg-slate-950/50 p-4">
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