import { ModernQuestionCard } from "@/components/modern-question-card";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { CollapsibleSection } from "../collapsible-section/CollapsibleSection";

interface QuestionListProps {
  questions: Doc<"questions">[] | HistoryEntryWrapper[];
  styleColors: { [key: string]: string };
  toneColors: { [key: string]: string };
  likedQuestions: Id<"questions">[];
  onToggleLike: (questionId: Id<"questions">) => void;
  onRemoveItem: (questionId: Id<"questions">) => void;
  isHistory?: boolean;
}

interface HistoryEntryWrapper {
  question: Doc<"questions">;
  viewedAt: number;
}

export function QuestionList({
  questions,
  styleColors,
  toneColors,
  likedQuestions,
  onToggleLike,
  onRemoveItem,
  isHistory = false,
}: QuestionListProps) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  const toggleSection = (date: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [date]: !prev[date],
    }));
  };

  const renderQuestion = (question: Doc<"questions">) => {
    const styleColor =
      (question.style && styleColors[question.style]) || "#667EEA";
    const toneColor = (question.tone && toneColors[question.tone]) || "#764BA2";
    const gradient = [styleColor, toneColor];

    return (
      <motion.div
        key={question._id}
        layout
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.2 } }}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        onDragEnd={(event, info) => {
          if (Math.abs(info.offset.x) > 100) {
            onRemoveItem(question._id);
          }
        }}
        onDoubleClick={() => {
          onToggleLike(question._id);
        }}
      >
        <ModernQuestionCard
          question={question}
          isGenerating={false}
          isFavorite={likedQuestions.includes(question._id)}
          onToggleFavorite={() => onToggleLike(question._id)}
          onToggleHidden={() => onRemoveItem(question._id)}
          gradient={gradient}
        />
      </motion.div>
    );
  };

  return (
    <AnimatePresence>
      {isHistory ? (
        Object.entries(
          (questions as HistoryEntryWrapper[]).reduce(
            (acc, entry) => {
              const date = new Date(entry.viewedAt).toLocaleDateString(
                undefined,
                {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                },
              );
              if (!acc[date]) {
                acc[date] = [];
              }
              acc[date].push(entry);
              return acc;
            },
            {} as { [key: string]: HistoryEntryWrapper[] },
          ),
        ).map(([date, entries]) => (
          <CollapsibleSection
            key={date}
            title={date}
            count={entries.length}
            isOpen={openSections[date] || false}
            onOpenChange={() => toggleSection(date)}
          >
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {entries.map((entry) => renderQuestion(entry.question))}
            </div>
          </CollapsibleSection>
        ))
      ) : (
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {(questions as Doc<"questions">[]).map((question) =>
            renderQuestion(question),
          )}
        </div>
      )}
    </AnimatePresence>
  );
}
