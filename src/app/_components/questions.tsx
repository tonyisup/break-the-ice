"use client";

import { useCardStack } from "./hooks/useCardStack";
import { CardStack } from "./CardStack";
import { CardActions } from "./CardActions";
import { 
  getSkippedTags, getLikedTags
} from "~/lib/localStorage";
import type { Question, QuestionTag, Tag } from "@prisma/client";
/**
 * QuestionComponent displays a stack of question cards that can be swiped left or right
 */
interface QuestionComponentProps {
  initialQuestions: (Question & {
    tags: (QuestionTag & {
      tag: Tag;
    })[];
  })[];
}

export function QuestionComponent({ initialQuestions }: QuestionComponentProps) {
  //get stored skips and likes
  const storedSkipTags = getSkippedTags();
  const storedLikeTags = getLikedTags();

  const {
    cards,
    direction,
    skipping,
    liking,
    filtering,
    isLoading,
    handleCardAction,
    handleDrag,
    handleDragEnd,
    reset,
  } = useCardStack({ initialQuestions, storedSkipTags, storedLikeTags });

  return (
    <div className="flex-1 p-8 h-full flex flex-col justify-center items-center" role="region" aria-label="Question cards">
      <CardStack
        cards={cards}
        direction={direction}
        skipping={skipping}
        liking={liking}
        filtering={filtering}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        isLoading={isLoading}
      />
      <CardActions
        cards={cards}
        isLoading={isLoading}
        onCardAction={handleCardAction}
        onReset={reset}
      />
    </div> 
  );
} 