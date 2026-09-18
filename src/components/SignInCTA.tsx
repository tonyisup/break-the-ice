import { Button } from "@/components/ui/button";
import { SignInButton } from "@clerk/clerk-react";

interface SignInCTAProps {
  title: string;
  featureHighlight: { pre: string; highlight: string; post: string };
}

export function SignInCTA({ title, featureHighlight }: SignInCTAProps) {
  return (
    <aside className="promo-card">
      <h3 className="text-xl font-bold tracking-tight">{title}</h3>
      <p className="text-sm leading-6 text-muted-foreground">
        {featureHighlight.pre} <strong className="font-semibold text-foreground">{featureHighlight.highlight}</strong> {featureHighlight.post}
      </p>
      <SignInButton mode="modal">
        <Button variant="default" className="min-h-11 self-start">Sign in for free</Button>
      </SignInButton>
    </aside>
  );
}
