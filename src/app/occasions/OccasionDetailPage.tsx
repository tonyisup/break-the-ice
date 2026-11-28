import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Compass,
  Copy,
  Flame,
  RefreshCw,
  Sun,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PublicFooter, PublicHeader } from "@/components/PublicChrome";
import { OccasionIcon } from "@/components/OccasionIcon";
import {
  OCCASIONS,
  describeSampleCard,
  getOccasionAppUrl,
  getOccasionBySlug,
  type OccasionConfig,
} from "@/config/occasions";
import { useTheme } from "@/hooks/useTheme";
import NotFoundPage from "@/app/not-found/page";

export default function OccasionDetailPage() {
  useTheme();
  const { slug } = useParams<{ slug: string }>();
  const occasion = getOccasionBySlug(slug);

  if (!occasion) {
    return <NotFoundPage />;
  }

  // Keyed by slug: moving to another occasion starts it fresh, at its first card.
  return <OccasionDetail key={occasion.slug} occasion={occasion} />;
}

function OccasionDetail({ occasion }: { occasion: OccasionConfig }) {
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // "Try another occasion" sits at the bottom of the page; open the next one at the top.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const appUrl = getOccasionAppUrl(occasion);
  const featured =
    occasion.sampleCards[featuredIndex % occasion.sampleCards.length];
  const featuredLabels = featured ? describeSampleCard(featured) : undefined;
  const relatedOccasions = OCCASIONS.filter(
    (item) => item.slug !== occasion.slug,
  ).slice(0, 4);

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(text);
      toast.success("Copied question to clipboard");
      window.setTimeout(() => {
        setCopiedText((current) => (current === text ? null : current));
      }, 2000);
    } catch {
      toast.error("Couldn’t copy to clipboard");
    }
  };

  return (
    <div className="landing-page deck-canvas relative isolate min-h-[100dvh] text-foreground flex flex-col">
      <PublicHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto w-full max-w-6xl px-5 py-12 md:px-10 md:py-16">
          <Link
            to="/occasions"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            All occasions
          </Link>

          <div className="mt-6 grid items-center gap-10 md:grid-cols-[1.08fr_0.92fr] lg:gap-14">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-foreground shadow-sm">
                <OccasionIcon
                  name={occasion.icon}
                  className="size-3.5"
                  style={{ color: occasion.accentColor }}
                  aria-hidden="true"
                />
                {occasion.name} deck
              </p>
              <h1 className="mt-5 text-[clamp(2.2rem,4.4vw,3.75rem)] font-extrabold leading-[1.08] tracking-[-0.035em] text-balance text-foreground">
                {occasion.heroHeading}
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
                {occasion.heroCopy}
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button
                  asChild
                  className="min-h-12 rounded-full px-7 text-base font-bold shadow-sm"
                >
                  <Link to={appUrl}>
                    Open {occasion.shortName} deck{" "}
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setFeaturedIndex(
                      (current) => (current + 1) % occasion.sampleCards.length,
                    )
                  }
                  className="min-h-12 rounded-full border-border bg-card px-5 text-base font-semibold"
                >
                  <RefreshCw className="size-4" aria-hidden="true" />
                  Draw another
                </Button>
              </div>
            </div>

            {featured && featuredLabels && (
              <div className="deck-card mx-auto w-full max-w-md overflow-hidden">
                <div
                  aria-hidden="true"
                  className="h-1.5 w-full"
                  style={{
                    background: `linear-gradient(90deg, ${featuredLabels.style.color}, ${featuredLabels.tone.color})`,
                  }}
                />
                <div className="flex flex-col justify-between p-5 sm:p-6">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-secondary/55 px-3 py-1.5 text-xs font-semibold text-foreground">
                      <Compass
                        className="size-3.5"
                        style={{ color: featuredLabels.style.color }}
                        aria-hidden="true"
                      />
                      {featuredLabels.style.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleCopy(featured.text)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
                      aria-label="Copy sample question"
                    >
                      {copiedText === featured.text ? (
                        <>
                          <Check
                            className="size-3.5 text-emerald-500"
                            aria-hidden="true"
                          />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="size-3.5" aria-hidden="true" />
                          Copy
                        </>
                      )}
                    </button>
                  </div>

                  <div className="flex min-h-[175px] flex-col items-center justify-center px-3 py-8 text-center">
                    <span className="mb-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold tracking-wide text-muted-foreground">
                      <Flame
                        className="size-3.5 text-primary"
                        aria-hidden="true"
                      />
                      {featuredLabels.topic.name}
                    </span>
                    <p className="text-xl font-bold leading-[1.32] tracking-[-0.02em] text-balance text-card-foreground sm:text-2xl">
                      {featured.text}
                    </p>
                  </div>

                  <div className="flex justify-end">
                    <span className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-secondary/55 px-3 py-1.5 text-xs font-semibold text-foreground">
                      <Sun
                        className="size-3.5"
                        style={{ color: featuredLabels.tone.color }}
                        aria-hidden="true"
                      />
                      {featuredLabels.tone.name}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Sample Cards Grid */}
        <section className="border-y border-border/70 bg-card/45 py-16 md:py-20">
          <div className="mx-auto w-full max-w-6xl px-5 md:px-10">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-2xl font-extrabold tracking-[-0.03em] md:text-3xl">
                  Sample {occasion.shortName} cards
                </h2>
                <p className="mt-2 text-sm text-muted-foreground md:text-base">
                  Steal one right now, or open the full deck for unlimited
                  scrolling and Remix.
                </p>
              </div>
              <Button
                asChild
                variant="outline"
                className="w-fit rounded-full border-border bg-card font-semibold"
              >
                <Link to={appUrl}>
                  See more in the deck{" "}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>

            <div className="mt-8 grid gap-5 md:grid-cols-2">
              {occasion.sampleCards.map((card) => {
                const labels = describeSampleCard(card);
                return (
                  <article
                    key={card.text}
                    className="deck-card flex flex-col justify-between overflow-hidden"
                  >
                    <div
                      aria-hidden="true"
                      className="h-1 w-full"
                      style={{
                        background: `linear-gradient(90deg, ${labels.style.color}, ${labels.tone.color})`,
                      }}
                    />
                    <div className="flex flex-1 flex-col justify-between p-6">
                      <div className="flex items-center justify-between gap-2 text-xs font-semibold text-muted-foreground">
                        <span>{labels.style.name}</span>
                        <span>{labels.tone.name}</span>
                      </div>
                      <p className="my-5 text-lg font-bold leading-snug tracking-[-0.015em] text-card-foreground">
                        {card.text}
                      </p>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-muted-foreground">
                          {labels.topic.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleCopy(card.text)}
                          aria-label={`Copy: ${card.text}`}
                          className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-secondary/50 px-3 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-secondary"
                        >
                          {copiedText === card.text ? (
                            <>
                              <Check
                                className="size-3.5 text-emerald-500"
                                aria-hidden="true"
                              />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="size-3.5" aria-hidden="true" />
                              Copy
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* Tips + Related Occasions */}
        <section className="mx-auto w-full max-w-6xl px-5 py-16 md:px-10 md:py-20">
          <div className="grid gap-10 md:grid-cols-2">
            <div className="deck-card p-6 sm:p-8">
              <h2 className="text-xl font-bold tracking-[-0.02em] text-card-foreground md:text-2xl">
                Tips for {occasion.shortName} prompts
              </h2>
              <ul className="mt-5 space-y-3.5 text-sm leading-relaxed text-muted-foreground md:text-base">
                {occasion.tips.map((tip) => (
                  <li key={tip} className="flex gap-3">
                    <span
                      aria-hidden="true"
                      className="mt-2 size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: occasion.accentColor }}
                    />
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="deck-card flex flex-col justify-between p-6 sm:p-8">
              <div>
                <h2 className="text-xl font-bold tracking-[-0.02em] text-card-foreground md:text-2xl">
                  Try another occasion
                </h2>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {relatedOccasions.map((related) => (
                    <Link
                      key={related.slug}
                      to={`/occasions/${related.slug}`}
                      className="flex items-center gap-2.5 rounded-2xl border border-border/80 bg-secondary/40 px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
                    >
                      <OccasionIcon
                        name={related.icon}
                        className="size-4 shrink-0"
                        style={{ color: related.accentColor }}
                        aria-hidden="true"
                      />
                      <span>{related.name}</span>
                    </Link>
                  ))}
                </div>
              </div>

              <div className="mt-6">
                <Button
                  asChild
                  className="w-full rounded-full min-h-11 font-bold sm:w-auto sm:px-6"
                >
                  <Link to={appUrl}>
                    Start scrolling {occasion.shortName}{" "}
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
