import { useTheme } from "../hooks/useTheme";
import { StyleSelector } from "../components/styles-selector";
import { ToneSelector } from "../components/tone-selector";
import { Header } from "../components/header";
import { ActionButtons } from "../components/action-buttons";
import { QuestionDisplay } from "../components/question-display";
import { AnimatePresence } from "framer-motion";
import { CollapsibleSection } from "../components/collapsible-section/CollapsibleSection";
import { isColorDark } from "@/lib/utils";
import { Icon } from "@/components/ui/icons/icon";
import { useQuestionState } from "../hooks/useQuestionState";

export default function MainPage() {
  const { theme } = useTheme();
  const {
    styles,
    tones,
    selectedStyle,
    setSelectedStyle,
    selectedTone,
    setSelectedTone,
    currentQuestion,
    isGenerating,
    isStyleTonesOpen,
    setIsStyleTonesOpen,
    getNextQuestion,
    handleShuffleStyleAndTone,
    handleConfirmRandomizeStyleAndTone,
    handleCancelRandomizeStyleAndTone,
    toggleLike,
    toggleHide,
    handleHideStyle,
    handleHideTone,
    isFavorite,
    style,
    tone,
  } = useQuestionState();

  const gradient = (style?.color && tone?.color) ? [style?.color, tone?.color] : ['#667EEA', '#764BA2'];
  const gradientTarget = theme === "dark" ? "#000" : "#fff";

  return (
    <div
      className="min-h-screen transition-colors overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${gradientTarget}, ${gradient[0]}, ${gradient[1]}, ${gradientTarget})`
      }}
    >
      <Header
        gradient={gradient}
      />

      <main className="flex-1 flex flex-col">
        <AnimatePresence mode="wait">
          {currentQuestion && selectedStyle && selectedTone ? (
            <QuestionDisplay
              key={currentQuestion._id}
              isGenerating={isGenerating}
              currentQuestion={currentQuestion}
              isFavorite={isFavorite}
              toggleLike={() => void toggleLike(currentQuestion._id)}
              onSwipe={getNextQuestion}
              toggleHide={() => toggleHide(currentQuestion._id)}
              onHideStyle={handleHideStyle}
              onHideTone={handleHideTone}
            />
          ) : (
            <QuestionDisplay
              key="loading"
              isGenerating={true}
              currentQuestion={null}
              isFavorite={false}
              toggleLike={() => {}}
              toggleHide={() => {}}
              onSwipe={() => {}}
              onHideStyle={() => {}}
              onHideTone={() => {}}
            />
          )}
        </AnimatePresence>

        <div className="px-4">
          <CollapsibleSection
            title="Customize Style & Tone"
            icons={[style?.icon as Icon, tone?.icon as Icon]}
            isOpen={isStyleTonesOpen}
            onOpenChange={setIsStyleTonesOpen}
          >
            <StyleSelector
              styles={styles || []}
              randomOrder={false}
              selectedStyle={selectedStyle}
              onSelectStyle={setSelectedStyle}
            />
            <ToneSelector
              tones={tones || []}
              randomOrder={false}
              selectedTone={selectedTone}
              onSelectTone={setSelectedTone}
            />
          </CollapsibleSection>
        </div>

        <ActionButtons
          isColorDark={isColorDark}
          gradient={gradient}
          isGenerating={isGenerating}
          currentQuestion={currentQuestion}
          handleShuffleStyleAndTone={handleShuffleStyleAndTone}
          handleConfirmRandomizeStyleAndTone={handleConfirmRandomizeStyleAndTone}
          handleCancelRandomizeStyleAndTone={handleCancelRandomizeStyleAndTone}
          getNextQuestion={getNextQuestion}
          isStyleTonesOpen={isStyleTonesOpen}
        />
      </main>
    </div>
  );
}
