"use client";

import { useSearchParams } from "next/navigation";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { ArrowLeft, Heart, Trash2, Tag, Folder, Undo2, Redo2 } from "lucide-react";
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
  isQuestionLiked,
  removeSkippedQuestion,
  removeLikedQuestion,
  removeSkippedCategory,
  removeLikedCategory,
  removeSkippedTag,
  removeLikedTag
} from "~/lib/localStorage";
import { Badge } from "~/components/ui/badge";
import { useState, useEffect } from "react";

export default function InspectCard() {
	const [skipped, setSkipped] = useState(false);
	const [liked, setLiked] = useState(false);
	const [categoryStatus, setCategoryStatus] = useState<"liked" | "skipped" | "none">("none");
	const [tagStatus, setTagStatus] = useState<Record<string, "liked" | "skipped" | "none">>({});

  const searchParams = useSearchParams();
  const router = useRouter();
  const id = searchParams.get("id");

  const { data: question, isLoading, error } = api.questions.getById.useQuery(
    { id: id ? parseInt(id) : 0 },
    { enabled: !!id }
  );

  useEffect(() => {
    if (question) {
			setSkipped(isQuestionSkipped(question.id));
			setLiked(isQuestionLiked(question.id));
      setCategoryStatus(question.category ? isCategoryLiked(question.category) ? "liked" : isCategorySkipped(question.category) ? "skipped" : "none" : "none");
      if (question.tags) {
        const status: Record<string, "liked" | "skipped" | "none"> = {};
        question.tags.forEach(tag => {
          status[tag.tag.name] = isTagLiked(tag.tag.name) ? "liked" : isTagSkipped(tag.tag.name) ? "skipped" : "none";
        });
        setTagStatus(status);
      }
    }
  }, [question]);

  const handleLike = () => {
    if (!question) return;
    saveLikedQuestion(question);
		removeSkippedQuestion(question.id);
		setLiked(true);
		setSkipped(false);
  };
	const handleUnlike = () => {
		if (!question) return;
		removeLikedQuestion(question.id);
		setLiked(false);
	};

  const handleSkip = () => {
    if (!question) return;
    saveSkippedQuestion(question);
		removeLikedQuestion(question.id);
		setSkipped(true);
		setLiked(false);
  };
	const handleUnskip = () => {
		if (!question) return;
		removeSkippedQuestion(question.id);
		setSkipped(false);
	};

  const handleCategoryLike = () => {
    if (!question) return;
    saveLikedCategory(question.category);
		removeSkippedCategory(question.category);
		setCategoryStatus("liked");
  };
	const handleCategoryUnlike = () => {
		if (!question) return;
		removeLikedCategory(question.category);
		setCategoryStatus("none");
	};
  const handleCategorySkip = () => {
    if (!question) return;
    saveSkippedCategory(question.category);
		removeLikedCategory(question.category);
		setCategoryStatus("skipped");
  };
	const handleCategoryUnskip = () => {
		if (!question) return;
		removeSkippedCategory(question.category);
		setCategoryStatus("none");
	};


  const handleTagLike = (tagName: string) => {
    if (!question) return;
    saveLikedTag(tagName);
		removeSkippedTag(tagName);
    setTagStatus(prev => ({ ...prev, [tagName]: "liked" }));
  };

  const handleTagUnlike = (tagName: string) => {
    if (!question) return;
    removeLikedTag(tagName);
    setTagStatus(prev => ({ ...prev, [tagName]: "none" }));
  };

  const handleTagSkip = (tagName: string) => {
    if (!question) return;
    saveSkippedTag(tagName);
		removeLikedTag(tagName);
    setTagStatus(prev => ({ ...prev, [tagName]: "skipped" }));
  };

  const handleTagUnskip = (tagName: string) => {
    if (!question) return;
    removeSkippedTag(tagName);
    setTagStatus(prev => ({ ...prev, [tagName]: "none" }));
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
        <Button onClick={() => router.back()} variant="ghost">
          <ArrowLeft className="mr-2" />
          Back
        </Button>
        <div className="flex gap-2">
					{skipped ? (
						<Button 
							onClick={handleUnskip}
							variant="outline"
						>
							<Undo2 className="mr-2 text-red-500" />
							Unskip
						</Button>
					) : (
						<Button 
							onClick={handleSkip} 
							variant="outline"
						>
							<Trash2 className="mr-2 text-red-500" />
							Skip
						</Button>
					)}
					{liked ? (
						<Button 
							onClick={handleUnlike} 
							variant="outline" 
						>
							<Redo2 className="mr-2 text-green-500" />
							Unlike
						</Button>
					) : (
						<Button 
							onClick={handleLike} 
						>
							<Heart className="mr-2 text-green-500" />
							Like
						</Button>
					)}
        </div>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-8">
        <div className="w-full max-w-md">
					<h1 className="text-2xl font-bold">{question.text}</h1>
        </div>
        
        <div className="w-full max-w-md space-y-4">
					<h3 className="font-medium flex items-center gap-2">
						Category
						<Folder className="h-5 w-5" />
					</h3>
          <div className="flex items-center justify-between p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
            <div className="flex items-center gap-2">
              <span className="font-medium">{question.category}</span>
            </div>
            <div className="flex gap-2">
							{categoryStatus === "skipped" ? (
								<Button 
									onClick={handleCategoryUnskip} 
									variant="outline" 
									size="sm"
								>
									<Undo2 className="h-4 w-4 mr-1 text-red-500" />
								</Button>
							) : (
              <Button 
                onClick={handleCategorySkip} 
                variant="outline" 
                size="sm"
              >
                <Trash2 className="h-4 w-4 mr-1 text-red-500" />
              </Button>
							)}
							{categoryStatus === "liked" ? (
								<Button 
									onClick={handleCategoryUnlike} 
									variant="outline" 
									size="sm"
								>
									<Redo2 className="h-4 w-4 mr-1 text-green-500" />
								</Button>
							) : (	
              <Button 
                onClick={handleCategoryLike} 
                variant="outline" 
                size="sm"
              >
                <Heart className="h-4 w-4 mr-1 text-green-500" />
              </Button>
							)}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="font-medium flex items-center gap-2">
							Tags
              <Tag className="h-5 w-5" />
            </h3>
            <div className="flex flex-wrap gap-2">
              {question.tags.map(tag => (
                <div key={tag.tag.id} className="flex items-center gap-2 p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                  <Badge variant="outline">{tag.tag.name}</Badge>
                  <div className="flex gap-1">
                    {tagStatus[tag.tag.name] === "skipped" ? (
                      <Button 
                        onClick={() => handleTagUnskip(tag.tag.name)} 
                        variant="ghost" 
                        size="sm"
                      >
                        <Undo2 className="h-4 w-4 text-red-500" />
                      </Button>
                    ) : (
                      <Button 
                        onClick={() => handleTagSkip(tag.tag.name)} 
                        variant="ghost" 
                        size="sm"
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    )}
                    {tagStatus[tag.tag.name] === "liked" ? (
                      <Button 
                        onClick={() => handleTagUnlike(tag.tag.name)} 
                        variant="ghost" 
                        size="sm"
                      >
                        <Redo2 className="h-4 w-4 text-green-500" />
                      </Button>
                    ) : (
                      <Button 
                        onClick={() => handleTagLike(tag.tag.name)} 
                        variant="ghost" 
                        size="sm"
                      >
                        <Heart className="h-4 w-4 text-green-500" />
                      </Button>
                    )}
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
