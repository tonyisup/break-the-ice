import { toast } from "sonner";
import { Id } from "../../convex/_generated/dataModel";
import { useStorageContext } from "./useStorageContext";

/**
 * Hide a style or tone the same way on every page that shows question cards: the person
 * stays where they are, is told what happened, and can undo it from the toast.
 */
export function useHideTaxonomy() {
  const { addHiddenStyle, removeHiddenStyle, addHiddenTone, removeHiddenTone } = useStorageContext();
  return {
    hideStyle: (styleId: Id<"styles">) => {
      addHiddenStyle(styleId);
      toast.success("Style hidden. Questions in this style won't appear in your feed.", {
        action: { label: "Undo", onClick: () => removeHiddenStyle(styleId) },
      });
    },
    hideTone: (toneId: Id<"tones">) => {
      addHiddenTone(toneId);
      toast.success("Tone hidden. Questions in this tone won't appear in your feed.", {
        action: { label: "Undo", onClick: () => removeHiddenTone(toneId) },
      });
    },
  };
}
