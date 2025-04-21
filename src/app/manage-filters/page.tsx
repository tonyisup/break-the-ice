"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  getSkippedIds, removeSkippedQuestion, getSkippedCategories, getSkippedTags, removeSkippedCategory, removeSkippedTag,
  getLikedIds, removeLikedQuestion, getLikedCategories, getLikedTags, removeLikedCategory, removeLikedTag
} from "~/lib/localStorage";
import { QuestionGrid } from "~/app/_components/QuestionGrid";
import { Button } from "~/components/ui/button";
import { ArrowLeft, Trash2, Tag, Folder, X, FileQuestionIcon, Heart } from "lucide-react";
import { api } from "~/trpc/react";
import { Badge } from "~/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";

import type { Question as PrismaQuestion, Tag as QuestionTag } from "@prisma/client";

type Question = PrismaQuestion & {
  tags: Array<{
    tag: QuestionTag;
  }>;
};

export default function ManageFiltersPage() {
  const router = useRouter();
  const [skippedQuestionIDs, setSkippedQuestionIDs] = useState<number[]>([]);
  const [skippedCategories, setSkippedCategories] = useState<string[]>([]);
  const [skippedTags, setSkippedTags] = useState<string[]>([]);
  const [likedQuestionIDs, setLikedQuestionIDs] = useState<number[]>([]);
  const [likedCategories, setLikedCategories] = useState<string[]>([]);
  const [likedTags, setLikedTags] = useState<string[]>([]);

  const { data: skippedQuestions } = api.questions.getByIDs.useQuery({
    ids: skippedQuestionIDs
  });

  const { data: likedQuestions } = api.questions.getByIDs.useQuery({
    ids: likedQuestionIDs
  });

  useEffect(() => {
    // Load skipped data
    const questions = getSkippedIds();
    const categories = getSkippedCategories();
    const tags = getSkippedTags();
    setSkippedQuestionIDs(questions);
    setSkippedCategories(categories);
    setSkippedTags(tags);

    // Load liked data
    const likedQs = getLikedIds();
    const likedCats = getLikedCategories();
    const likedTgs = getLikedTags();
    setLikedQuestionIDs(likedQs);
    setLikedCategories(likedCats);
    setLikedTags(likedTgs);
  }, []);

  const handleRemoveSkippedQuestion = (id: number) => {
    removeSkippedQuestion(id);
    setSkippedQuestionIDs((prev) => prev.filter((q) => q !== id));
  };

  const handleRemoveSkippedCategory = (category: string) => {
    removeSkippedCategory(category);
    setSkippedCategories((prev) => prev.filter((c) => c !== category));
  };

  const handleRemoveSkippedTag = (tag: string) => {
    removeSkippedTag(tag);
    setSkippedTags((prev) => prev.filter((t) => t !== tag));
  };

  const handleRemoveLikedQuestion = (id: number) => {
    removeLikedQuestion(id);
    setLikedQuestionIDs((prev) => prev.filter((q) => q !== id));
  };

  const handleRemoveLikedCategory = (category: string) => {
    removeLikedCategory(category);
    setLikedCategories((prev) => prev.filter((c) => c !== category));
  };

  const handleRemoveLikedTag = (tag: string) => {
    removeLikedTag(tag);
    setLikedTags((prev) => prev.filter((t) => t !== tag));
  };

  const handleClearAll = (type: 'skips' | 'likes') => {
    if (window.confirm(`Are you sure you want to remove all ${type}?`)) {
      if (type === 'skips') {
        setSkippedQuestionIDs([]);
        setSkippedCategories([]);
        setSkippedTags([]);
        localStorage.removeItem("break-the-ice-skipped-ids");
        localStorage.removeItem("break-the-ice-skipped-categories");
        localStorage.removeItem("break-the-ice-skipped-tags");
      } else {
        setLikedQuestionIDs([]);
        setLikedCategories([]);
        setLikedTags([]);
        localStorage.removeItem("break-the-ice-liked-ids");
        localStorage.removeItem("break-the-ice-liked-categories");
        localStorage.removeItem("break-the-ice-liked-tags");
      }
    }
  };

  const FilterSection = ({ 
    type, 
    questionIDs, 
    categories, 
    tags, 
    questions, 
    onRemoveQuestion, 
    onRemoveCategory, 
    onRemoveTag 
  }: {
    type: 'skips' | 'likes';
    questionIDs: number[];
    categories: string[];
    tags: string[];
    questions?: Question[];
    onRemoveQuestion: (id: number) => void;
    onRemoveCategory: (category: string) => void;
    onRemoveTag: (tag: string) => void;
  }) => (
    <div>
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
            {questionIDs.length} {type === 'skips' ? 'skipped' : 'liked'} questions
          </span>
          {(questionIDs.length > 0 || categories.length > 0 || tags.length > 0) && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => handleClearAll(type)}
              className="flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Clear All
            </Button>
          )}
        </div>
      </div>

      {/* Categories Section */}
      {categories.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Folder className="h-5 w-5" />
            {type === 'skips' ? 'Skipped' : 'Liked'} Categories
          </h2>
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
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
                  onClick={() => onRemoveCategory(category)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Tags Section */}
      {tags.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Tag className="h-5 w-5" />
            {type === 'skips' ? 'Skipped' : 'Liked'} Tags
          </h2>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
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
                  onClick={() => onRemoveTag(tag)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Questions Section */}
      <div>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <FileQuestionIcon className="h-5 w-5" />
          {type === 'skips' ? 'Skipped' : 'Liked'} Questions
        </h2>
        {questionIDs.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-lg text-muted-foreground">
              You haven&apos;t {type === 'skips' ? 'skipped' : 'liked'} any questions yet.
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
          questions && <QuestionGrid
            questions={questions}
            type={type}
            onRemove={onRemoveQuestion}
          />
        )}
      </div>
    </div>
  );

  return (
    <div className="container mx-auto py-8 px-4">
      <Tabs defaultValue="skips" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="skips" className="flex items-center gap-2">
            <X className="h-4 w-4" />
            Skips
          </TabsTrigger>
          <TabsTrigger value="likes" className="flex items-center gap-2">
            <Heart className="h-4 w-4" />
            Likes
          </TabsTrigger>
        </TabsList>
        <TabsContent value="skips">
          <FilterSection
            type="skips"
            questionIDs={skippedQuestionIDs}
            categories={skippedCategories}
            tags={skippedTags}
            questions={skippedQuestions}
            onRemoveQuestion={handleRemoveSkippedQuestion}
            onRemoveCategory={handleRemoveSkippedCategory}
            onRemoveTag={handleRemoveSkippedTag}
          />
        </TabsContent>
        <TabsContent value="likes">
          <FilterSection
            type="likes"
            questionIDs={likedQuestionIDs}
            categories={likedCategories}
            tags={likedTags}
            questions={likedQuestions}
            onRemoveQuestion={handleRemoveLikedQuestion}
            onRemoveCategory={handleRemoveLikedCategory}
            onRemoveTag={handleRemoveLikedTag}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
} 