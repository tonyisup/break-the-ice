import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/header";
import { useTheme } from "@/hooks/useTheme";

interface PlaceholderPageProps {
  title: string;
  children: React.ReactNode;
}

export const PlaceholderPage = ({ title, children }: PlaceholderPageProps) => {
  useTheme();

  return (
    <div className="deck-canvas min-h-screen text-foreground">
      <Header />
      <main className="mx-auto max-w-2xl px-4 pb-16 pt-[calc(var(--header-h,4rem)+2rem)] sm:px-6">
        <div className="mb-6">
          <div className="mb-4 flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild className="-ml-3 rounded-full text-muted-foreground hover:text-foreground">
              <Link to="/" className="flex items-center gap-1.5">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Home
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild className="rounded-full text-muted-foreground hover:text-foreground">
              <Link to="/app">Browse questions</Link>
            </Button>
          </div>
          <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-foreground">
            {title}
          </h1>
        </div>
        <article className="deck-card prose prose-neutral dark:prose-invert max-w-none p-6 sm:p-8">
          {children}
        </article>
      </main>
    </div>
  );
};
