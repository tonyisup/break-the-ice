import { useQuery, useConvex, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { useTheme } from "../hooks/useTheme";
import { useStorageContext } from "../hooks/useStorageContext";
import { StyleSelector, StyleSelectorRef } from "../components/styles-selector";
import { ToneSelector, ToneSelectorRef } from "../components/tone-selector";
import { Header } from "../components/header";
import { CollapsibleSection } from "../components/collapsible-section/CollapsibleSection";
import { Icon } from "@/components/ui/icons/icon";
import { Button } from "@/components/ui/button";
import { ArrowUp } from "lucide-react";
import { ModernQuestionCard } from "../components/modern-question-card/modern-question-card";

export default function InfiniteScrollPage() {
  const { effectiveTheme } = useTheme();
  const convex = useConvex();

  const {
    likedQuestions,
    addLikedQuestion,
    removeLikedQuestion,
    hiddenQuestions,
    addHiddenQuestion,
    hiddenStyles,
    hiddenTones,
    addHiddenStyle,
    addHiddenTone,
    defaultStyle,
    defaultTone,
  } = useStorageContext();

  const styles = useQuery(api.styles.getFilteredStyles, { excluded: hiddenStyles });
  const tones = useQuery(api.tones.getFilteredTones, { excluded: hiddenTones });

  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedStyle, setSelectedStyle] = useState(
    searchParams.get("style") ?? defaultStyle ?? styles?.[0]?.id ?? ""
  );
  const [selectedTone, setSelectedTone] = useState(
    searchParams.get("tone") ?? defaultTone ?? tones?.[0]?.id ?? ""
  );

  const [isStyleTonesOpen, setIsStyleTonesOpen] = useState(true); // Default open
  const styleSelectorRef = useRef<StyleSelectorRef>(null);
  const toneSelectorRef = useRef<ToneSelectorRef>(null);

  const [questions, setQuestions] = useState<Doc<"questions">[]>([]);
  const [seenIds, setSeenIds] = useState<Set<Id<"questions">>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [showTopButton, setShowTopButton] = useState(false);

  // Used for styling and gradient
  const style = useMemo(() => styles?.find(s => s.id === selectedStyle), [styles, selectedStyle]);
  const tone = useMemo(() => tones?.find(t => t.id === selectedTone), [tones, selectedTone]);
  const gradient = (style?.color && tone?.color) ? [style?.color, tone?.color] : ['#667EEA', '#764BA2'];
  const gradientTarget = effectiveTheme === "dark" ? "#000" : "#bbb";

  const recordAnalytics = useMutation(api.questions.recordAnalytics);

  // Initialize defaults if needed
  useEffect(() => {
    if (styles && styles.length > 0 && !selectedStyle) {
      setSelectedStyle(defaultStyle ?? styles[0].id);
    }
    if (tones && tones.length > 0 && !selectedTone) {
      setSelectedTone(defaultTone ?? tones[0].id);
    }
  }, [styles, tones, selectedStyle, selectedTone, defaultStyle, defaultTone]);

  // Update URL params
  useEffect(() => {
    const newSearchParams = new URLSearchParams(searchParams);
    newSearchParams.set("style", selectedStyle);
    newSearchParams.set("tone", selectedTone);
    setSearchParams(newSearchParams);
  }, [searchParams, selectedStyle, selectedTone, setSearchParams]);

  // Reset questions when style/tone changes
  useEffect(() => {
    setQuestions([]);
    setSeenIds(new Set());
    setHasMore(true);
  }, [selectedStyle, selectedTone]);

  // Function to load more questions
  const loadMoreQuestions = useCallback(async () => {
    if (isLoading || !hasMore || !selectedStyle || !selectedTone) return;

    setIsLoading(true);
    try {
      const newQuestions = await convex.query(api.questions.getNextQuestions, {
        count: 5, // Fetch 5 at a time
        style: selectedStyle,
        tone: selectedTone,
        seen: Array.from(seenIds), // Pass currently seen IDs to avoid duplicates
        hidden: hiddenQuestions,
      });

      if (newQuestions.length === 0) {
        setHasMore(false);
      } else {
        setQuestions(prev => [...prev, ...newQuestions]);
        setSeenIds(prev => {
          const next = new Set(prev);
          newQuestions.forEach(q => next.add(q._id));
          return next;
        });
      }
    } catch (error) {
      console.error("Error fetching questions:", error);
      toast.error("Failed to load more questions.");
    } finally {
      setIsLoading(false);
    }
  }, [convex, isLoading, hasMore, selectedStyle, selectedTone, seenIds, hiddenQuestions]);

  // Initial load
  useEffect(() => {
    if (questions.length === 0 && hasMore && selectedStyle && selectedTone) {
      loadMoreQuestions();
    }
  }, [questions.length, hasMore, selectedStyle, selectedTone]); // eslint-disable-line react-hooks/exhaustive-deps

  // Infinite scroll handler
  useEffect(() => {
    const handleScroll = () => {
      if (window.innerHeight + document.documentElement.scrollTop >= document.documentElement.offsetHeight - 200) {
        loadMoreQuestions();
      }

      if (window.scrollY > 500) {
        setShowTopButton(true);
      } else {
        setShowTopButton(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [loadMoreQuestions]);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleLike = async (questionId: Id<"questions">) => {
    try {
      const isLiked = likedQuestions.includes(questionId);
      if (isLiked) {
        removeLikedQuestion(questionId);
        toast.success("Removed from favorites");
      } else {
        addLikedQuestion(questionId);
        await recordAnalytics({
          questionId,
          event: "like",
          viewDuration: 0, // Not tracking duration in list view accurately
        });
        toast.success("Added to favorites!");
      }
    } catch (error) {
      console.error("Error toggling like:", error);
      toast.error("Failed to update favorites.");
    }
  };

  const toggleHide = (questionId: Id<"questions">) => {
    try {
      addHiddenQuestion(questionId);
      toast.success("Question hidden");
      // Remove from list
      setQuestions(prev => prev.filter(q => q._id !== questionId));
    } catch (error) {
      console.error("Error hiding question:", error);
      toast.error("Failed to hide question.");
    }
  }

  const handleHideStyle = (styleId: string) => {
    addHiddenStyle(styleId);
    // Reset list as style might change or be hidden
    setQuestions([]);
    setSeenIds(new Set());
    setHasMore(true);
    // Should trigger effect to select new style if current is hidden?
    // MainPage logic handles it via useEffect check?
  }

  const handleHideTone = (toneId: string) => {
    addHiddenTone(toneId);
    setQuestions([]);
    setSeenIds(new Set());
    setHasMore(true);
  }

  // Mock highlighting states required by selectors but not used here
  const [isHighlighting, setIsHighlighting] = useState(false);

  return (
    <div
      className="min-h-screen transition-colors overflow-hidden flex flex-col"
      style={{
        background: `linear-gradient(135deg, ${gradient[0]}, ${gradientTarget}, ${gradient[1]})`
      }}
    >
      <Header />

      <main className="flex-1 flex flex-col pb-20">
        <div className="px-4 w-full flex flex-col justify-center max-w-3xl mx-auto mb-6 pt-4">
          <CollapsibleSection
            title="Customize Style & Tone"
            icons={[style?.icon as Icon, tone?.icon as Icon]}
            iconColors={[style?.color, tone?.color]}
            isOpen={isStyleTonesOpen}
            onOpenChange={setIsStyleTonesOpen}
          >
            <StyleSelector
              styles={styles || []}
              randomOrder={false}
              selectedStyle={selectedStyle}
              ref={styleSelectorRef}
              onSelectStyle={setSelectedStyle}
              isHighlighting={isHighlighting}
              setIsHighlighting={setIsHighlighting}
              onHighlightStyle={() => {}}
            />
            <ToneSelector
              tones={tones || []}
              randomOrder={false}
              ref={toneSelectorRef}
              selectedTone={selectedTone}
              onSelectTone={setSelectedTone}
              isHighlighting={isHighlighting}
              setIsHighlighting={setIsHighlighting}
              onHighlightTone={() => {}}
            />
          </CollapsibleSection>
        </div>

        <div className="flex flex-col gap-6 px-4 max-w-3xl mx-auto w-full">
          {questions.map((question) => {
            const qStyle = styles?.find(s => s.id === question.style);
            const qTone = tones?.find(t => t.id === question.tone);

            return (
              <ModernQuestionCard
                key={question._id}
                isGenerating={false}
                question={question}
                isFavorite={likedQuestions.includes(question._id)}
                gradient={gradient}
                style={qStyle}
                tone={qTone}
                onToggleFavorite={() => toggleLike(question._id)}
                onToggleHidden={() => toggleHide(question._id)}
                onHideStyle={handleHideStyle}
                onHideTone={handleHideTone}
              />
            );
          })}

          {isLoading && (
             <div className="flex justify-center py-8">
               <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
             </div>
          )}

          {!hasMore && questions.length > 0 && (
            <div className="text-center py-8 text-white/70">
              No more questions found for this style and tone.
            </div>
          )}

           {!hasMore && questions.length === 0 && !isLoading && (
            <div className="text-center py-8 text-white/70">
              No questions found. Try changing the style or tone.
            </div>
          )}
        </div>
      </main>

      {showTopButton && (
        <Button
          onClick={scrollToTop}
          className="fixed bottom-6 left-6 rounded-full w-12 h-12 p-0 shadow-lg z-50"
          variant="default"
        >
          <ArrowUp className="w-6 h-6" />
        </Button>
      )}
    </div>
  );
}
