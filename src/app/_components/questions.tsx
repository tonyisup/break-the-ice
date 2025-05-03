"use client";

import { useCardStack } from "./hooks/useCardStack";
import { CardStack } from "./CardStack";
import { CardActions } from "./CardActions";
import { useRouter } from "next/navigation";
import { 
  getSkippedIds, getLikedIds, getSkippedCategories, getLikedTags, getSkippedTags, getLikedCategories,
  getAdvancedMode, saveAdvancedMode,
  getAutoGetMore,
  isAutoGetMoreSet,
  saveAutoGetMore,
  getDrawCount
} from "~/lib/localStorage";
import type { Question, QuestionTag, Tag } from "@prisma/client";
import { useState, useEffect } from "react";
import { Switch } from "~/components/ui/switch";
import { Label } from "~/components/ui/label";
import { SettingsIcon } from "lucide-react";    
import Link from "next/link";
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
  const [advancedMode, setAdvancedMode] = useState(false);
  const router = useRouter();
  //get stored skips and likes
  const storedSkipIDs = getSkippedIds();
  const storedLikeIDs = getLikedIds();
  const storedSkipCategories = getSkippedCategories();
  const storedLikeCategories = getLikedCategories();
  const storedSkipTags = getSkippedTags();
  const storedLikeTags = getLikedTags();
  const isAutoGetMoreRemembered = isAutoGetMoreSet();
  const autoGetMoreDefault = isAutoGetMoreRemembered ? getAutoGetMore() : false;
  const drawCountDefault = getDrawCount() ?? advancedMode ? 5 : 1;

  useEffect(() => {
    // Load simple mode setting from localStorage
    const storedAdvancedMode = getAdvancedMode();
    setAdvancedMode(storedAdvancedMode);
  }, []);

  const handleAdvancedModeChange = (checked: boolean) => {
    setAdvancedMode(checked);
    saveAdvancedMode(checked);
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
  const handleAutoGetMore = (checked: boolean) => {
    setAutoGetMore(checked);
    saveAutoGetMore(checked);
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
    autoGetMore,
    setAutoGetMore,
    handleCardAction,
    handleDrag,
    handleDragEnd,
    getMoreCards,
    reset,
    drawCount,
    setDrawCount
  } = useCardStack({ autoGetMoreDefault, advancedMode, initialQuestions, storedSkipIDs, storedSkipCategories, storedLikeIDs, storedLikeCategories, storedSkipTags, storedLikeTags, handleInspectCard, drawCountDefault });

  return (
    <div className="flex-1 p-8 h-full flex flex-col justify-center items-center" role="region" aria-label="Question cards">
      <div className="p-2 flex flex-row items-center gap-2">
        <Switch id="advanced-mode" checked={advancedMode} onCheckedChange={handleAdvancedModeChange} />
        <Label htmlFor="advanced-mode">Advanced Mode</Label>

        {advancedMode && 
          <Link href="/settings" className="p-2" aria-label="filter questions">
            <SettingsIcon className="text-blue-500" aria-hidden="true" />
          </Link>
        }
      </div>

      <CardStack
        advancedMode={advancedMode}
        cards={cards}
        direction={direction}
        skipping={skipping}
        liking={liking}
        filtering={filtering}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        onGetMore={getMoreCards}
        isLoading={isLoading}
        autoGetMore={autoGetMore}
        setAutoGetMore={handleAutoGetMore}
        drawCount={drawCount}
        setDrawCount={setDrawCount}
      />
      <CardActions
        advancedMode={advancedMode}
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