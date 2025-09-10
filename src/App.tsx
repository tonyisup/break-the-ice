import { useTheme } from "./hooks/useTheme";
import { ModernQuestionCard } from "./components/modern-question-card";
import { StyleSelector } from "./components/styles-selector";
import { ToneSelector } from "./components/tone-selector";
import { PageHeader } from "./components/page-header/page-header";
import { PageFooter } from "./components/page-footer/page-footer";
import { useQuestionManagement } from "./hooks/useQuestionManagement";

export default function App() {
  const { theme, setTheme } = useTheme();
  const {
    isGenerating,
    currentQuestion,
    isFavorite,
    gradient,
    isColorDark,
    toggleLike,
    selectedStyle,
    setSelectedStyle,
    styleSelectorRef,
    setRandomizedStyle,
    selectedTone,
    setSelectedTone,
    toneSelectorRef,
    setRandomizedTone,
    randomizedStyle,
    randomizedTone,
    handleShuffleStyleAndTone,
    handleConfirmRandomizeStyleAndTone,
    handleCancelRandomizeStyleAndTone,
    handleCancelRandomAndNextQuestion,
    getNextQuestion,
  } = useQuestionManagement();

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  const gradientTarget = theme === "dark" ? "#000" : "#fff";

  return (
    <div
      className="min-h-screen transition-colors overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${gradientTarget}, ${gradient[0]}, ${gradient[1]}, ${gradientTarget})`
      }}
    >
      <PageHeader
        theme={theme}
        toggleTheme={toggleTheme}
        isColorDark={isColorDark}
        gradient={gradient}
      />

      <main className="flex-1 flex flex-col">
        <div className="flex-1 flex items-center justify-center px-5 pb-8">
          <ModernQuestionCard
            isGenerating={isGenerating}
            question={currentQuestion}
            isFavorite={isFavorite}
            gradient={gradient}
            onToggleFavorite={() => currentQuestion && void toggleLike(currentQuestion._id)}
            onShare={() => {
              if (currentQuestion && navigator.share) {
                void navigator.share({
                  title: 'Ice Breaker Question',
                  text: currentQuestion.text,
                });
              }
            }}
          />
        </div>

        <StyleSelector
          randomOrder={false}
          selectedStyle={selectedStyle}
          ref={styleSelectorRef}
          onSelectStyle={setSelectedStyle}
          onRandomizeStyle={setRandomizedStyle}
        />
        <ToneSelector
          randomOrder={false}
          ref={toneSelectorRef}
          selectedTone={selectedTone}
          onSelectTone={setSelectedTone}
          onRandomizeTone={setRandomizedTone}
        />

        <PageFooter
          isGenerating={isGenerating}
          currentQuestion={currentQuestion}
          randomizedStyle={randomizedStyle}
          randomizedTone={randomizedTone}
          handleShuffleStyleAndTone={handleShuffleStyleAndTone}
          handleConfirmRandomizeStyleAndTone={handleConfirmRandomizeStyleAndTone}
          handleCancelRandomizeStyleAndTone={handleCancelRandomizeStyleAndTone}
          handleCancelRandomAndNextQuestion={handleCancelRandomAndNextQuestion}
          getNextQuestion={getNextQuestion}
          isColorDark={isColorDark}
          gradient={gradient}
        />
      </main>
    </div>
  );
}
