"use client";

import { useSearchParams } from "next/navigation";
import { api } from "~/trpc/react";
import GameCard from "~/app/_components/game-card";
import { Button } from "~/components/ui/button";
import { ArrowLeft, Heart, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { saveLikedQuestion, saveSkippedQuestion } from "~/lib/localStorage";

export default function InspectCard() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = searchParams.get("id");

  const { data: question, isLoading, error } = api.questions.getById.useQuery(
    { id: id ?? "" },
    { enabled: !!id }
  );

  const handleLike = () => {
    if (!question) return;
    saveLikedQuestion(question);
    router.push("/");
  };

  const handleSkip = () => {
    if (!question) return;
    saveSkippedQuestion(question);
    router.push("/");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen p-4 flex flex-col items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  if (error || !question) {
    return (
      <div className="min-h-screen p-4 flex flex-col items-center justify-center">
        <p>Question not found</p>
        <Button onClick={() => router.push("/")} className="mt-4">
          <ArrowLeft className="mr-2" />
          Back to Home
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <Button onClick={() => router.push("/")} variant="ghost">
          <ArrowLeft className="mr-2" />
          Back
        </Button>
        <div className="flex gap-2">
          <Button onClick={handleSkip} variant="destructive">
            <Trash2 className="mr-2" />
            Skip
          </Button>
          <Button onClick={handleLike} variant="default">
            <Heart className="mr-2" />
            Like
          </Button>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-md">
          <GameCard question={question} />
        </div>
      </div>
    </div>
  );
}
