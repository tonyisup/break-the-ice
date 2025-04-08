"use client";

import { useCardStack } from "./hooks/useCardStack";
import { CardStack } from "./CardStack";
import { CardActions } from "./CardActions";
import type { Question } from "./types";

/**
 * QuestionComponent displays a stack of question cards that can be swiped left or right
 * @param initialQuestions - Initial set of questions to display
 */
export function QuestionComponent({ 
  initialQuestions 
}: { 
  initialQuestions: Question[];
}) {
  const {
    cards,
    cardHistory,
    direction,
    skipping,
    isLoading,
    handleCardAction,
    handleDrag,
    handleDragEnd,
    goBack,
    getMoreCards,
  } = useCardStack({ initialQuestions });

  return (
    <div className="flex-1 p-8 h-full flex flex-col justify-center items-center" role="region" aria-label="Question cards">
      <CardStack
        cards={cards}
        direction={direction}
        skipping={skipping}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
      />
      <CardActions
        cards={cards}
        cardHistory={cardHistory}
        isLoading={isLoading}
        onCardAction={handleCardAction}
        onGoBack={goBack}
        onGetMore={getMoreCards}
      />
    </div>
  );
} 