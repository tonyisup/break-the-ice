import { Button } from "~/components/ui/button";

import type { PreferenceAction } from "./hooks/useCardStack";
import type { Question } from "@prisma/client";

interface CardActionsProps {
  cards: Question[];
  isLoading: boolean;
  onCardAction: (id: number, action: PreferenceAction) => void;
  onGetMore: () => void;
  onReset: () => void;
  onInspectCard: () => void;
}

export function CardActions({
  cards,
  onCardAction,
}: CardActionsProps) {

  const handleSkip = () => {
    const currentCard = cards[0];
    if (!currentCard) return;
    onCardAction(currentCard.id, 'skip');
  };

  return (
    <div className="flex justify-center  gap-2">
    <Button onClick={handleSkip} aria-label="skip current question">
      Next
    </Button>
  </div>
  );
} 