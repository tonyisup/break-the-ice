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
import { useEffect, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, CheckCircle2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/useTheme";
import { usePlans } from "@clerk/clerk-react/experimental";
import { useConvex } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { captureAnalytics } from "@/lib/analytics";

const includedFeatures = [
  {
    title: "Shared collections",
    copy: "Build question sets once, then give every facilitator access.",
  },
  {
    title: "Team access",
    copy: "Invite collaborators without passing documents or links around.",
  },
  {
    title: "Scheduled prompts",
    copy: "Plan questions and topics before the session starts.",
  },
  {
    title: "More room to create",
    copy: "Use higher monthly AI limits when your library needs fresh options.",
  },
];

const reveal = {
  hidden: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0 },
};

export default function PricingPage() {
  useTheme();
  const reduceMotion = useReducedMotion();
  const { orgId } = useAuth();
  const { user, isLoaded } = useUser();
  const [searchParams] = useSearchParams();
  const source = searchParams.get("source") ?? "direct";
  const organizationMemberships = ((user as any)?.organizationMemberships ?? []) as unknown[];
  const hasMemberships = organizationMemberships.length > 0;

  useEffect(() => {
    captureAnalytics("pricing_viewed", { source });
  }, [source]);

  return (
    <div className="pricing-page relative isolate min-h-[100dvh] text-gray-900 dark:text-white">
      <div aria-hidden="true" className="pricing-backdrop pointer-events-none fixed inset-0 -z-10" />
      <PricingHeader />

      <main>
        <section className="mx-auto grid w-full max-w-[1400px] gap-10 px-5 py-12 md:px-10 md:py-20 lg:grid-cols-[0.9fr_1.1fr] lg:items-start lg:gap-16 lg:px-14">
          <motion.div
            initial={reduceMotion ? false : "hidden"}
            animate="visible"
            variants={reveal}
            transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
            className="min-w-0 lg:sticky lg:top-28"
          >
            <p className="inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold backdrop-blur-sm">Team plan</p>
            <h1 className="mt-5 max-w-[680px] text-[clamp(2.75rem,4.4vw,4.5rem)] font-bold leading-[1.08] tracking-[-0.04em] text-balance">
              <span className="block">One team.</span>
              <span className="block">Better questions.</span>
            </h1>
            <p className="mt-7 max-w-[590px] text-lg leading-8 text-gray-700 dark:text-gray-300 md:text-xl">
              Shared collections, scheduled prompts, and more room to create for everyone who leads the conversation.
            </p>

            <PublicPlanSummary />

            <div className="mt-9 grid gap-3 text-sm font-semibold sm:grid-cols-2">
              <div className="border-t border-gray-900/15 pt-3 dark:border-white/20">
                One plan for the whole workspace
              </div>
              <div className="border-t border-gray-900/15 pt-3 dark:border-white/20">
                Review every charge before confirming
              </div>
            </div>
          </motion.div>

          <motion.section
            initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.7, delay: reduceMotion ? 0 : 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="pricing-card-frame min-w-0 rounded-[30px] p-[3px]"
          >
            <div className="rounded-[27px] bg-white/95 p-5 dark:bg-gray-900/95 sm:p-8">
              <SignedOut>
                <CheckoutIntro source={source} />
              </SignedOut>

              <SignedIn>
                {!orgId && !isLoaded ? (
                  <CheckoutLoading />
                ) : !orgId && hasMemberships ? (
                  <CheckoutState
                    title="Choose the workspace to upgrade"
                    copy="Select the team that should own the plan. Everyone in that workspace will share its features."
                  >
                    <div className="mt-7 rounded-2xl border border-gray-900/10 bg-black/5 p-3 dark:border-white/10 dark:bg-white/5 sm:p-4">
                      <OrganizationSwitcher />
                    </div>
                  </CheckoutState>
                ) : !orgId ? (
                  <CheckoutState
                    title="Create your team workspace"
                    copy="Your Team plan belongs to a workspace. Create one now, then continue with the plan review."
                  >
                    <div className="mt-7 rounded-2xl border border-gray-900/10 bg-black/5 p-3 dark:border-white/10 dark:bg-white/5 sm:p-4">
                      <CreateOrganization />
                    </div>
                  </CheckoutState>
                ) : (
                  <CheckoutState
                    title="Review the Team plan"
                    copy="Check the full price, renewal terms, and included features before you confirm."
                  >
                    <div className="mt-7 rounded-2xl border border-gray-900/10 bg-black/5 p-2 dark:border-white/10 dark:bg-white/5 sm:p-5">
                      <PricingTable
                        for="organization"
                        collapseFeatures={false}
                        ctaPosition="bottom"
                        newSubscriptionRedirectUrl="/billing/success"
                      />
                    </div>
                  </CheckoutState>
                )}
              </SignedIn>
            </div>
          </motion.section>
        </section>

        <section className="mx-auto grid w-full max-w-[1400px] gap-6 px-5 pb-20 md:px-10 md:pb-28 lg:grid-cols-[0.88fr_1.12fr] lg:px-14">
          <RevealSection className="pricing-card-frame overflow-hidden rounded-[30px] p-[3px]">
            <img
              src="/bti-team-workshop.webp"
              alt="Facilitators reviewing conversation cards together in a workshop"
              className="aspect-[3/2] h-full min-h-[280px] w-full rounded-[27px] object-cover lg:aspect-auto"
              loading="lazy"
            />
          </RevealSection>

          <RevealSection className="rounded-[30px] border border-white/20 bg-white/10 px-6 py-9 backdrop-blur-md sm:px-9 sm:py-11">
            <h2 className="max-w-[650px] text-3xl font-bold leading-[1.12] tracking-[-0.03em] text-balance sm:text-4xl md:text-5xl">
              Everything your facilitators share.
            </h2>
            <div className="mt-9 grid gap-x-8 gap-y-7 sm:grid-cols-2">
              {includedFeatures.map((feature) => (
                <article key={feature.title} className="border-t border-gray-900/15 pt-4 dark:border-white/20">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-1 size-5 shrink-0 text-indigo-700 dark:text-indigo-300" aria-hidden="true" />
                    <div>
                      <h3 className="text-lg font-bold">{feature.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-gray-700 dark:text-gray-300">{feature.copy}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </RevealSection>
        </section>
      </main>

      <PricingFooter />
    </div>
  );
}

export const PublicPlanSummary = () => {
  const { data: plans, isLoading, isError, revalidate } = usePlans({ for: "organization", pageSize: 100 });
  const convex = useConvex();
  const [limits, setLimits] = useState<{ free: number; team: number; cycleDays: number } | null>(null);
  const [limitsError, setLimitsError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLimitsError(false);
    void convex.query(api.core.billing.getPublicPlanLimits, {}).then(value => {
      if (!cancelled) setLimits(value);
    }).catch(() => {
      if (!cancelled) setLimitsError(true);
    });
    return () => { cancelled = true; };
  }, [convex, retry]);

  const publicPlans = plans?.filter(plan => plan.publiclyVisible && !plan.isDefault);
  return (
    <div className="mt-8 space-y-4 rounded-2xl border border-white/20 bg-white/10 p-5 backdrop-blur-md" aria-label="Team pricing">
      {isLoading ? <p role="status">Loading current prices…</p> : isError || !publicPlans?.length ? (
        <div>
          <p role="status">Current prices are unavailable.</p>
          <Button onClick={() => { void revalidate().catch(() => undefined); }} className="mt-2">Retry prices</Button>
        </div>
      ) : publicPlans.map(plan => (
        <div key={plan.id}>
          <p className="text-sm font-semibold">{plan.name}</p>
          <p className="mt-1 text-3xl font-bold tracking-tight">
            {plan.fee.currencySymbol}{plan.fee.amountFormatted}
            <span className="ml-2 text-sm font-normal">{plan.fee.currency} / workspace{plan.isRecurring ? " / month" : " · one-time"}</span>
          </p>
          {plan.annualFee && (
            <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
              Or {plan.annualFee.currencySymbol}{plan.annualFee.amountFormatted} {plan.annualFee.currency} per workspace, billed annually.
            </p>
          )}
        </div>
      ))}
      {limits ? (
        <p className="text-sm leading-6 text-gray-700 dark:text-gray-300">
          Team includes {limits.team} AI requests per member in each workspace, per {limits.cycleDays}-day cycle. Free includes {limits.free} per person.
        </p>
      ) : limitsError ? (
        <div>
          <p className="text-sm">Couldn’t load the included AI allowance.</p>
          <Button onClick={() => setRetry(value => value + 1)} className="mt-2">Retry allowance</Button>
        </div>
      ) : <p className="text-sm" role="status">Loading included AI allowance…</p>}
    </div>
  );
};

const PricingHeader = () => (
  <header className="sticky top-0 z-40 h-16 border-b border-white/10 bg-white/80 backdrop-blur-md dark:bg-gray-900/80 md:h-[72px]">
    <div className="mx-auto flex h-full max-w-[1400px] items-center justify-between gap-3 px-4 sm:gap-5 sm:px-5 md:px-10 lg:px-14">
      <Link to="/" className="flex shrink-0 items-center gap-2.5 rounded-md text-sm font-bold tracking-tight sm:text-base">
        <span className="flex size-8 items-center justify-center rounded-full bg-black/10 dark:bg-white/10" aria-hidden="true">
          <MessageCircle className="size-4" />
        </span>
        Break the Ice
      </Link>
      <div className="flex items-center gap-5">
        <Link className="hidden text-sm font-semibold transition-opacity hover:opacity-55 sm:block" to="/">
          Home
        </Link>
        <Button asChild className="h-10 bg-black/10 px-3 text-xs dark:bg-white/10 sm:px-4 sm:text-sm">
          <Link to="/app">Open the app <ArrowRight aria-hidden="true" className="hidden sm:block" /></Link>
        </Button>
      </div>
    </div>
  </header>
);

const CheckoutIntro = ({ source }: { source: string }) => (
  <div>
    <h2 className="max-w-[620px] text-3xl font-bold leading-[1.12] tracking-[-0.03em] text-balance sm:text-4xl">
      Bring your question library together.
    </h2>
    <p className="mt-4 max-w-[590px] text-base leading-7 text-gray-600 dark:text-gray-400">
      Sign in to choose your workspace. You will see the full price and renewal terms before confirming anything.
    </p>

    <div className="mt-8 grid gap-5 border-y border-gray-900/10 py-6 text-sm dark:border-white/10 sm:grid-cols-3">
      <div>
        <p className="font-bold">Sign in</p>
        <p className="mt-1 leading-5 text-gray-600 dark:text-gray-400">Use your existing account.</p>
      </div>
      <div>
        <p className="font-bold">Choose workspace</p>
        <p className="mt-1 leading-5 text-gray-600 dark:text-gray-400">Select the team to upgrade.</p>
      </div>
      <div>
        <p className="font-bold">Review and confirm</p>
        <p className="mt-1 leading-5 text-gray-600 dark:text-gray-400">Check every detail first.</p>
      </div>
    </div>

    <SignInButton mode="modal">
      <Button
        type="button"
        onClick={() => captureAnalytics("upgrade_clicked", { source, payer: "organization" })}
        className="mt-7 min-h-14 w-full rounded-full bg-gradient-to-r from-blue-600 to-purple-700 px-6 text-base font-bold text-white shadow-lg transition-transform hover:scale-[1.02] hover:from-blue-700 hover:to-purple-800 active:scale-[0.98] motion-reduce:transform-none"
      >
        Sign in to continue
        <ArrowRight className="size-5" aria-hidden="true" />
      </Button>
    </SignInButton>
  </div>
);

const CheckoutState = ({
  title,
  copy,
  children,
}: {
  title: string;
  copy: string;
  children: ReactNode;
}) => (
  <div>
    <h2 className="text-3xl font-bold leading-[1.12] tracking-[-0.03em] text-balance sm:text-4xl">
      {title}
    </h2>
    <p className="mt-4 max-w-[590px] text-base leading-7 text-gray-600 dark:text-gray-400">{copy}</p>
    {children}
  </div>
);

const CheckoutLoading = () => (
  <div aria-live="polite" aria-busy="true">
    <span className="sr-only">Loading your workspaces</span>
    <div className="h-4 w-24 rounded-2xl bg-indigo-500/25 motion-safe:animate-pulse" />
    <div className="mt-5 h-10 w-3/4 rounded-2xl bg-black/10 motion-safe:animate-pulse dark:bg-white/10" />
    <div className="mt-4 h-5 w-full rounded-2xl bg-black/10 motion-safe:animate-pulse dark:bg-white/10" />
    <div className="mt-2 h-5 w-4/5 rounded-2xl bg-black/10 motion-safe:animate-pulse dark:bg-white/10" />
    <div className="mt-8 h-32 rounded-2xl bg-black/10 motion-safe:animate-pulse dark:bg-white/10" />
  </div>
);

const RevealSection = ({ className = "", children }: { className?: string; children: ReactNode }) => {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? false : "hidden"}
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
      variants={reveal}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

const PricingFooter = () => (
  <footer className="border-t border-white/10 bg-white/5 backdrop-blur-md dark:bg-black/20">
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-5 py-8 text-sm md:flex-row md:items-center md:justify-between md:px-10 lg:px-14">
      <p className="font-bold">Break the Ice</p>
      <div className="flex flex-wrap gap-x-6 gap-y-3 text-gray-700 dark:text-gray-300">
        <Link className="transition-opacity hover:opacity-60" to="/contact">Contact</Link>
        <Link className="transition-opacity hover:opacity-60" to="/privacy">Privacy</Link>
        <Link className="transition-opacity hover:opacity-60" to="/terms">Terms</Link>
      </div>
      <p className="text-gray-700 dark:text-gray-300">Questions worth sharing.</p>
    </div>
  </footer>
);
