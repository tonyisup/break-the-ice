import { useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";
import "@fontsource-variable/manrope/index.css";
import { useTheme } from "@/hooks/useTheme";

const questions = [
  "What is something you believed as a kid that still makes you laugh?",
  "What tiny ritual makes an ordinary day feel better?",
  "Which opinion have you changed your mind about recently?",
  "What would your friends say is your most specific talent?",
];

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
    <div className="landing-page min-h-[100dvh] bg-[#f4f2ed] text-[#181818] dark:bg-[#11110f] dark:text-[#f3f0e9]">
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
            <h1 className="text-[clamp(3.25rem,4.8vw,5.5rem)] font-extrabold leading-[0.88] tracking-[-0.075em]">
              <span className="block lg:whitespace-nowrap">Good questions</span>
              <span className="block lg:whitespace-nowrap">change the room.</span>
            </h1>
            <p className="mt-7 max-w-[520px] text-lg font-medium leading-7 text-[#4f4d48] dark:text-[#bdb9b0] md:text-xl">
              Find the question that gets everyone talking, thinking, and laughing together.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <PrimaryLink to="/app">Open a question</PrimaryLink>
              <SecondaryLink to="#try-one">Try one here</SecondaryLink>
            </div>
          </motion.div>

          <motion.div
            initial={reduceMotion ? false : { opacity: 0, scale: 0.96, rotate: 1.5 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ duration: 0.85, delay: reduceMotion ? 0 : 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="relative mx-auto w-full max-w-[540px] md:justify-self-end"
          >
            <div className="overflow-hidden rounded-2xl bg-[#1647ba] shadow-[0_28px_80px_rgba(33,42,62,0.18)] dark:shadow-[0_28px_80px_rgba(0,0,0,0.4)]">
              <img
                src="/bti-dinner-party.webp"
                alt="Friends laughing together around a dinner table"
                className="aspect-[4/5] h-full w-full object-cover"
                fetchPriority="high"
              />
            </div>
          </motion.div>
        </section>

        <QuestionExperience />

        <RevealSection className="mx-auto grid w-full max-w-[1400px] gap-8 px-5 py-20 md:grid-cols-[1.15fr_0.85fr] md:items-center md:px-10 md:py-28 lg:gap-16 lg:px-14">
          <div className="overflow-hidden rounded-2xl bg-[#e9e5dd]">
            <img
              src="/bti-table-cards.webp"
              alt="Friends choosing a conversation card around a table"
              className="aspect-[3/2] h-full w-full object-cover"
              loading="lazy"
            />
          </div>
          <div className="max-w-[520px] md:pl-2">
            <h2 className="text-4xl font-extrabold leading-[0.98] tracking-[-0.05em] text-balance md:text-6xl">
              Never run out of somewhere to go.
            </h2>
            <p className="mt-6 text-lg leading-8 text-[#57544e] dark:text-[#bdb9b0]">
              Browse by mood, save the good ones, and build collections for the people you bring together most.
            </p>
            <Link
              to="/app"
              className="mt-8 inline-flex min-h-12 items-center rounded-2xl border-2 border-current px-5 text-sm font-bold transition-transform hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#ff4d2e]/35"
            >
              Open a question
            </Link>
          </div>
        </RevealSection>

        <section className="bg-[#1647ba] text-[#f8f5ee]">
          <div className="mx-auto w-full max-w-[1400px] px-5 py-20 md:px-10 md:py-28 lg:px-14">
            <RevealSection className="max-w-[760px]">
              <h2 className="text-4xl font-extrabold leading-[0.96] tracking-[-0.05em] text-balance md:text-6xl">
                For every kind of room.
              </h2>
              <p className="mt-5 max-w-[600px] text-lg leading-8 text-blue-100">
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
                  className={`${room.className} flex min-h-52 flex-col justify-end rounded-2xl border border-white/25 p-6 md:min-h-64 md:p-8 ${
                    index === 0
                      ? "bg-[#ff4d2e] text-[#191713]"
                      : index === 3
                        ? "bg-[#f4f2ed] text-[#181818]"
                        : "bg-[#113b9f]"
                  }`}
                >
                  <h3 className="text-3xl font-extrabold tracking-[-0.04em] md:text-4xl">{room.title}</h3>
                  <p className={`mt-3 max-w-[480px] text-base leading-7 ${index === 1 || index === 2 ? "text-blue-100" : "opacity-80"}`}>
                    {room.copy}
                  </p>
                </motion.article>
              ))}
            </div>
          </div>
        </section>

        <RevealSection className="mx-auto w-full max-w-[1400px] px-5 py-24 md:px-10 md:py-32 lg:px-14">
          <div className="grid gap-8 rounded-2xl bg-[#ff4d2e] px-6 py-10 text-[#181818] md:grid-cols-[1fr_auto] md:items-end md:px-10 md:py-12 lg:px-14 lg:py-16">
            <h2 className="max-w-[820px] text-5xl font-extrabold leading-[0.92] tracking-[-0.06em] text-balance md:text-7xl">
              Skip the small talk.
            </h2>
            <Link
              to="/app"
              className="inline-flex min-h-14 w-fit items-center rounded-2xl bg-[#181818] px-6 text-base font-bold text-[#f8f5ee] transition-transform hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#181818]/25"
            >
              Open a question
            </Link>
          </div>
        </RevealSection>
      </main>

      <LandingFooter />
    </div>
  );
};

