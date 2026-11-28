import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicFooter, PublicHeader } from "@/components/PublicChrome";
import { OccasionIcon } from "@/components/OccasionIcon";
import { OCCASIONS, getOccasionAppUrl } from "@/config/occasions";
import { useTheme } from "@/hooks/useTheme";

export default function OccasionsPage() {
  useTheme();

  // Links to this page sit mid-page and in the footer; open it at the top.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="landing-page deck-canvas relative isolate min-h-[100dvh] text-foreground flex flex-col">
      <PublicHeader />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-6xl px-5 py-14 md:px-10 md:py-20">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-primary shadow-sm">
              <Sparkles className="size-3.5" aria-hidden="true" />
              Browse by moment
            </p>
            <h1 className="mt-5 text-[clamp(2.2rem,4.5vw,3.75rem)] font-extrabold leading-[1.08] tracking-[-0.035em] text-balance text-foreground">
              Pick the occasion. Skip the small talk.
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
              Choose a curated deck matched to who you’re with—preview sample cards or jump straight into the infinite feed.
            </p>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {OCCASIONS.map((occasion) => {
              const preview = occasion.sampleCards[0];
              return (
                <article
                  key={occasion.slug}
                  className="deck-card flex flex-col justify-between overflow-hidden transition-transform duration-200 hover:-translate-y-0.5"
                >
                  <div
                    aria-hidden="true"
                    className="h-1.5 w-full"
                    style={{ backgroundColor: occasion.accentColor }}
                  />
                  <div className="flex flex-1 flex-col justify-between p-6">
                    <div>
                      <div className="flex items-center gap-3">
                        <span
                          className="inline-flex size-10 items-center justify-center rounded-2xl border border-border/80 bg-secondary/60"
                          style={{ color: occasion.accentColor }}
                        >
                          <OccasionIcon
                            name={occasion.icon}
                            className="size-5"
                            aria-hidden="true"
                          />
                        </span>
                        <h2 className="text-xl font-bold tracking-[-0.02em] text-card-foreground">
                          <Link
                            to={`/occasions/${occasion.slug}`}
                            className="hover:underline underline-offset-4"
                          >
                            {occasion.name}
                          </Link>
                        </h2>
                      </div>

                      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                        {occasion.tagline}
                      </p>

                      {preview && (
                        <blockquote className="mt-4 rounded-2xl border border-border/70 bg-secondary/40 px-4 py-3 text-sm font-medium leading-snug text-card-foreground">
                          “{preview.text}”
                        </blockquote>
                      )}
                    </div>

                    <div className="mt-6 flex flex-wrap items-center gap-2.5">
                      <Button asChild size="sm" className="rounded-full px-4 font-semibold">
                        <Link to={getOccasionAppUrl(occasion)}>
                          Open deck <ArrowRight className="size-3.5" aria-hidden="true" />
                        </Link>
                      </Button>
                      <Button
                        asChild
                        size="sm"
                        variant="ghost"
                        className="rounded-full px-3 font-semibold text-muted-foreground hover:text-foreground"
                      >
                        <Link to={`/occasions/${occasion.slug}`}>Sample cards</Link>
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
