"use client";

import { useSearchParams } from "next/navigation";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { ArrowLeft, Heart, Trash2, Tag, Tags } from "lucide-react";
import { useRouter } from "next/navigation";
import { 
  saveLikedQuestion, 
  saveSkippedQuestion,
  saveLikedCategory,
  saveSkippedCategory,
  saveLikedTag,
  saveSkippedTag,
  isCategoryLiked,
  isCategorySkipped,
  isTagLiked,
  isTagSkipped,
  isQuestionSkipped,
  isQuestionLiked
} from "~/lib/localStorage";
import { Badge } from "~/components/ui/badge";

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

  const handleCategoryLike = () => {
    if (!question) return;
    saveLikedCategory(question.category);
    router.push("/");
  };

  const handleCategorySkip = () => {
    if (!question) return;
    saveSkippedCategory(question.category);
    router.push("/");
  };

  const handleTagLike = (tagName: string) => {
    if (!question) return;
    saveLikedTag(tagName);
    router.push("/");
  };

  const handleTagSkip = (tagName: string) => {
    if (!question) return;
    saveSkippedTag(tagName);
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
          <Button 
						onClick={handleSkip} 
						variant="destructive"
						disabled={isQuestionSkipped(question.id)}
					>
            <Trash2 className="mr-2" />
            Skip
          </Button>
          <Button 
						onClick={handleLike} 
						variant="outline" 
						disabled={isQuestionLiked(question.id)}
					>
            <Heart className="mr-2 text-green-500" />
            Like
          </Button>
        </div>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-8">
        <div className="w-full max-w-md">
					<h1 className="text-2xl font-bold">{question.text}</h1>
        </div>
        
        <div className="w-full max-w-md space-y-4">
					<h3 className="font-medium flex items-center gap-2">
						Category
						<Tag className="h-5 w-5" />
					</h3>
          <div className="flex items-center justify-between p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
            <div className="flex items-center gap-2">
              <span className="font-medium">{question.category}</span>
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={handleCategorySkip} 
                variant="outline" 
                size="sm"
                disabled={isCategorySkipped(question.category)}
              >
                <Trash2 className="h-4 w-4 mr-1 text-red-500" />
              </Button>
              <Button 
                onClick={handleCategoryLike} 
                variant="outline" 
                size="sm"
                disabled={isCategoryLiked(question.category)}
              >
                <Heart className="h-4 w-4 mr-1 text-green-500" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="font-medium flex items-center gap-2">
							Tags
              <Tags className="h-5 w-5" />
            </h3>
            <div className="flex flex-wrap gap-2">
              {question.tags.map(tag => (
                <div key={tag.tag.id} className="flex items-center gap-2 p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                  <Badge variant="outline">{tag.tag.name}</Badge>
                  <div className="flex gap-1">
                    <Button 
                      onClick={() => handleTagSkip(tag.tag.name)} 
                      variant="ghost" 
                      size="sm"
                      disabled={isTagSkipped(tag.tag.name)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                    <Button 
                      onClick={() => handleTagLike(tag.tag.name)} 
                      variant="ghost" 
                      size="sm"
                      disabled={isTagLiked(tag.tag.name)}
                    >
                      <Heart className="h-4 w-4 text-green-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
