"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getLikedIds, removeLikedQuestion } from "~/lib/localStorage";
import { QuestionGrid } from "~/app/_components/QuestionGrid";
import { Button } from "~/components/ui/button";
import { ArrowLeft, Trash2 } from "lucide-react";
import { api } from "~/trpc/react";

export default function ManageLikesPage() {
  const router = useRouter();
  const [likedQuestionIDs, setLikedQuestionIDs] = useState<string[]>([]);
  const { data: likedQuestions } = api.questions.getByIDs.useQuery({
    ids: likedQuestionIDs
  });
  useEffect(() => {
    const questions = getLikedIds();
    setLikedQuestionIDs(questions);
  }, []);

  const handleRemove = (id: string) => {
    removeLikedQuestion(id);
    setLikedQuestionIDs((prev) => prev.filter((q) => q !== id));
  };

  const handleClearAll = () => {
    if (window.confirm("Are you sure you want to remove all liked questions?")) {
      setLikedQuestionIDs([]);
      // Clear all liked questions from localStorage
      localStorage.removeItem("break-the-ice-liked-questions");
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
            {likedQuestionIDs.length} liked questions
          </span>
          {likedQuestionIDs.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleClearAll}
              className="flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Clear All
            </Button>
          )}
        </div>
      </div>

      <h1 className="text-3xl font-bold mb-6">Manage Liked Questions</h1>

      {likedQuestionIDs.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-lg text-muted-foreground">
            You haven&apos;t liked any questions yet.
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
        likedQuestions && <QuestionGrid
          questions={likedQuestions}
          type="likes"
          onRemove={handleRemove}
        />
      )}
    </div>
  );
} 