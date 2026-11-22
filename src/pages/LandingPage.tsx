import { useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, RefreshCw, Sparkles, Compass, Sun, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { BrandMark } from "@/components/BrandMark";
import { useTheme } from "@/hooks/useTheme";
import { siteConfig } from "@/config/site";

const rooms = [
  {
    title: "Events",
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

const sampleCards = [
  {
    style: "Story driven",
    styleColor: "#0E7490",
    tone: "Warm",
    toneColor: "#D97706",
    topic: "Everyday joy",
    text: "What small, ordinary routine in your week quietly makes everything else better?",
  },
  {
    style: "Would you rather",
    styleColor: "#7C3AED",
    tone: "Playful",
    toneColor: "#059669",
    topic: "Imagination",
    text: "Would you rather always know the best restaurant in any city or always get the best seat on every flight?",
  },
  {
    style: "Hot take",
    styleColor: "#E11D48",
    tone: "Curious",
    toneColor: "#2563EB",
    topic: "Culture",
    text: "What’s an everyday convenience you think people actually enjoyed more before it was automated?",
  },
  {
    style: "Reflective",
    styleColor: "#0F766E",
    tone: "Thoughtful",
    toneColor: "#4F46E5",
    topic: "Perspective",
    text: "What piece of advice sounded like a cliché until you lived through it yourself?",
  },
];

const reveal = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

const LandingPage = () => {
  useTheme();
  const reduceMotion = useReducedMotion();
  const [sampleIndex, setSampleIndex] = useState(0);
  const sample = sampleCards[sampleIndex];

  return (
    <div className="landing-page deck-canvas relative isolate min-h-[100dvh] text-foreground">
      <LandingHeader />

      <main>
        {/* Hero */}
        <section className="mx-auto grid min-h-[calc(100dvh-4.5rem)] w-full max-w-6xl items-center gap-10 px-5 py-12 md:grid-cols-[1.08fr_0.92fr] md:px-10 lg:gap-14 lg:py-16">
          <motion.div
            initial={reduceMotion ? false : "hidden"}
            animate="visible"
            variants={reveal}
            transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-xl"
          >
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-primary shadow-sm">
              <Sparkles className="size-3.5" aria-hidden="true" />
              A deck for better conversations
            </p>
            <h1 className="mt-5 text-[clamp(2.6rem,4.8vw,4.75rem)] font-extrabold leading-[1.06] tracking-[-0.04em] text-balance text-foreground">
              Good questions change the room.
            </h1>
            <p className="mt-6 max-w-[490px] text-lg leading-relaxed text-muted-foreground md:text-xl">
              Find the question that gets everyone talking, thinking, and laughing together—without scrambling five minutes before people arrive.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <PrimaryLink to="/app">Open the deck</PrimaryLink>
              <Button
                asChild
                variant="outline"
                className="min-h-12 rounded-full border-border bg-card px-6 text-base font-semibold"
              >
                <a href="#sample-deck">Try a sample card</a>
              </Button>
            </div>
          </motion.div>

          <motion.div
            initial={reduceMotion ? false : { opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.75, delay: reduceMotion ? 0 : 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="relative mx-auto w-full max-w-[480px] md:justify-self-end"
          >
            <div className="deck-card overflow-hidden p-2.5">
              <img
                src="/bti-dinner-party.webp"
                alt="Friends laughing together around a dinner table"
                className="aspect-[4/5] h-full w-full rounded-[20px] object-cover"
                fetchPriority="high"
              />
            </div>
          </motion.div>
        </section>

        {/* Interactive Sample Playing Card Section */}
        <section id="sample-deck" className="border-y border-border/70 bg-card/50 py-20 md:py-24">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 md:grid-cols-[0.95fr_1.05fr] md:px-10 lg:gap-16">
            <RevealSection className="max-w-md">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
                See what’s inside
              </p>
              <h2 className="mt-3 text-3xl font-extrabold leading-[1.12] tracking-[-0.03em] text-balance md:text-4xl">
                Every card shows its style and tone at a glance.
              </h2>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground md:text-lg">
                Like a playing card, the corners tell you what kind of prompt you’re about to ask. Filter by mood, save favorites, or remix any question to fit your group.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSampleIndex((i) => (i + 1) % sampleCards.length)}
                  className="min-h-11 rounded-full border-border bg-card px-5 font-semibold"
                >
                  <RefreshCw className="size-4" aria-hidden="true" />
                  Draw another
                </Button>
                <Button
                  asChild
                  variant="ghost"
                  className="min-h-11 rounded-full px-4 font-semibold text-primary hover:text-primary"
                >
                  <Link to="/app">
                    Browse full feed <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            </RevealSection>

            <RevealSection className="w-full">
              <div className="deck-card mx-auto w-full max-w-md overflow-hidden">
                <div
                  aria-hidden="true"
                  className="h-1.5 w-full"
                  style={{
                    background: `linear-gradient(90deg, ${sample.styleColor}, ${sample.toneColor})`,
                  }}
                />
                <div className="flex flex-col justify-between p-5 sm:p-6">
                  <div className="flex justify-start">
                    <span className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-secondary/55 px-3 py-1.5 text-xs font-semibold text-foreground">
                      <Compass className="size-3.5" style={{ color: sample.styleColor }} aria-hidden="true" />
                      {sample.style}
                    </span>
                  </div>
                  <div className="flex min-h-[175px] flex-col items-center justify-center px-3 py-8 text-center">
                    <span className="mb-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold tracking-wide text-muted-foreground">
                      <Flame className="size-3.5 text-primary" aria-hidden="true" />
                      {sample.topic}
                    </span>
                    <p className="text-xl font-bold leading-[1.32] tracking-[-0.02em] text-balance text-card-foreground sm:text-2xl">
                      {sample.text}
                    </p>
                  </div>
                  <div className="flex justify-end">
                    <span className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-secondary/55 px-3 py-1.5 text-xs font-semibold text-foreground">
                      <Sun className="size-3.5" style={{ color: sample.toneColor }} aria-hidden="true" />
                      {sample.tone}
                    </span>
                  </div>
                </div>
              </div>
            </RevealSection>
          </div>
        </section>

        {/* Feature section */}
        <RevealSection className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-20 md:grid-cols-[1.1fr_0.9fr] md:items-center md:px-10 md:py-28 lg:gap-16">
          <div className="deck-card overflow-hidden p-2.5">
            <img
              src="/bti-table-cards.webp"
              alt="Friends choosing a conversation card around a table"
              className="aspect-[3/2] h-full w-full rounded-[20px] object-cover"
              loading="lazy"
            />
          </div>
          <div className="max-w-lg">
            <h2 className="text-3xl font-extrabold leading-[1.12] tracking-[-0.03em] text-balance md:text-5xl">
              Never run out of somewhere to go.
            </h2>
            <p className="mt-5 text-base leading-relaxed text-muted-foreground md:text-lg">
              Browse by style, tone, or topic, hide what doesn’t fit your crowd, and save the keepers for the people you bring together most.
            </p>
            <div className="mt-7">
              <PrimaryLink to="/app">Explore questions</PrimaryLink>
            </div>
          </div>
        </RevealSection>

        {/* Rooms grid */}
        <section className="border-y border-border/70 bg-card/40">
          <div className="mx-auto w-full max-w-6xl px-5 py-20 md:px-10 md:py-28">
            <RevealSection className="max-w-2xl">
              <h2 className="text-3xl font-extrabold leading-[1.12] tracking-[-0.03em] text-balance md:text-5xl">
                For every kind of room.
              </h2>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
                Pick a tone that fits the people, then let the conversation find its own shape.
              </p>
            </RevealSection>

            <div className="mt-12 grid gap-4 md:grid-cols-12">
              {rooms.map((room, index) => (
                <motion.article
                  key={room.title}
                  initial={reduceMotion ? false : "hidden"}
                  whileInView="visible"
                  viewport={{ once: true, amount: 0.25 }}
                  variants={reveal}
                  transition={{ duration: 0.5, delay: reduceMotion ? 0 : index * 0.05 }}
                  className={`${room.className} deck-card flex min-h-48 flex-col justify-end p-6 md:min-h-56 md:p-8`}
                >
                  <h3 className="text-2xl font-bold tracking-[-0.02em] text-card-foreground md:text-3xl">
                    {room.title}
                  </h3>
                  <p className="mt-2.5 max-w-md text-base leading-relaxed text-muted-foreground">
                    {room.copy}
                  </p>
                </motion.article>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <RevealSection className="mx-auto w-full max-w-6xl px-5 py-20 md:px-10 md:py-28">
          <div className="deck-card grid gap-8 px-6 py-10 md:grid-cols-[1fr_auto] md:items-center md:px-12 md:py-14">
            <div>
              <h2 className="max-w-2xl text-3xl font-extrabold leading-[1.12] tracking-[-0.03em] text-balance md:text-5xl">
                Skip the small talk.
              </h2>
              <p className="mt-3 text-base text-muted-foreground md:text-lg">
                No account required to start browsing.
              </p>
            </div>
            <PrimaryLink to="/app">Draw a question</PrimaryLink>
          </div>
        </RevealSection>
      </main>

      <LandingFooter />
    </div>
  );
};

const LandingHeader = () => (
  <header className="sticky top-0 z-40 h-16 border-b border-border/80 bg-background/85 backdrop-blur-md md:h-[72px]">
    <div className="mx-auto flex h-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-5 md:px-10">
      <Link to="/" className="flex shrink-0 items-center rounded-xl">
        <BrandMark size="sm" labelClassName="text-sm sm:text-base" />
      </Link>
      <div className="flex items-center gap-2 sm:gap-4">
        <nav className="flex items-center gap-2 sm:gap-5 text-sm font-semibold" aria-label="Primary navigation">
          <Link className="rounded-full px-3 py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" to="/about">
            About
          </Link>
        </nav>
        <ThemeToggle className="h-10 w-10 rounded-full border-border bg-card p-0" labelClassName="sr-only" />
        <Button asChild className="h-10 rounded-full px-4 text-xs font-semibold sm:px-5 sm:text-sm">
          <Link to="/app">
            Open deck <ArrowRight aria-hidden="true" className="hidden sm:block" />
          </Link>
        </Button>
      </div>
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
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

const PrimaryLink = ({ to, children }: { to: string; children: ReactNode }) => (
  <Button
    asChild
    className="min-h-12 rounded-full px-7 text-base font-bold shadow-sm transition-transform hover:scale-[1.01] active:scale-[0.99] motion-reduce:transform-none"
  >
    <Link to={to}>
      {children} <ArrowRight aria-hidden="true" />
    </Link>
  </Button>
);

const LandingFooter = () => (
  <footer className="border-t border-border/80 bg-card/60">
    <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-8 text-sm md:flex-row md:items-center md:justify-between md:px-10">
      <BrandMark size="sm" labelClassName="text-sm" />
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-muted-foreground">
        <Link className="transition-colors hover:text-foreground" to="/about">About</Link>
        <Link className="transition-colors hover:text-foreground" to="/contact">Contact</Link>
        <Link className="transition-colors hover:text-foreground" to="/privacy">Privacy</Link>
        <Link className="transition-colors hover:text-foreground" to="/terms">Terms</Link>
      </div>
      <p className="text-muted-foreground">Questions worth asking.</p>
    </div>
  </footer>
);

export default LandingPage;
