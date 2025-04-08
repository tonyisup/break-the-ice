import { Button } from "~/components/ui/button";
import { ShuffleIcon, UndoIcon } from "lucide-react";
import type { Question } from "./types";
import type { CardAction } from "./hooks/useCardStack";

interface CardActionsProps {
  cards: Question[];
  cardHistory: Question[];
  isLoading: boolean;
  onCardAction: (id: string, action: CardAction) => void;
  onGoBack: () => void;
  onGetMore: () => void;
}

export function CardActions({
  cards,
  cardHistory,
  isLoading,
  onCardAction,
  onGoBack,
  onGetMore,
}: CardActionsProps) {
  if (cards.length === 0) {
    return (
      <div className="text-center">
        <p className="text-xl mb-4">No more questions!</p>
        <Button 
          onClick={onGetMore}
          disabled={isLoading}
          aria-label={isLoading ? "Loading more questions..." : "Get more questions"}
        >
          {isLoading ? "Loading..." : "Get More Questions"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex justify-center gap-8">
      <Button
        onClick={onGoBack}
        disabled={cardHistory.length === 0}
        aria-label={`Go back to previous card${cardHistory.length > 0 ? ` (${cardHistory.length} cards in history)` : ''}`}
      >
        <UndoIcon className="w-4 h-4" aria-hidden="true" />
        Previous
        {cardHistory.length > 0 && (
          <span className="ml-2 text-xs rounded-full px-2 py-0.5">
            {cardHistory.length}
          </span>
        )}
      </Button>
      <Button
        onClick={() => onCardAction(cards[0]?.id ?? "", 'skip')}
        aria-label="Skip current question"
      >
        <ShuffleIcon className="w-4 h-4" aria-hidden="true" />
        Random
      </Button>
    </div>
  );
} 