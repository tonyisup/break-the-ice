import { Button } from "@/components/ui/button";
import { SignInButton } from "@clerk/clerk-react";

interface SignInCTAProps {
  bgGradient?: [string, string];
  title: string;
  featureHighlight: {
    pre: string;
    highlight: string;
    post: string;
  };
}

export function SignInCTA({ bgGradient, title, featureHighlight }: SignInCTAProps) {
  const accent =
    bgGradient?.[0] && bgGradient?.[1]
      ? `linear-gradient(90deg, ${bgGradient[0]}, ${bgGradient[1]})`
      : undefined;

  return (
    <div className="deck-card mx-auto w-full max-w-md overflow-hidden">
      <div
        aria-hidden="true"
        className="h-1.5 w-full bg-primary"
        style={accent ? { background: accent } : undefined}
      />
      <div className="flex flex-col items-center gap-6 p-7 text-center sm:p-8">
        <div className="flex flex-col gap-2">
          <h3 className="text-xl font-bold tracking-[-0.02em] text-card-foreground sm:text-2xl">
            {title}
          </h3>
          <p className="text-base leading-relaxed text-muted-foreground">
            {featureHighlight.pre}{" "}
            <span className="font-bold text-primary">
              {featureHighlight.highlight}
            </span>{" "}
            {featureHighlight.post}
          </p>
        </div>
        <SignInButton mode="modal">
          <Button className="min-h-12 w-full rounded-full text-base font-bold shadow-sm">
            Sign In for Free
          </Button>
        </SignInButton>
      </div>
    </div>
  );
}
