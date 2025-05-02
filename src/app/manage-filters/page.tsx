"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  getExcludedCategories, saveExcludedCategory, removeExcludedCategory,
  getExcludedTags, saveExcludedTag, removeExcludedTag
} from "~/lib/localStorage";
import { Button } from "~/components/ui/button";
import { ArrowLeft, Tag, Folder } from "lucide-react";
import { api } from "~/trpc/react";
import { Switch } from "~/components/ui/switch";
import { Label } from "~/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";

export default function ManageFiltersPage() {
  const router = useRouter();
  const [excludedCategories, setExcludedCategories] = useState<string[]>([]);
  const [excludedTags, setExcludedTags] = useState<string[]>([]);

  const { data: allCategories } = api.questions.getAllCategories.useQuery();
  const { data: allTags } = api.questions.getAllTags.useQuery();

  useEffect(() => {
    // Load excluded data
    const categories = getExcludedCategories();
    const tags = getExcludedTags();
    setExcludedCategories(categories);
    setExcludedTags(tags);
  }, []);

  const handleCategoryToggle = (category: string, checked: boolean) => {
    if (checked) {
      saveExcludedCategory(category);
      setExcludedCategories(prev => [...prev, category]);
    } else {
      removeExcludedCategory(category);
      setExcludedCategories(prev => prev.filter(c => c !== category));
    }
  };

  const handleTagToggle = (tag: string, checked: boolean) => {
    if (checked) {
      saveExcludedTag(tag);
      setExcludedTags(prev => [...prev, tag]);
    } else {
      removeExcludedTag(tag);
      setExcludedTags(prev => prev.filter(t => t !== tag));
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
      </div>

      <div className="grid gap-6">
        {/* Categories Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Folder className="h-5 w-5" />
              Categories
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              {allCategories?.map((category) => (
                <div key={category} className="flex items-center justify-between">
                  <Label htmlFor={`category-${category}`}>{category}</Label>
                  <Switch
                    id={`category-${category}`}
                    checked={excludedCategories.includes(category)}
                    onCheckedChange={(checked) => handleCategoryToggle(category, checked)}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Tags Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5" />
              Tags
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              {allTags?.map((tag) => (
                <div key={tag} className="flex items-center justify-between">
                  <Label htmlFor={`tag-${tag}`}>{tag}</Label>
                  <Switch
                    id={`tag-${tag}`}
                    checked={excludedTags.includes(tag)}
                    onCheckedChange={(checked) => handleTagToggle(tag, checked)}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
} 