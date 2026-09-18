import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export function RefineResultsCTA({ onDismiss }: { onDismiss: () => void }) {
  return (
    <aside className="promo-card">
      <h3 className="text-xl font-bold tracking-tight">Find questions that fit</h3>
      <p className="text-sm leading-6 text-muted-foreground">Choose which styles and tones appear in your feed.</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="outline" className="min-h-11"><Link to="/settings?expand=manage-styles,manage-tones">Edit preferences</Link></Button>
        <Button variant="ghost" onClick={onDismiss} className="min-h-11">Dismiss</Button>
      </div>
    </aside>
  );
}
