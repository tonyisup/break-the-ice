import { Link } from "react-router-dom";
import {
  ArrowRight,
  FolderKanban,
  Library,
  MessageSquareQuote,
  Users,
  WandSparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/useTheme";

const benefits = [
  {
    icon: Users,
    title: "Shared team workspace",
    copy: "Give facilitators one place to save, reuse, and refine questions across groups.",
  },
  {
    icon: FolderKanban,
    title: "Reusable collections",
    copy: "Build sets for onboarding, retros, classrooms, and community moments.",
  },
  {
    icon: WandSparkles,
    title: "AI-assisted prep",
    copy: "Generate more options when the calendar is full and the warmup still matters.",
  },
];

const workflow = ["Choose a tone", "Filter by topic", "Save the best", "Share with the team"];

const stackQuestions = [
  "What is one assumption your team should revisit this month?",
  "What should this group make easier for the next person?",
  "What did you learn the hard way that others should not have to?",
];

const LandingPage = () => {
  useTheme();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingHeader />

      <main>
        <section className="relative isolate overflow-hidden border-b">
          <LibraryStackBackdrop />
          <div className="mx-auto grid min-h-[calc(100vh-65px)] w-full max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:py-20">
            <div className="relative z-10 space-y-7">
              <div className="space-y-4">
                <p className="inline-flex rounded-md border bg-background/90 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground shadow-sm">
                  Built for facilitator libraries
                </p>
                <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
                  Show the depth of the library without turning prep into a dashboard.
                </h1>
                <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
                  Break the Ice helps coaches, workshop facilitators, and team leads build a
                  reusable question library for the moments when a group needs to open up.
                </p>
              </div>

              <div className="inline-flex w-full flex-col gap-3 rounded-lg border bg-card/90 p-3 shadow-xl shadow-slate-950/10 backdrop-blur sm:w-auto sm:flex-row dark:shadow-black/30">
                <Button
                  asChild
                  size="lg"
                  className="h-12 px-6 text-base shadow-lg shadow-primary/25 ring-1 ring-primary/20"
                >
                  <Link to="/pricing?source=landing_library_stack">
                    Start Team Plan
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-12 border-primary/20 bg-background/80 px-6 text-base hover:bg-primary/5"
                >
                  <Link to="/app">Try the free app</Link>
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Start with the free app, then upgrade when your team needs shared collections.
              </p>

              <div className="space-y-3 lg:hidden">
                <div className="rounded-lg border bg-background p-5 shadow-sm">
                  <QuestionTile question={stackQuestions[0]} label="Leadership" />
                </div>
                <div className="rounded-lg border bg-background p-5 shadow-sm">
                  <QuestionTile question={stackQuestions[1]} label="Retrospective" />
                </div>
                <div className="rounded-lg border bg-background p-5 shadow-sm">
                  <QuestionTile question={stackQuestions[2]} label="Onboarding" />
                </div>
              </div>
            </div>

            <div
              className="relative z-10 hidden lg:block lg:min-h-[600px]"
              aria-hidden="true"
            />
          </div>
        </section>

        <section className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:py-20">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.16em] text-muted-foreground">
              How it works
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-balance">
              Keep the useful questions moving from session to session.
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {workflow.map((step, index) => (
              <div key={step} className="flex items-center gap-3 rounded-lg border bg-card p-4">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground">
                  {index + 1}
                </span>
                <span className="text-sm font-medium">{step}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t bg-muted/30">
          <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-14 sm:px-6 lg:grid-cols-3 lg:py-20">
            {benefits.map((benefit) => (
              <FeatureBlock key={benefit.title} {...benefit} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
};

const LandingHeader = () => (
  <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
    <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
      <Link to="/" className="flex items-center gap-2 text-sm font-semibold">
        <span className="flex size-8 items-center justify-center rounded-md border bg-card">
          <MessageSquareQuote className="size-4 text-primary" />
        </span>
        Break the Ice
      </Link>
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" className="hidden sm:inline-flex">
          <Link to="/app">Open app</Link>
        </Button>
        <Button asChild>
          <Link to="/pricing?source=landing">
            Start Team Plan
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
    </div>
  </header>
);

const LibraryStackBackdrop = () => (
  <div className="pointer-events-none absolute inset-0 z-0">
    <div className="absolute inset-y-0 right-0 hidden w-[58%] bg-[linear-gradient(90deg,transparent_0%,hsl(var(--muted))_100%)] lg:block" />
    <div className="absolute left-1/2 top-12 hidden w-[min(88vw,640px)] -translate-x-1/2 lg:left-auto lg:right-[max(2rem,calc((100vw-72rem)/2))] lg:top-16 lg:block lg:translate-x-0">
      <div className="relative h-[560px] sm:h-[600px]">
        <div className="absolute inset-x-0 top-0 rotate-[-3deg] rounded-lg border bg-background p-5 shadow-xl shadow-slate-950/10">
          <QuestionTile question={stackQuestions[0]} label="Leadership" />
        </div>
        <div className="absolute inset-x-6 top-40 rotate-[2deg] rounded-lg border bg-background p-5 shadow-xl shadow-slate-950/10">
          <QuestionTile question={stackQuestions[1]} label="Retrospective" />
        </div>
        <div className="absolute inset-x-12 top-80 rotate-[-1deg] rounded-lg border bg-background p-5 shadow-xl shadow-slate-950/10">
          <QuestionTile question={stackQuestions[2]} label="Onboarding" />
        </div>
      </div>
    </div>
  </div>
);

const QuestionTile = ({ question, label }: { question: string; label: string }) => (
  <div>
    <div className="mb-5 flex items-center justify-between gap-3">
      <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
        {label}
      </span>
      <Library className="size-4 text-primary" />
    </div>
    <p className="text-lg font-medium leading-7 sm:text-xl">{question}</p>
  </div>
);

const FeatureBlock = ({
  icon: Icon,
  title,
  copy,
}: {
  icon: typeof Users;
  title: string;
  copy: string;
}) => (
  <div className="rounded-lg border bg-card p-5">
    <Icon className="size-5 text-primary" />
    <h3 className="mt-5 font-medium">{title}</h3>
    <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy}</p>
  </div>
);

export default LandingPage;
