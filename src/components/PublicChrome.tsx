import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { BrandMark } from "@/components/BrandMark";

export const PublicHeader = () => (
  <header className="sticky top-0 z-40 h-16 border-b border-border/80 bg-background/85 backdrop-blur-md md:h-[72px]">
    <div className="mx-auto flex h-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-5 md:px-10">
      <Link to="/" className="flex shrink-0 items-center rounded-xl">
        <BrandMark size="sm" labelClassName="text-sm sm:text-base" />
      </Link>
      <div className="flex items-center gap-2 sm:gap-4">
        <nav
          className="flex items-center gap-1 sm:gap-3 text-sm font-semibold"
          aria-label="Primary navigation"
        >
          <Link
            className="rounded-full px-3 py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            to="/occasions"
          >
            Occasions
          </Link>
          <Link
            className="hidden sm:inline-flex rounded-full px-3 py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            to="/about"
          >
            About
          </Link>
        </nav>
        <ThemeToggle
          className="h-10 w-10 rounded-full border-border bg-card p-0"
          labelClassName="sr-only"
        />
        <Button
          asChild
          className="h-10 rounded-full px-4 text-xs font-semibold sm:px-5 sm:text-sm"
        >
          <Link to="/app">
            Open deck <ArrowRight aria-hidden="true" className="hidden sm:block" />
          </Link>
        </Button>
      </div>
    </div>
  </header>
);

export const PublicFooter = () => (
  <footer className="border-t border-border/80 bg-card/60">
    <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-8 text-sm md:flex-row md:items-center md:justify-between md:px-10">
      <BrandMark size="sm" labelClassName="text-sm" />
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-muted-foreground">
        <Link className="transition-colors hover:text-foreground" to="/occasions">
          Occasions
        </Link>
        <Link className="transition-colors hover:text-foreground" to="/about">
          About
        </Link>
        <Link className="transition-colors hover:text-foreground" to="/contact">
          Contact
        </Link>
        <Link className="transition-colors hover:text-foreground" to="/privacy">
          Privacy
        </Link>
        <Link className="transition-colors hover:text-foreground" to="/terms">
          Terms
        </Link>
      </div>
      <p className="text-muted-foreground">Questions worth asking.</p>
    </div>
  </footer>
);
