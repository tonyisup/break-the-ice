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
import { useEffect, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Link, useSearchParams } from "react-router-dom";
import posthog from "posthog-js";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import "@fontsource-variable/manrope/index.css";
import { useTheme } from "@/hooks/useTheme";

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
    posthog.capture("pricing_viewed", { source });
  }, [source]);

  return (
    <div className="pricing-page min-h-[100dvh] bg-[#f4f2ed] text-[#181818] dark:bg-[#11110f] dark:text-[#f3f0e9]">
      <PricingHeader />

      <main>
        <section className="mx-auto grid w-full max-w-[1400px] gap-10 px-5 py-12 md:px-10 md:py-20 lg:grid-cols-[0.9fr_1.1fr] lg:items-start lg:gap-16 lg:px-14">
          <motion.div
            initial={reduceMotion ? false : "hidden"}
            animate="visible"
            variants={reveal}
            transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
            className="lg:sticky lg:top-28"
          >
            <p className="text-sm font-bold">Team plan</p>
            <h1 className="mt-4 max-w-[680px] text-[clamp(2.75rem,5vw,5.5rem)] font-extrabold leading-[0.9] tracking-[-0.07em]">
              <span className="block sm:whitespace-nowrap">One team.</span>
              <span className="block sm:whitespace-nowrap">Better questions.</span>
            </h1>
            <p className="mt-7 max-w-[590px] text-lg font-medium leading-8 text-[#55524c] dark:text-[#bdb9b0] md:text-xl">
              Shared collections, scheduled prompts, and more room to create for everyone who leads the conversation.
            </p>

            <div className="mt-9 grid gap-3 text-sm font-semibold sm:grid-cols-2">
              <div className="border-t-2 border-[#181818]/20 pt-3 dark:border-white/20">
                One plan for the whole workspace
              </div>
              <div className="border-t-2 border-[#181818]/20 pt-3 dark:border-white/20">
                Review every charge before confirming
              </div>
            </div>
          </motion.div>

          <motion.section
            initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.7, delay: reduceMotion ? 0 : 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-2xl bg-[#ffffff] p-5 shadow-[0_24px_80px_rgba(28,27,23,0.12)] dark:bg-[#1a1a17] dark:shadow-[0_24px_80px_rgba(0,0,0,0.35)] sm:p-8"
          >
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
                  <div className="mt-7 rounded-2xl border-2 border-[#181818]/10 bg-[#f4f2ed] p-4 dark:border-white/10 dark:bg-[#11110f]">
                    <OrganizationSwitcher />
                  </div>
                </CheckoutState>
              ) : !orgId ? (
                <CheckoutState
                  title="Create your team workspace"
                  copy="Your Team plan belongs to a workspace. Create one now, then continue with the plan review."
                >
                  <div className="mt-7 rounded-2xl border-2 border-[#181818]/10 bg-[#f4f2ed] p-4 dark:border-white/10 dark:bg-[#11110f]">
                    <CreateOrganization />
                  </div>
                </CheckoutState>
              ) : (
                <CheckoutState
                  title="Review the Team plan"
                  copy="Check the full price, renewal terms, and included features before you confirm."
                >
                  <div className="mt-7 rounded-2xl border-2 border-[#181818]/10 bg-[#f4f2ed] p-3 dark:border-white/10 dark:bg-[#11110f] sm:p-5">
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
          </motion.section>
        </section>

        <section className="mx-auto grid w-full max-w-[1400px] gap-6 px-5 pb-20 md:px-10 md:pb-28 lg:grid-cols-[0.88fr_1.12fr] lg:px-14">
          <RevealSection className="overflow-hidden rounded-2xl bg-[#1647ba]">
            <img
              src="/bti-team-workshop.webp"
              alt="Facilitators reviewing conversation cards together in a workshop"
              className="aspect-[3/2] h-full min-h-[320px] w-full object-cover lg:aspect-auto"
              loading="lazy"
            />
          </RevealSection>

          <RevealSection className="rounded-2xl bg-[#1647ba] px-6 py-9 text-[#f8f5ee] sm:px-9 sm:py-11">
            <h2 className="max-w-[650px] text-4xl font-extrabold leading-[0.96] tracking-[-0.05em] text-balance md:text-5xl">
              Everything your facilitators share.
            </h2>
            <div className="mt-9 grid gap-x-8 gap-y-7 sm:grid-cols-2">
              {includedFeatures.map((feature) => (
                <article key={feature.title} className="border-t border-white/30 pt-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-1 size-5 shrink-0 text-[#ff6a4d]" aria-hidden="true" />
                    <div>
                      <h3 className="text-lg font-extrabold">{feature.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-blue-100">{feature.copy}</p>
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

const PricingHeader = () => (
  <header className="sticky top-0 z-40 h-16 border-b border-black/10 bg-[#f4f2ed]/92 backdrop-blur-xl dark:border-white/10 dark:bg-[#11110f]/92">
    <div className="mx-auto flex h-full max-w-[1400px] items-center justify-between gap-5 px-5 md:px-10 lg:px-14">
      <Link to="/" className="flex shrink-0 items-center gap-2.5 font-extrabold tracking-[-0.03em]">
        <span className="flex size-8 items-center justify-center rounded-2xl bg-[#ff4d2e] text-lg font-black text-[#181818]" aria-hidden="true">
          ?
        </span>
        Break the Ice
      </Link>
      <div className="flex items-center gap-5">
        <Link className="hidden text-sm font-semibold transition-opacity hover:opacity-55 sm:block" to="/">
          Home
        </Link>
        <Link
          to="/app"
          className="inline-flex min-h-10 items-center rounded-2xl bg-[#181818] px-4 text-sm font-bold text-[#f8f5ee] transition-transform hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#ff4d2e]/35 dark:bg-[#f3f0e9] dark:text-[#181818]"
        >
          Open the app
        </Link>
      </div>
    </div>
  </header>
);

const CheckoutIntro = ({ source }: { source: string }) => (
  <div>
    <h2 className="max-w-[620px] text-3xl font-extrabold leading-[1] tracking-[-0.045em] text-balance sm:text-4xl">
      Bring your question library together.
    </h2>
    <p className="mt-4 max-w-[590px] text-base leading-7 text-[#5a5751] dark:text-[#bdb9b0]">
      Sign in to choose your workspace. You will see the full price and renewal terms before confirming anything.
    </p>

    <div className="mt-8 grid gap-5 border-y-2 border-[#181818]/10 py-6 text-sm dark:border-white/10 sm:grid-cols-3">
      <div>
        <p className="font-extrabold">Sign in</p>
        <p className="mt-1 leading-5 text-[#6a665f] dark:text-[#aaa69e]">Use your existing account.</p>
      </div>
      <div>
        <p className="font-extrabold">Choose workspace</p>
        <p className="mt-1 leading-5 text-[#6a665f] dark:text-[#aaa69e]">Select the team to upgrade.</p>
      </div>
      <div>
        <p className="font-extrabold">Review and confirm</p>
        <p className="mt-1 leading-5 text-[#6a665f] dark:text-[#aaa69e]">Check every detail first.</p>
      </div>
    </div>

    <SignInButton mode="modal">
      <button
        type="button"
        onClick={() => posthog.capture("upgrade_clicked", { source, payer: "organization" })}
        className="mt-7 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#ff4d2e] px-6 text-base font-extrabold text-[#181818] transition-transform hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#ff4d2e]/35"
      >
        Sign in to continue
        <ArrowRight className="size-5" aria-hidden="true" />
      </button>
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
    <h2 className="text-3xl font-extrabold leading-[1] tracking-[-0.045em] text-balance sm:text-4xl">
      {title}
    </h2>
    <p className="mt-4 max-w-[590px] text-base leading-7 text-[#5a5751] dark:text-[#bdb9b0]">{copy}</p>
    {children}
  </div>
);

const CheckoutLoading = () => (
  <div aria-live="polite" aria-busy="true">
    <span className="sr-only">Loading your workspaces</span>
    <div className="h-4 w-24 rounded-2xl bg-[#ff4d2e]/35 motion-safe:animate-pulse" />
    <div className="mt-5 h-10 w-3/4 rounded-2xl bg-[#181818]/10 motion-safe:animate-pulse dark:bg-white/10" />
    <div className="mt-4 h-5 w-full rounded-2xl bg-[#181818]/10 motion-safe:animate-pulse dark:bg-white/10" />
    <div className="mt-2 h-5 w-4/5 rounded-2xl bg-[#181818]/10 motion-safe:animate-pulse dark:bg-white/10" />
    <div className="mt-8 h-32 rounded-2xl bg-[#181818]/10 motion-safe:animate-pulse dark:bg-white/10" />
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
  <footer className="border-t border-black/10 dark:border-white/10">
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-5 py-8 text-sm md:flex-row md:items-center md:justify-between md:px-10 lg:px-14">
      <p className="font-extrabold">Break the Ice</p>
      <div className="flex flex-wrap gap-x-6 gap-y-3 text-[#5d5a54] dark:text-[#bdb9b0]">
        <Link className="transition-opacity hover:opacity-60" to="/contact">Contact</Link>
        <Link className="transition-opacity hover:opacity-60" to="/privacy">Privacy</Link>
        <Link className="transition-opacity hover:opacity-60" to="/terms">Terms</Link>
      </div>
      <p className="text-[#5d5a54] dark:text-[#bdb9b0]">Questions worth sharing.</p>
    </div>
  </footer>
);
