"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSkippedIds, removeSkippedQuestion } from "~/lib/localStorage";
import { QuestionGrid } from "~/app/_components/QuestionGrid";
import { Button } from "~/components/ui/button";
import { ArrowLeft, Trash2 } from "lucide-react";
import { api } from "~/trpc/react";

export default function ManageSkipsPage() {
  const router = useRouter();
  const [skippedQuestionIDs, setSkippedQuestionIDs] = useState<string[]>([]);
  const { data: skippedQuestions } = api.questions.getByIDs.useQuery({
    ids: skippedQuestionIDs
  });

  useEffect(() => {
    const questions = getSkippedIds();
    setSkippedQuestionIDs(questions);
  }, []);

  const handleRemove = (id: string) => {
    removeSkippedQuestion(id);
    setSkippedQuestionIDs((prev) => prev.filter((q) => q !== id));
  };

  const handleClearAll = () => {
    if (window.confirm("Are you sure you want to remove all skipped questions?")) {
      setSkippedQuestionIDs([]);
      // Clear all skipped questions from localStorage
      localStorage.removeItem("break-the-ice-skipped-ids");
    }
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-6">
        <Button
          variant="outline"
          onClick={() => router.push("/")}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Questions
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {skippedQuestionIDs.length} skipped questions
          </span>
          {skippedQuestionIDs.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleClearAll}
              className="flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Unskip All
            </Button>
          )}
        </div>
      </div>

      <h1 className="text-3xl font-bold mb-6">Manage Skipped Questions</h1>

      {skippedQuestionIDs.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-lg text-muted-foreground">
            You haven&apos;t skipped any questions yet.
          </p>
          <Button
            variant="outline"
            onClick={() => router.push("/")}
            className="mt-4"
          >
            Go to Questions
          </Button>
        </div>
      ) : (
        skippedQuestions && <QuestionGrid
          questions={skippedQuestions}
          type="skips"
          onRemove={handleRemove}
        />
      )}
    </div>
  );
} 