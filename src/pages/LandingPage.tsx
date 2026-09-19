import { type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/useTheme";

const rooms = [
  {
    title: "Teams",
    copy: "Make the first five minutes feel less like waiting for everyone to arrive.",
    className: "md:col-span-7",
  },
  {
    title: "Classrooms",
    copy: "Start with a question every student can answer in their own way.",
    className: "md:col-span-5",
  },
  {
    title: "Dinner tables",
    copy: "Give the group somewhere better to go than the usual small talk.",
    className: "md:col-span-5",
  },
  {
    title: "Workshops",
    copy: "Set the tone before the agenda asks everyone to get serious.",
    className: "md:col-span-7",
  },
];

const reveal = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

const LandingPage = () => {
  useTheme();
  const reduceMotion = useReducedMotion();

  return (
    <div className="landing-page relative isolate min-h-[100dvh] text-gray-900 dark:text-white">
      <div aria-hidden="true" className="landing-backdrop pointer-events-none fixed inset-0 -z-10" />
      <LandingHeader />

      <main>
        <section className="mx-auto grid min-h-[calc(100dvh-4rem)] w-full max-w-[1400px] items-center gap-8 px-5 py-10 md:grid-cols-[1.04fr_0.96fr] md:px-10 lg:gap-14 lg:px-14 lg:py-12">
          <motion.div
            initial={reduceMotion ? false : "hidden"}
            animate="visible"
            variants={reveal}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-[760px]"
          >
            <h1 className="text-[clamp(2.75rem,4.8vw,5.5rem)] font-bold leading-[1.08] tracking-[-0.04em]">
              <span className="block lg:whitespace-nowrap">Good questions</span>
              <span className="block lg:whitespace-nowrap">change the room.</span>
            </h1>
            <p className="mt-7 max-w-[520px] text-lg leading-8 text-gray-700 dark:text-gray-300 md:text-xl">
              Find the question that gets everyone talking, thinking, and laughing together.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <PrimaryLink to="/app">Open a question</PrimaryLink>
            </div>
          </motion.div>

          <motion.div
            initial={reduceMotion ? false : { opacity: 0, scale: 0.96, rotate: 1.5 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ duration: 0.85, delay: reduceMotion ? 0 : 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="relative mx-auto w-full max-w-[540px] md:justify-self-end"
          >
            <div className="landing-card-frame overflow-hidden rounded-[30px] p-[3px]">
              <img
                src="/bti-dinner-party.webp"
                alt="Friends laughing together around a dinner table"
                className="aspect-[4/5] h-full w-full rounded-[27px] object-cover"
                fetchPriority="high"
              />
            </div>
          </motion.div>
        </section>

        <RevealSection className="mx-auto grid w-full max-w-[1400px] gap-8 px-5 py-20 md:grid-cols-[1.15fr_0.85fr] md:items-center md:px-10 md:py-28 lg:gap-16 lg:px-14">
          <div className="landing-card-frame overflow-hidden rounded-[30px] p-[3px]">
            <img
              src="/bti-table-cards.webp"
              alt="Friends choosing a conversation card around a table"
              className="aspect-[3/2] h-full w-full rounded-[27px] object-cover"
              loading="lazy"
            />
          </div>
          <div className="max-w-[520px] md:pl-2">
            <h2 className="text-4xl font-bold leading-[1.12] tracking-[-0.03em] text-balance md:text-5xl">
              Never run out of somewhere to go.
            </h2>
            <p className="mt-6 text-lg leading-8 text-gray-700 dark:text-gray-300">
              Browse by mood, save the good ones, and build collections for the people you bring together most.
            </p>
            <div className="mt-8">
              <PrimaryLink to="/app">Open a question</PrimaryLink>
            </div>
          </div>
        </RevealSection>

        <section className="border-y border-white/20 bg-white/10 backdrop-blur-md dark:border-white/10 dark:bg-black/10">
          <div className="mx-auto w-full max-w-[1400px] px-5 py-20 md:px-10 md:py-28 lg:px-14">
            <RevealSection className="max-w-[760px]">
              <h2 className="text-4xl font-bold leading-[1.12] tracking-[-0.03em] text-balance md:text-5xl">
                For every kind of room.
              </h2>
              <p className="mt-5 max-w-[600px] text-lg leading-8 text-gray-700 dark:text-gray-300">
                Pick a tone that fits the people, then let the conversation find its own shape.
              </p>
            </RevealSection>

            <div className="mt-14 grid gap-4 md:grid-cols-12">
              {rooms.map((room, index) => (
                <motion.article
                  key={room.title}
                  initial={reduceMotion ? false : "hidden"}
                  whileInView="visible"
                  viewport={{ once: true, amount: 0.25 }}
                  variants={reveal}
                  transition={{ duration: 0.55, delay: reduceMotion ? 0 : index * 0.06 }}
                  className={`${room.className} landing-card-frame rounded-[30px] p-[3px]`}
                >
                  <div className="flex h-full min-h-52 flex-col justify-end rounded-[27px] bg-white/95 p-6 dark:bg-gray-900/95 md:min-h-60 md:p-8">
                    <h3 className="text-2xl font-bold tracking-tight md:text-3xl">{room.title}</h3>
                    <p className="mt-3 max-w-[480px] text-base leading-7 text-gray-600 dark:text-gray-400">
                      {room.copy}
                    </p>
                  </div>
                </motion.article>
              ))}
            </div>
          </div>
        </section>

        <RevealSection className="mx-auto w-full max-w-[1400px] px-5 py-24 md:px-10 md:py-32 lg:px-14">
          <div className="grid gap-8 rounded-[30px] border border-white/20 bg-white/10 px-6 py-10 backdrop-blur-md md:grid-cols-[1fr_auto] md:items-center md:px-10 md:py-12 lg:px-14 lg:py-16">
            <h2 className="max-w-[820px] text-4xl font-bold leading-[1.12] tracking-[-0.03em] text-balance md:text-6xl">
              Skip the small talk.
            </h2>
            <PrimaryLink to="/app">Open a question</PrimaryLink>
          </div>
        </RevealSection>
      </main>

      <LandingFooter />
    </div>
  );
};

const LandingHeader = () => (
  <header className="sticky top-0 z-40 h-16 border-b border-white/10 bg-white/80 backdrop-blur-md dark:bg-gray-900/80 md:h-[72px]">
    <div className="mx-auto flex h-full max-w-[1400px] items-center justify-between gap-3 px-4 sm:gap-5 sm:px-5 md:px-10 lg:px-14">
      <Link to="/" className="flex shrink-0 items-center gap-2.5 rounded-md text-sm font-bold tracking-tight sm:text-base">
        <span className="flex size-8 items-center justify-center rounded-full bg-black/10 dark:bg-white/10" aria-hidden="true">
          <MessageCircle className="size-4" />
        </span>
        Break the Ice
      </Link>
      <nav className="hidden items-center gap-7 text-sm font-semibold md:flex" aria-label="Primary navigation">
        <Link className="transition-opacity hover:opacity-55" to="/app">Browse questions</Link>
        <Link className="transition-opacity hover:opacity-55" to="/pricing">For teams</Link>
      </nav>
      <Button asChild className="h-10 bg-black/10 px-3 text-xs dark:bg-white/10 sm:px-4 sm:text-sm">
        <Link to="/app">Open a question <ArrowRight aria-hidden="true" className="hidden sm:block" /></Link>
      </Button>
    </div>
  </header>
);

const RevealSection = ({ className = "", children }: { className?: string; children: ReactNode }) => {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? false : "hidden"}
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
      variants={reveal}
      transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

const PrimaryLink = ({ to, children }: { to: string; children: ReactNode }) => (
  <Button asChild className="min-h-14 rounded-full bg-gradient-to-r from-blue-600 to-purple-700 px-6 text-base font-bold text-white shadow-lg transition-transform hover:scale-[1.02] hover:from-blue-700 hover:to-purple-800 active:scale-[0.98] motion-reduce:transform-none">
    <Link to={to}>{children} <ArrowRight aria-hidden="true" /></Link>
  </Button>
);

const LandingFooter = () => (
  <footer className="border-t border-white/10 bg-white/5 backdrop-blur-md dark:bg-black/20">
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-5 py-8 text-sm md:flex-row md:items-center md:justify-between md:px-10 lg:px-14">
      <p className="font-bold">Break the Ice</p>
      <div className="flex flex-wrap gap-x-6 gap-y-3 text-gray-700 dark:text-gray-300">
        <Link className="hover:text-current" to="/about">About</Link>
        <Link className="hover:text-current" to="/contact">Contact</Link>
        <Link className="hover:text-current" to="/privacy">Privacy</Link>
        <Link className="hover:text-current" to="/terms">Terms</Link>
      </div>
      <p className="text-gray-700 dark:text-gray-300">Questions worth asking.</p>
    </div>
  </footer>
);

export default LandingPage;
