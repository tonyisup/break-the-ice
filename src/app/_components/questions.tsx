"use client";

import { useCardStack } from "./hooks/useCardStack";
import { CardStack } from "./CardStack";
import { CardActions } from "./CardActions";
import type { Question } from "./types";
import { getSkippedQuestions, getLikedQuestions } from "~/lib/localStorage";
/**
 * QuestionComponent displays a stack of question cards that can be swiped left or right
 * @param initialQuestions - Initial set of questions to display
 */
export function QuestionComponent({ 
  initialQuestions 
}: { 
  initialQuestions: Question[];
}) {
  //get stored skips and likes
  const storedSkips = getSkippedQuestions();
  const storedLikes = getLikedQuestions();

  const {
    cards,
    skips,
    likes,
    direction,
    skipping,
    liking,
    isLoading,
    handleCardAction,
    handleDrag,
    handleDragEnd,
    undoSkip,
    redoLike,
    getMoreCards,
    reset,
  } = useCardStack({ initialQuestions, storedSkips, storedLikes });

  return (
    <div className="flex-1 p-8 h-full flex flex-col justify-center items-center" role="region" aria-label="Question cards">
      <CardStack
        cards={cards}
        direction={direction}
        skipping={skipping}
        liking={liking}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
      />
      <CardActions
        cards={cards}
        skips={skips}
        likes={likes}
        isLoading={isLoading}
        onCardAction={handleCardAction}
        onUndoSkip={undoSkip}
        onRedoLike={redoLike}
        onGetMore={getMoreCards}
        onReset={reset}
      />
    </div>
  );
} 