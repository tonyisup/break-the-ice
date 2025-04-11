"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getLikedIds, removeLikedQuestion, getLikedCategories, getLikedTags, removeLikedCategory, removeLikedTag } from "~/lib/localStorage";
import { QuestionGrid } from "~/app/_components/QuestionGrid";
import { Button } from "~/components/ui/button";
import { ArrowLeft, Trash2, Tag, Folder, X, FileQuestionIcon } from "lucide-react";
import { api } from "~/trpc/react";
import { Badge } from "~/components/ui/badge";

export default function ManageLikesPage() {
  const router = useRouter();
  const [likedQuestionIDs, setLikedQuestionIDs] = useState<string[]>([]);
  const [likedCategories, setLikedCategories] = useState<string[]>([]);
  const [likedTags, setLikedTags] = useState<string[]>([]);
  const { data: likedQuestions } = api.questions.getByIDs.useQuery({
    ids: likedQuestionIDs
  });

  useEffect(() => {
    const questions = getLikedIds();
    const categories = getLikedCategories();
    const tags = getLikedTags();
    setLikedQuestionIDs(questions);
    setLikedCategories(categories);
    setLikedTags(tags);
  }, []);

  const handleRemoveQuestion = (id: string) => {
    removeLikedQuestion(id);
    setLikedQuestionIDs((prev) => prev.filter((q) => q !== id));
  };

  const handleRemoveCategory = (category: string) => {
    removeLikedCategory(category);
    setLikedCategories((prev) => prev.filter((c) => c !== category));
  };

  const handleRemoveTag = (tag: string) => {
    removeLikedTag(tag);
    setLikedTags((prev) => prev.filter((t) => t !== tag));
  };

  const handleClearAll = () => {
    if (window.confirm("Are you sure you want to remove all liked questions, categories, and tags?")) {
      setLikedQuestionIDs([]);
      setLikedCategories([]);
      setLikedTags([]);
      // Clear all liked data from localStorage
      localStorage.removeItem("break-the-ice-liked-ids");
      localStorage.removeItem("break-the-ice-liked-categories");
      localStorage.removeItem("break-the-ice-liked-tags");
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
          {(likedQuestionIDs.length > 0 || likedCategories.length > 0 || likedTags.length > 0) && (
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

      {/* Liked Categories Section */}
      {likedCategories.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Folder className="h-5 w-5" />
            Liked Categories
          </h2>
          <div className="flex flex-wrap gap-2">
            {likedCategories.map((category) => (
              <Badge
                key={category}
                variant="secondary"
                className="flex items-center gap-2"
              >
                {category}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 p-0 hover:bg-destructive hover:text-destructive-foreground"
                  onClick={() => handleRemoveCategory(category)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Liked Tags Section */}
      {likedTags.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Tag className="h-5 w-5" />
            Liked Tags
          </h2>
          <div className="flex flex-wrap gap-2">
            {likedTags.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="flex items-center gap-2"
              >
                {tag}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 p-0 hover:bg-destructive hover:text-destructive-foreground"
                  onClick={() => handleRemoveTag(tag)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Liked Questions Section */}
      <div>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <FileQuestionIcon className="h-5 w-5" />
          Liked Questions
        </h2>
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
            onRemove={handleRemoveQuestion}
          />
        )}
      </div>
    </div>
  );
} 