import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { PACK_OFFER } from "../../convex/lib/packOffer";
import { Button } from "@/components/ui/button";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { captureAnalytics } from "@/lib/analytics";

interface PackOfferProps {
  /** Where the person ran out: the feed's limit card or the Remix panel. */
  surface: "feed" | "remix";
}

/**
 * Asks whether a person who ran out of AI generations would pay for more. Packs aren't on
 * sale: the button records the request and says so, then offers to tell them when they are.
 * The offer is an extra on the page it sits in, so if its data can't load (a backend that
 * doesn't have these functions yet, for one) it shows nothing instead of the page's error.
 */
export function PackOffer({ surface }: PackOfferProps) {
  return (
    <ErrorBoundary fallback={<></>}>
      <PackOfferContent surface={surface} />
    </ErrorBoundary>
  );
}

function PackOfferContent({ surface }: PackOfferProps) {
  const mine = useQuery(api.core.packInterest.getMine, {});
  const record = useMutation(api.core.packInterest.record);
  // What this visit did, shown at once without waiting for the saved answer.
  const [asked, setAsked] = useState(false);
  const [notice, setNotice] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const reportedShown = useRef(false);

  const loaded = mine !== undefined;
  const clicked = asked || !!mine?.clicked;
  const notify = notice === "saved" || !!mine?.notify;

  // Count the person as shown the offer once: in the database the first time ever, and in
  // analytics once per visit while the button is what they see.
  useEffect(() => {
    if (!mine || reportedShown.current) return;
    reportedShown.current = true;
    if (!mine.clicked) captureAnalytics("ai_limit_shown", { surface });
    if (!mine.shown) {
      void Promise.resolve(record({ offer: PACK_OFFER.id, surface, step: "shown" })).catch(() => {});
    }
  }, [mine, record, surface]);

  // Nothing until the saved answer is known, so a person who already asked never sees the
  // button again.
  if (!loaded) return null;

  const ask = () => {
    setAsked(true);
    captureAnalytics("pack_offer_clicked", { surface, offer: PACK_OFFER.id });
    // The reply doesn't depend on this save: a failed one only loses the count.
    void Promise.resolve(record({ offer: PACK_OFFER.id, surface, step: "asked" })).catch(() => {});
  };

  // This one is a promise to the person, so it is only confirmed once it is saved.
  const askForNotice = async () => {
    setNotice("saving");
    try {
      await record({ offer: PACK_OFFER.id, surface, step: "notify" });
      setNotice("saved");
      captureAnalytics("pack_notify_requested", { surface, offer: PACK_OFFER.id });
    } catch {
      setNotice("failed");
    }
  };

  // The feed's limit card is already a live region; the Remix panel has none of its own.
  return (
    <div
      role={surface === "remix" ? "status" : undefined}
      className="flex flex-col items-start gap-2 text-sm leading-relaxed text-muted-foreground"
    >
      {!clicked ? (
        <Button className="min-h-11 w-fit rounded-full px-5 font-semibold" onClick={ask}>
          Get {PACK_OFFER.generations} more for ${PACK_OFFER.priceUsd}
        </Button>
      ) : notify ? (
        <p>Thanks. We'll let you know when packs are on sale. Nothing was charged.</p>
      ) : (
        <>
          <p>
            Packs of {PACK_OFFER.generations} AI generations for ${PACK_OFFER.priceUsd} aren't on sale yet, and
            nothing was charged. Want to hear when they are?
          </p>
          <Button
            variant="outline"
            className="min-h-11 rounded-full bg-card px-5 font-semibold"
            disabled={notice === "saving"}
            onClick={() => void askForNotice()}
          >
            Tell me when they're ready
          </Button>
          {notice === "failed" && <p className="text-destructive">That didn't save. Try again.</p>}
        </>
      )}
    </div>
  );
}
