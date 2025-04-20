"use client";

import { useCardStack } from "./hooks/useCardStack";
import { CardStack } from "./CardStack";
import { CardActions } from "./CardActions";
import { useRouter } from "next/navigation";
import { 
  getSkippedIds, getLikedIds, getSkippedCategories, getLikedTags, getSkippedTags, getLikedCategories,
  getSimpleMode, saveSimpleMode
} from "~/lib/localStorage";
import type { Question, QuestionTag, Tag } from "@prisma/client";
import { useState, useEffect } from "react";
import { Switch } from "~/components/ui/switch";
import { Label } from "~/components/ui/label";
import { Button } from "~/components/ui/button";
import { FilterIcon } from "lucide-react";    
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
  const [simpleMode, setSimpleMode] = useState(true);
  const router = useRouter();
  //get stored skips and likes
  const storedSkipIDs = getSkippedIds();
  const storedLikeIDs = getLikedIds();
  const storedSkipCategories = getSkippedCategories();
  const storedLikeCategories = getLikedCategories();
  const storedSkipTags = getSkippedTags();
  const storedLikeTags = getLikedTags();

  useEffect(() => {
    // Load simple mode setting from localStorage
    const storedSimpleMode = getSimpleMode();
    setSimpleMode(storedSimpleMode);
  }, []);

  const handleSimpleModeChange = (checked: boolean) => {
    setSimpleMode(checked);
    saveSimpleMode(checked);
  };

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
  const handleFilter = () => {
    router.push("/manage-filters");
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
  } = useCardStack({ simpleMode, initialQuestions, storedSkipIDs, storedSkipCategories, storedLikeIDs, storedLikeCategories, storedSkipTags, storedLikeTags, handleInspectCard });

  return (
    <div className="flex-1 p-8 h-full flex flex-col justify-center items-center" role="region" aria-label="Question cards">
      <div className="p-2 flex flex-row items-center gap-2">
        <Switch id="simple-mode" checked={simpleMode} onCheckedChange={handleSimpleModeChange} />
        <Label htmlFor="simple-mode">Simple Mode</Label>
      </div>

      {!simpleMode && <div className="p-2 flex flex-row items-center gap-2">
        <Button onClick={handleFilter} aria-label="filter questions">
          <FilterIcon className="mr-2 text-blue-500" aria-hidden="true" />
          Filter
          </Button>
        </div>
      }
      <CardStack
        simpleMode={simpleMode}
        cards={cards}
        direction={direction}
        skipping={skipping}
        liking={liking}
        filtering={filtering}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
      />
      <CardActions
        simpleMode={simpleMode}
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