"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSkippedIds, removeSkippedQuestion, getSkippedCategories, getSkippedTags, removeSkippedCategory, removeSkippedTag} from "~/lib/localStorage";
import { QuestionGrid } from "~/app/_components/QuestionGrid";
import { Button } from "~/components/ui/button";
import { ArrowLeft, Trash2, Tag, Folder, X, FileQuestionIcon } from "lucide-react";
import { api } from "~/trpc/react";
import { Badge } from "~/components/ui/badge";

export default function ManageSkipsPage() {
  const router = useRouter();
  const [skippedQuestionIDs, setSkippedQuestionIDs] = useState<number[]>([]);
  const [skippedCategories, setSkippedCategories] = useState<string[]>([]);
  const [skippedTags, setSkippedTags] = useState<string[]>([]);
  const { data: skippedQuestions } = api.questions.getByIDs.useQuery({
    ids: skippedQuestionIDs
  });

  useEffect(() => {
    const questions = getSkippedIds();
    const categories = getSkippedCategories();
    const tags = getSkippedTags();
    setSkippedQuestionIDs(questions);
    setSkippedCategories(categories);
    setSkippedTags(tags);
  }, []);

  const handleRemoveQuestion = (id: number) => {
    removeSkippedQuestion(id);
    setSkippedQuestionIDs((prev) => prev.filter((q) => q !== id));
  };

  const handleRemoveCategory = (category: string) => {
    removeSkippedCategory(category);
    setSkippedCategories((prev) => prev.filter((c) => c !== category));
  };

  const handleRemoveTag = (tag: string) => {
    removeSkippedTag(tag);
    setSkippedTags((prev) => prev.filter((t) => t !== tag));
  };

  const handleClearAll = () => {
    if (window.confirm("Are you sure you want to remove all skipped questions, categories, and tags?")) {
      setSkippedQuestionIDs([]);
      setSkippedCategories([]);
      setSkippedTags([]);
      // Clear all skipped data from localStorage
      localStorage.removeItem("break-the-ice-skipped-ids");
      localStorage.removeItem("break-the-ice-skipped-categories");
      localStorage.removeItem("break-the-ice-skipped-tags");
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
          {(skippedQuestionIDs.length > 0 || skippedCategories.length > 0 || skippedTags.length > 0) && (
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

      {/* Skipped Categories Section */}
      {skippedCategories.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Folder className="h-5 w-5" />
            Skipped Categories
          </h2>
          <div className="flex flex-wrap gap-2">
            {skippedCategories.map((category) => (
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

      {/* Skipped Tags Section */}
      {skippedTags.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Tag className="h-5 w-5" />
            Skipped Tags
          </h2>
          <div className="flex flex-wrap gap-2">
            {skippedTags.map((tag) => (
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

      {/* Skipped Questions Section */}
      <div>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <FileQuestionIcon className="h-5 w-5" />
          Skipped Questions
        </h2>
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
            onRemove={handleRemoveQuestion}
          />
        )}
      </div>
    </div>
  );
} 