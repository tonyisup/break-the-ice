import { Button } from "~/components/ui/button";
import { TrashIcon, UndoIcon, HeartIcon, RedoIcon, RefreshCwIcon } from "lucide-react";
import type { Question } from "./types";
import type { CardAction } from "./hooks/useCardStack";

interface CardActionsProps {
  cards: Question[];
  likes: Question[];
  skips: Question[];
  isLoading: boolean;
  onCardAction: (id: string, action: CardAction) => void;
  onUndoSkip: () => void;
  onRedoLike: () => void;
  onGetMore: () => void;
  onReset: () => void;
}

export function CardActions({
  cards,
  likes,
  skips,
  isLoading,
  onCardAction,
  onUndoSkip,
  onRedoLike,
  onGetMore,
  onReset,
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

  const handleLike = () => {
    const currentCard = cards[0];
    if (!currentCard) return;
    onCardAction(currentCard.id, 'like');
  };

  const handleSkip = () => {
    const currentCard = cards[0];
    if (!currentCard) return;
    onCardAction(currentCard.id, 'skip');
  };

  return (
    <div className="flex flex-col gap-2">
      
      <div className="flex justify-center gap-4">
        
        <Button
          onClick={onUndoSkip}
          disabled={skips.length === 0}
          aria-label={`Restore last skipped card`}
        >
          <span className="text-xs rounded-full">
            {skips.length}
            <UndoIcon className="text-red-500" aria-hidden="true" />
          </span>
        </Button>
        
        <Button
          onClick={handleSkip}
          aria-label="skip current question"
        >
          <TrashIcon className="mr-2 text-red-500" aria-hidden="true" />
          Skip
        </Button>
        <Button
          onClick={handleLike}
          variant="outline"
          aria-label="like current question"
        >
          <HeartIcon className="mr-2 text-green-500" aria-hidden="true" />
          Like
        </Button>
        <Button
          onClick={onRedoLike}
          disabled={likes.length === 0}
          aria-label={`Restore last liked card`}
        >
          <span className="text-xs rounded-full">
            {likes.length}
            <RedoIcon className="text-green-500" aria-hidden="true" />
          </span>
        </Button>
      </div>
      <div className="flex justify-center">
        <Button
          onClick={onReset}
          variant="outline"
          aria-label="reset card stack"
        >
          Reset
          <RefreshCwIcon className="text-red-500" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
} 