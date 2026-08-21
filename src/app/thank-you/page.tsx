import { ArrowRight, CheckCircle2, Home } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";

export default function ThankYouPage() {
  return (
    <div className="min-h-[100dvh] bg-[#f4f2ed] px-5 py-8 text-[#181818] dark:bg-[#11110f] dark:text-[#f3f0e9] sm:px-8">
      <header className="mx-auto flex w-full max-w-4xl items-center">
        <Link to="/" className="flex items-center gap-2.5 font-extrabold tracking-[-0.03em]">
          <span className="flex size-9 items-center justify-center rounded-2xl bg-[#ff4d2e] text-xl font-black" aria-hidden="true">
            ?
          </span>
          Break the Ice
        </Link>
      </header>

      <main className="mx-auto flex min-h-[calc(100dvh-7rem)] w-full max-w-4xl items-center py-16">
        <section className="w-full rounded-[2.5rem] border-2 border-[#181818]/10 bg-white p-7 shadow-[0_30px_100px_rgba(28,27,23,0.12)] dark:border-white/10 dark:bg-[#1a1a17] sm:p-12 lg:p-16">
          <div className="flex size-16 items-center justify-center rounded-3xl bg-[#1647ba] text-white">
            <CheckCircle2 className="size-9" aria-hidden="true" />
          </div>
          <p className="mt-8 text-sm font-extrabold uppercase tracking-[0.18em] text-[#1647ba] dark:text-[#8fb5ff]">
            Message received
          </p>
          <h1 className="mt-4 max-w-3xl text-[clamp(3rem,7vw,6rem)] font-black leading-[0.88] tracking-[-0.07em]">
            Thanks for reaching out.
          </h1>
          <p className="mt-7 max-w-2xl text-lg font-medium leading-8 text-[#5b5851] dark:text-[#bbb7ad]">
            Your message made it through. We’ll review it and reply from{" "}
            <a className="font-bold text-[#1647ba] underline decoration-2 underline-offset-4 dark:text-[#8fb5ff]" href={`mailto:${siteConfig.supportEmail}`}>
              {siteConfig.supportEmail}
            </a>
            {" "}when a response is needed.
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="min-h-12 rounded-2xl bg-[#181818] px-6 text-[#f8f5ee] hover:bg-[#181818]/85 dark:bg-[#f3f0e9] dark:text-[#181818]">
              <Link to="/app">
                Find a question
                <ArrowRight className="ml-2 size-5" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="min-h-12 rounded-2xl border-2 border-[#181818]/20 bg-transparent px-6 dark:border-white/20">
              <Link to="/">
                <Home className="mr-2 size-5" aria-hidden="true" />
                Back home
              </Link>
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
