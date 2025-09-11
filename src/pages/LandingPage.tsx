import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function LandingPage() {
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const likedRaw = window.localStorage.getItem("likedQuestions");
      const historyRaw = window.localStorage.getItem("questionHistory");
      const liked = likedRaw ? JSON.parse(likedRaw) : [];
      const history = historyRaw ? JSON.parse(historyRaw) : [];
      const hasPriorData = (Array.isArray(liked) && liked.length > 0) || (Array.isArray(history) && history.length > 0);
      if (hasPriorData) {
        navigate("/app", { replace: true });
      }
    } catch (_err) {
      // If localStorage is corrupted, ignore and show the landing page
    }
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500">
      <div className="container mx-auto px-6 py-12">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/favicon.svg" alt="Logo" className="h-8 w-8" />
            <span className="text-white/90 text-lg font-semibold">Question Generator</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-white/80">
            <a className="hover:text-white transition-colors" href="/liked">Favorites</a>
            <a className="hover:text-white transition-colors" href="/history">History</a>
            <a className="hover:text-white transition-colors" href="/settings">Settings</a>
          </nav>
        </header>

        <main className="mt-16 md:mt-24 grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
          <section>
            <h1 className="text-4xl md:text-6xl font-extrabold text-white tracking-tight leading-tight">
              Spark better conversations in seconds
            </h1>
            <p className="mt-5 text-white/90 text-lg md:text-xl max-w-prose">
              Generate fun, thoughtful, and unique questions tailored by style and tone. Save your favorites and keep the best ones at hand.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <button
                onClick={() => navigate("/app")}
                className="inline-flex items-center justify-center rounded-lg bg-white text-indigo-700 font-semibold px-6 py-3 shadow-lg hover:shadow-xl transition-shadow"
              >
                Get Started
              </button>
              <a
                className="text-white/90 hover:text-white underline-offset-4 hover:underline"
                href="/liked"
              >
                View favorites
              </a>
            </div>
          </section>

          <section className="relative">
            <div className="rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 p-6 shadow-2xl">
              <div className="aspect-video w-full rounded-xl bg-gradient-to-br from-white/30 to-white/10 flex items-center justify-center text-white/90">
                <div className="text-center">
                  <div className="text-sm uppercase tracking-widest text-white/70">Preview</div>
                  <div className="mt-2 text-2xl font-semibold">Shuffle styles and tones</div>
                  <div className="mt-2 text-white/80">Swipe through and save your favorites</div>
                </div>
              </div>
              <ul className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3 text-white/90">
                <li className="rounded-lg bg-white/10 px-4 py-3">Would you rather</li>
                <li className="rounded-lg bg-white/10 px-4 py-3">Deep thinking</li>
                <li className="rounded-lg bg-white/10 px-4 py-3">Fun & silly</li>
                <li className="rounded-lg bg-white/10 px-4 py-3">Serious & reflective</li>
              </ul>
            </div>
          </section>
        </main>

        <footer className="mt-20 text-white/70 text-sm">
          Built with Convex, React, and Tailwind CSS
        </footer>
      </div>
    </div>
  );
}

