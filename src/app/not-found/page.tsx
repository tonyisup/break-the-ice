import { ArrowRight, Home, SearchX } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/BrandMark";
import { useTheme } from "@/hooks/useTheme";

export default function NotFoundPage() {
  useTheme();

  return (
    <div className="deck-canvas min-h-[100dvh] px-5 py-8 text-foreground sm:px-8">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between">
        <Link to="/" className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <BrandMark size="sm" labelClassName="text-base" />
        </Link>
      </header>

      <main className="mx-auto flex min-h-[calc(100dvh-7rem)] w-full max-w-5xl items-center py-12">
        <section className="deck-card grid w-full gap-10 p-7 sm:p-12 lg:grid-cols-[1fr_auto] lg:items-center lg:p-14">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
              Error 404
            </p>
            <h1 className="mt-4 max-w-2xl text-[clamp(2.4rem,6vw,4.5rem)] font-extrabold leading-[1.04] tracking-[-0.04em] text-balance text-card-foreground">
              This page slipped under the surface.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              The link may be outdated, or the page may have moved. Head home or open the app to find a fresh conversation starter.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="min-h-12 rounded-full px-6 font-semibold">
                <Link to="/">
                  <Home className="size-4" aria-hidden="true" />
                  Back home
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="min-h-12 rounded-full px-6 font-semibold">
                <Link to="/app">
                  Open the app
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>

          <div
            className="hidden size-40 items-center justify-center rounded-3xl border border-border bg-secondary/70 text-primary lg:flex"
            aria-hidden="true"
          >
            <SearchX className="size-16" strokeWidth={1.6} />
          </div>
        </section>
      </main>
    </div>
  );
}
