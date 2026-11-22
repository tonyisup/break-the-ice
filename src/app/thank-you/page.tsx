import { ArrowRight, CheckCircle2, Home } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/BrandMark";
import { siteConfig } from "@/config/site";
import { useTheme } from "@/hooks/useTheme";

export default function ThankYouPage() {
  useTheme();

  return (
    <div className="deck-canvas min-h-[100dvh] px-5 py-8 text-foreground sm:px-8">
      <header className="mx-auto flex w-full max-w-4xl items-center">
        <Link to="/" className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <BrandMark size="sm" labelClassName="text-base" />
        </Link>
      </header>

      <main className="mx-auto flex min-h-[calc(100dvh-7rem)] w-full max-w-4xl items-center py-12">
        <section className="deck-card w-full p-7 sm:p-12 lg:p-14">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <CheckCircle2 className="size-8" aria-hidden="true" />
          </div>
          <p className="mt-7 text-xs font-bold uppercase tracking-[0.18em] text-primary">
            Message received
          </p>
          <h1 className="mt-3 max-w-2xl text-[clamp(2.25rem,5.5vw,4rem)] font-extrabold leading-[1.06] tracking-[-0.04em] text-balance text-card-foreground">
            Thanks for reaching out.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Your message made it through. We’ll review it and reply from{" "}
            <a
              className="font-semibold text-primary underline decoration-2 underline-offset-4"
              href={`mailto:${siteConfig.supportEmail}`}
            >
              {siteConfig.supportEmail}
            </a>{" "}
            when a response is needed.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="min-h-12 rounded-full px-6 font-semibold">
              <Link to="/app">
                Find a question
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="min-h-12 rounded-full px-6 font-semibold">
              <Link to="/">
                <Home className="size-4" aria-hidden="true" />
                Back home
              </Link>
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
