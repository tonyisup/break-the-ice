import { Link } from "react-router-dom";
import { ArrowRight, FolderKanban, Users, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const LandingPage = () => {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(245,158,11,0.12),_transparent_28%),linear-gradient(180deg,#08111f_0%,#101a2d_48%,#f5f0e8_48%,#f5f0e8_100%)] text-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="text-sm font-semibold uppercase tracking-[0.28em] text-amber-200/80">
          Break the Ice
        </div>
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" className="text-white hover:bg-white/10">
            <Link to="/app">Open app</Link>
          </Button>
          <Button asChild className="bg-amber-400 text-slate-950 hover:bg-amber-300">
            <Link to="/pricing?source=landing">
              Start Team Plan
              <ArrowRight className="ml-2 size-4" />
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-20 pt-10">
        <section className="grid gap-12 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div className="space-y-8">
            <div className="space-y-4">
              <p className="inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-100">
                Built for facilitators
              </p>
              <h1 className="max-w-4xl text-6xl font-black tracking-tight text-balance">
                Better question-of-the-day warmups, without the scramble.
              </h1>
              <p className="max-w-2xl text-lg text-slate-300">
                Break the Ice helps coaches, workshop facilitators, and team leads run better openers with shared collections and fast AI-assisted prompt generation.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="bg-amber-400 text-slate-950 hover:bg-amber-300">
                <Link to="/pricing?source=landing_hero">
                  Start Team Plan
                  <ArrowRight className="ml-2 size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10">
                <Link to="/app">Try the free app</Link>
              </Button>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl shadow-slate-950/40 backdrop-blur-xl">
            <div className="rounded-[1.5rem] bg-slate-950/60 p-6">
              <p className="text-sm uppercase tracking-[0.24em] text-amber-200/70">Why teams buy</p>
              <div className="mt-6 space-y-4">
                {[
                  {
                    icon: Users,
                    title: "Run a shared workspace",
                    copy: "Keep one prompt library for the people leading classes, workshops, or meetings.",
                  },
                  {
                    icon: FolderKanban,
                    title: "Save reusable collections",
                    copy: "Build sets for onboarding, community, retros, or warm-ups and bring them back instantly.",
                  },
                  {
                    icon: WandSparkles,
                    title: "Use AI when prep runs thin",
                    copy: "Generate more prompts when you need coverage, then keep the best ones in your library.",
                  },
                ].map((item) => (
                  <div key={item.title} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <item.icon className="size-5 text-amber-300" />
                    <h2 className="mt-3 font-semibold">{item.title}</h2>
                    <p className="mt-2 text-sm text-slate-300">{item.copy}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default LandingPage;
