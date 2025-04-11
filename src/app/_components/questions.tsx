"use client";

import { useCardStack } from "./hooks/useCardStack";
import { CardStack } from "./CardStack";
import { CardActions } from "./CardActions";
import { useRouter } from "next/navigation";
import { getSkippedIds, getLikedIds, getSkippedCategories, getLikedTags, getSkippedTags, getLikedCategories } from "~/lib/localStorage";
/**
 * QuestionComponent displays a stack of question cards that can be swiped left or right
 */
export function QuestionComponent() {
  const router = useRouter();
  //get stored skips and likes
  const storedSkipIDs = getSkippedIds();
  const storedLikeIDs = getLikedIds();
  const storedSkipCategories = getSkippedCategories();
  const storedLikeCategories = getLikedCategories();
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
    skips,
    likes,
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
  } = useCardStack({ storedSkipIDs, storedSkipCategories, storedLikeIDs, storedLikeCategories, storedSkipTags, storedLikeTags, handleInspectCard });

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
      />
      <CardActions  
        cards={cards}
        skips={skips}
        likes={likes}
        isLoading={isLoading}
        onCardAction={handleCardAction}
        onGetMore={getMoreCards}
        onReset={reset}
        onManageSkips={handleManageSkips}
        onManageLikes={handleManageLikes}
        onInspectCard={handleInspectCard}
      />
    </div>
  );
} 