const LandingHeader = () => (
  <header className="sticky top-0 z-40 h-16 border-b border-black/10 bg-[#f4f2ed]/92 backdrop-blur-xl dark:border-white/10 dark:bg-[#11110f]/92">
    <div className="mx-auto flex h-full max-w-[1400px] items-center justify-between gap-5 px-5 md:px-10 lg:px-14">
      <Link to="/" className="flex shrink-0 items-center gap-2.5 font-extrabold tracking-[-0.03em]">
        <span className="flex size-8 items-center justify-center rounded-2xl bg-[#ff4d2e] text-lg font-black text-[#181818]" aria-hidden="true">
          ?
        </span>
        Break the Ice
      </Link>
      <nav className="hidden items-center gap-7 text-sm font-semibold md:flex" aria-label="Primary navigation">
        <a className="transition-opacity hover:opacity-55" href="#try-one">Try one here</a>
        <Link className="transition-opacity hover:opacity-55" to="/pricing">For teams</Link>
      </nav>
      <Link
        to="/app"
        className="inline-flex min-h-10 items-center rounded-2xl bg-[#181818] px-4 text-sm font-bold text-[#f8f5ee] transition-transform hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#ff4d2e]/35 dark:bg-[#f3f0e9] dark:text-[#181818]"
      >
        Open a question
      </Link>
    </div>
  </header>
);

const QuestionExperience = () => {
  const [questionIndex, setQuestionIndex] = useState(0);
  const reduceMotion = useReducedMotion();

  const showNextQuestion = () => {
    setQuestionIndex((current) => (current + 1) % questions.length);
  };

  return (
    <section id="try-one" className="bg-[#ff4d2e] text-[#181818]">
      <div className="mx-auto grid w-full max-w-[1400px] gap-10 px-5 py-20 md:grid-cols-[0.7fr_1.3fr] md:items-center md:px-10 md:py-28 lg:gap-16 lg:px-14">
        <RevealSection>
          <p className="text-sm font-bold">Try one now</p>
          <h2 className="mt-4 text-4xl font-extrabold leading-[0.98] tracking-[-0.05em] text-balance md:text-6xl">
            One question. A completely different conversation.
          </h2>
        </RevealSection>

        <div className="rounded-2xl bg-[#f8f5ee] p-6 shadow-[0_24px_70px_rgba(68,22,14,0.18)] md:p-10">
          <div className="min-h-[190px] md:min-h-[220px]" aria-live="polite">
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={questionIndex}
                initial={reduceMotion ? false : { opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -12 }}
                transition={{ duration: reduceMotion ? 0 : 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="max-w-[760px] text-3xl font-extrabold leading-[1.05] tracking-[-0.04em] text-balance md:text-5xl"
              >
                {questions[questionIndex]}
              </motion.p>
            </AnimatePresence>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t-2 border-[#181818]/15 pt-5">
            <span className="text-sm font-bold tabular-nums">
              {String(questionIndex + 1).padStart(2, "0")} / {String(questions.length).padStart(2, "0")}
            </span>
            <button
              type="button"
              onClick={showNextQuestion}
              className="min-h-12 rounded-2xl bg-[#1647ba] px-5 text-sm font-bold text-white transition-transform hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#1647ba]/30"
            >
              Another question
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

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
  <Link
    to={to}
    className="inline-flex min-h-14 items-center justify-center rounded-2xl bg-[#ff4d2e] px-6 text-base font-bold text-[#181818] transition-transform hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#ff4d2e]/35"
  >
    {children}
  </Link>
);

const SecondaryLink = ({ to, children }: { to: string; children: ReactNode }) => (
  <a
    href={to}
    className="inline-flex min-h-14 items-center justify-center rounded-2xl border-2 border-current px-6 text-base font-bold transition-transform hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#ff4d2e]/35"
  >
    {children}
  </a>
);

const LandingFooter = () => (
  <footer className="border-t border-black/10 dark:border-white/10">
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-5 py-8 text-sm md:flex-row md:items-center md:justify-between md:px-10 lg:px-14">
      <p className="font-extrabold">Break the Ice</p>
      <div className="flex flex-wrap gap-x-6 gap-y-3 text-[#5d5a54] dark:text-[#bdb9b0]">
        <Link className="hover:text-current" to="/about">About</Link>
        <Link className="hover:text-current" to="/contact">Contact</Link>
        <Link className="hover:text-current" to="/privacy">Privacy</Link>
        <Link className="hover:text-current" to="/terms">Terms</Link>
      </div>
      <p className="text-[#5d5a54] dark:text-[#bdb9b0]">Questions worth asking.</p>
    </div>
  </footer>
);

export default LandingPage;
