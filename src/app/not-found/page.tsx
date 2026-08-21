import { ArrowRight, Home, SearchX } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function NotFoundPage() {
  return (
    <div className="min-h-[100dvh] bg-[#f4f2ed] px-5 py-8 text-[#181818] dark:bg-[#11110f] dark:text-[#f3f0e9] sm:px-8">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5 font-extrabold tracking-[-0.03em]">
          <span className="flex size-9 items-center justify-center rounded-2xl bg-[#ff4d2e] text-xl font-black" aria-hidden="true">
            ?
          </span>
          Break the Ice
        </Link>
      </header>

      <main className="mx-auto flex min-h-[calc(100dvh-7rem)] w-full max-w-5xl items-center py-16">
        <div className="grid w-full gap-10 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-sm font-extrabold uppercase tracking-[0.18em] text-[#1647ba] dark:text-[#8fb5ff]">
              Error 404
            </p>
            <h1 className="mt-5 max-w-3xl text-[clamp(3.4rem,9vw,7.5rem)] font-black leading-[0.85] tracking-[-0.075em]">
              This page slipped under the surface.
            </h1>
            <p className="mt-7 max-w-xl text-lg font-medium leading-8 text-[#5b5851] dark:text-[#bbb7ad]">
              The link may be outdated, or the page may have moved. Head home or open the app to find a fresh conversation starter.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="min-h-12 rounded-2xl bg-[#181818] px-6 text-[#f8f5ee] hover:bg-[#181818]/85 dark:bg-[#f3f0e9] dark:text-[#181818]">
                <Link to="/">
                  <Home className="mr-2 size-5" aria-hidden="true" />
                  Back home
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="min-h-12 rounded-2xl border-2 border-[#181818]/20 bg-transparent px-6 dark:border-white/20">
                <Link to="/app">
                  Open the app
                  <ArrowRight className="ml-2 size-5" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>

          <div className="hidden size-52 rotate-3 items-center justify-center rounded-[3rem] bg-[#1647ba] text-[#f8f5ee] shadow-[16px_18px_0_#ff4d2e] lg:flex" aria-hidden="true">
            <SearchX className="size-24" strokeWidth={1.5} />
          </div>
        </div>
      </main>
    </div>
  );
}
