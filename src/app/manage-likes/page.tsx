"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { QuestionGrid } from "~/app/_components/QuestionGrid";
import { Button } from "~/components/ui/button";
import { ArrowLeft, Trash2, Tag, Folder, X, FileQuestionIcon } from "lucide-react";
import { api } from "~/trpc/react";
import { Badge } from "~/components/ui/badge";
import { useCardStack } from "~/app/_components/hooks/useCardStack";

export default function ManageLikesPage() {
  const router = useRouter();

  const {
    likes,
    likeCategories,
    likeTags,
    removeLikedQuestion,
    removeLikedCategory,
    removeLikedTag,
    clearLikedQuestions,
    clearLikedCategories,
    clearLikedTags
  } = useCardStack({
    drawCountDefault: 5,
    autoGetMoreDefault: false,
    advancedMode: false,
    initialQuestions: [],
    handleInspectCard: () => {}
  });

  const { data: likedQuestions } = api.questions.getByIDs.useQuery({
    ids: likes
  });

  const handleRemoveQuestion = (id: number) => {
    removeLikedQuestion(id);
  };

  const handleRemoveCategory = (category: string) => {
    removeLikedCategory(category);
  };

  const handleRemoveTag = (tag: string) => {
    removeLikedTag(tag);
  };

  const handleClearAll = () => {
    if (window.confirm("Are you sure you want to remove all liked questions, categories, and tags?")) {
      clearLikedQuestions();
      clearLikedCategories();
      clearLikedTags();
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
            {likes.length} liked questions
          </span>
          {(likes.length > 0 || likeCategories.length > 0 || likeTags.length > 0) && (
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
      {likeCategories.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Folder className="h-5 w-5" />
            Liked Categories
          </h2>
          <div className="flex flex-wrap gap-2">
            {likeCategories.map((category) => (
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
      {likeTags.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Tag className="h-5 w-5" />
            Liked Tags
          </h2>
          <div className="flex flex-wrap gap-2">
            {likeTags.map((tag) => (
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
        {likes.length === 0 ? (
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