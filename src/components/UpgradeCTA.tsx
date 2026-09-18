import { Button } from "@/components/ui/button";

interface UpgradeCTAProps {
  title: string;
  description: string;
  isTeam?: boolean;
  onUpgrade?: () => void;
}

export function UpgradeCTA({ title, description, isTeam, onUpgrade }: UpgradeCTAProps) {
  return (
    <aside className="promo-card">
      <h3 className="text-xl font-bold tracking-tight">{title}</h3>
      <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      {isTeam ? (
        <p className="text-sm text-muted-foreground">You can still use your saved questions. AI generation becomes available again when your usage cycle resets.</p>
      ) : (
        <>
          <p className="text-sm leading-6 text-muted-foreground">The Team plan includes shared collections, invitations, and a larger AI allowance.</p>
          <Button onClick={onUpgrade} variant="default" className="min-h-11 self-start">View Team pricing</Button>
        </>
      )}
    </aside>
  );
}
