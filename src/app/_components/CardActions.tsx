import { Button } from "~/components/ui/button";
import { TrashIcon, HeartIcon, RefreshCwIcon, LayoutListIcon, ListCheckIcon, EyeIcon } from "lucide-react";

import type { PreferenceAction } from "./hooks/useCardStack";
import type { Question } from "@prisma/client";

interface CardActionsProps {
  advancedMode: boolean;
  cards: Question[];
  likes: number[];
  skips: number[];
  isLoading: boolean;
  onCardAction: (id: number, action: PreferenceAction) => void;
  onGetMore: () => void;
  onReset: () => void;
  onManageSkips: () => void;
  onManageLikes: () => void;
  onInspectCard: () => void;
}

export function CardActions({
  advancedMode,
  cards,
  likes,
  skips,
  isLoading,
  onCardAction,
  onGetMore,
  onReset,
  onManageSkips,
  onManageLikes,
  onInspectCard,
}: CardActionsProps) {

  if (cards.length === 0) {
    return (
      <div className="text-center flex flex-col gap-8">
        <p className="text-xl mb-4">No more questions!</p>
        <Button
          onClick={onGetMore}
          disabled={isLoading}
          aria-label={isLoading ? "Loading more questions..." : "Get more questions"}
        >
          {isLoading ? "Loading..." : "Get More Questions"}
        </Button>
        {advancedMode && (<>
          <p>Getting questions will consider your skips and likes.</p>
          <div className="flex justify-center justify-around">

            <Button
              onClick={onManageSkips}
              disabled={skips.length === 0}
              aria-label={`Manage skips`}
            >
              <LayoutListIcon className="text-red-500" aria-hidden="true" />
              {skips.length}
            </Button>
            <Button
              onClick={onReset}
              disabled={skips.length === 0 && likes.length === 0}
              variant="outline"
              aria-label="reset card stack"
            >
              Reset
              <RefreshCwIcon className="text-red-500" aria-hidden="true" />
            </Button>

            <Button
              onClick={onManageLikes}
              disabled={likes.length === 0}
              aria-label={`Manage likes`}
            >
              {likes.length}
              <ListCheckIcon className="text-green-500" aria-hidden="true" />
            </Button>
          </div>
        </>
        )}
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

  if (!advancedMode) {
    return (
      <div className="flex flex-col gap-2">
        <Button onClick={handleSkip} aria-label="skip current question">
          Next
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">

      <div className="flex justify-center gap-4">

        <Button
          onClick={handleSkip}
          aria-label="skip current question"
        >
          <TrashIcon className="mr-2 text-red-500" aria-hidden="true" />
          Skip
        </Button>
        <Button
          onClick={onInspectCard}
          variant="outline"
          aria-label="inspect current question"
        >
          <EyeIcon className="mr-2 text-blue-500" aria-hidden="true" />
          Inspect
        </Button>
        <Button
          onClick={handleLike}
          variant="outline"
          aria-label="like current question"
        >
          <HeartIcon className="mr-2 text-green-500" aria-hidden="true" />
          Like
        </Button>
      </div>
      <div className="flex justify-center">

        <Button
          onClick={onManageSkips}
          disabled={skips.length === 0}
          aria-label={`Manage skips`}
        >
          <LayoutListIcon className="text-red-500" aria-hidden="true" />
          {skips.length}
        </Button>
        <Button
          onClick={onReset}
          disabled={skips.length === 0 && likes.length === 0}
          variant="outline"
          aria-label="reset card stack"
        >
          Reset
          <RefreshCwIcon className="text-red-500" aria-hidden="true" />
        </Button>
        <Button
          onClick={onManageLikes}
          disabled={likes.length === 0}
          aria-label={`Manage likes`}
        >
          {likes.length}
          <ListCheckIcon className="text-green-500" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
} 