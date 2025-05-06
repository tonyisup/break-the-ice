"use client";

import { useCardStack } from "./hooks/useCardStack";
import { CardStack } from "./CardStack";
import { CardActions } from "./CardActions";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  //get stored skips and likes
  const storedSkipTags = getSkippedTags();
  const storedLikeTags = getLikedTags();


  const handleManageSkips = () => {
    router.push("/manage-skips");
  };

  const handleManageLikes = () => {
    router.push("/manage-likes");
  };
  const handleInspectCard = () => {
    const currentCard = cards[0];
    if (!currentCard) return;
    router.push(`/inspect-card?id=${currentCard.id}`);
  };

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
    getMoreCards,
    reset,
  } = useCardStack({ initialQuestions, storedSkipTags, storedLikeTags, handleInspectCard });

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
        onGetMore={getMoreCards}
        isLoading={isLoading}
      />
      <CardActions
        cards={cards}
        isLoading={isLoading}
        onCardAction={handleCardAction}
        onGetMore={getMoreCards}
        onReset={reset}
        onInspectCard={handleInspectCard}
      />
    </div> 
  );
} 