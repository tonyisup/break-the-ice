import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";

interface PlaceholderPageProps {
  title: string;
  children: React.ReactNode;
}

export const PlaceholderPage = ({ title, children }: PlaceholderPageProps) => {
  useTheme();
  return (
    <div className="app-shell px-5 py-10 sm:py-16">
      <main className="mx-auto max-w-2xl">
        <nav aria-label="Page navigation" className="mb-10 flex items-center justify-between text-sm font-semibold">
          <Link to="/" className="inline-flex min-h-11 items-center gap-2 rounded-md hover:underline">
            <ArrowLeft className="size-4" aria-hidden="true" /> Back home
          </Link>
          <Link to="/app" className="inline-flex min-h-11 items-center rounded-md hover:underline">Open the app</Link>
        </nav>
        <h1 className="mb-8 text-4xl font-extrabold tracking-tight">{title}</h1>
        <div className="public-page-content rounded-2xl border border-border bg-card p-6 leading-7 sm:p-8">{children}</div>
      </main>
    </div>
  );
};
