"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  getBlockedCategories, saveBlockedCategory as saveBlockedCategory, removeBlockedCategory as removedBlockedCategory,
  getBlockedTags, saveBlockedTag as saveBlockedTag, removeBlockedTag
} from "~/lib/localStorage";
import { Button } from "~/components/ui/button";
import { ArrowLeft, Tag, Folder, FolderXIcon, FolderCheckIcon } from "lucide-react";
import { api } from "~/trpc/react";
import { Switch } from "~/components/ui/switch";
import { Label } from "~/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { SearchInput } from "~/components/SearchInput";

export default function ManageFiltersPage() {
  const router = useRouter();
  const [blockedCategories, setBlockedCategories] = useState<string[]>([]);
  const [blockedTags, setBlockedTags] = useState<string[]>([]);
  const [categorySearch, setCategorySearch] = useState("");
  const [tagSearch, setTagSearch] = useState("");

  const { data: allCategories, isLoading: isLoadingCategories } = api.questions.getAllCategories.useQuery();
  const { data: allTags, isLoading: isLoadingTags } = api.questions.getAllTags.useQuery();

  useEffect(() => {
    // Load excluded data
    const categories = getBlockedCategories();
    const tags = getBlockedTags();
    setBlockedCategories(categories);
    setBlockedTags(tags);
  }, []);

  const handleCategoryToggle = (category: string, checked: boolean) => {
    if (checked) {
      saveBlockedCategory(category);
      setBlockedCategories(prev => [...prev, category]);
    } else {
      removedBlockedCategory(category);
      setBlockedCategories(prev => prev.filter(c => c !== category));
    }
  };

  const handleTagToggle = (tag: string, checked: boolean) => {
    if (checked) {
      saveBlockedTag(tag);
      setBlockedTags(prev => [...prev, tag]);
    } else {
      removeBlockedTag(tag);
      setBlockedTags(prev => prev.filter(t => t !== tag));
    }
  };

  const handleToggleAllCategories = (checked: boolean) => {
    if (checked) {
      // If we're including by default, remove all categories from excluded list
      allCategories?.forEach(category => {
        saveBlockedCategory(category);
      });
      setBlockedCategories(allCategories ?? []);
    } else {
      // If we're excluding by default, add all categories to excluded list
      allCategories?.forEach(category => {
        removedBlockedCategory(category);
      });
      setBlockedCategories([]);
    }
  };

  const handleIncludeAllTags = () => {
    allTags?.forEach(tag => {
      removeBlockedTag(tag);
    });
    setBlockedTags([]);
  };

  const handleExcludeAllTags = () => {
    allTags?.forEach(tag => {
      saveBlockedTag(tag);
    });
    setBlockedTags(allTags ?? []);
  };

  const filteredCategories = allCategories?.filter(category =>
    category.toLowerCase().includes(categorySearch.toLowerCase())
  ) ?? [];

  const filteredTags = allTags?.filter(tag =>
    tag.toLowerCase().includes(tagSearch.toLowerCase())
  ) ?? [];

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
            <CardTitle className="flex items-center gap-2 justify-between">
              <div className="flex items-center gap-2">
                <Folder className="h-5 w-5" />
                Categories to
              </div>
              {!isLoadingCategories && <div className="flex items-center gap-2">
                <span className="pl-2 text-xs text-muted-foreground">block</span>
                <Switch noCursor checked={true} />
                <span className="text-xs">include</span>
              </div>}
              {isLoadingCategories && (
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent" />
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!isLoadingCategories && (
              <div className="mb-4 gap-4 flex items-center justify-between">
                <SearchInput
                  onSearch={setCategorySearch}
                  placeholder="Search categories..."
                  delay={300}
                />
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => handleToggleAllCategories(false)}>
                    Block all
                    <Switch checked={false} />
                  </Button>
                  <Button variant="outline" onClick={() => handleToggleAllCategories(true)}>
                    <Switch checked={true} />
                    Include all
                  </Button>
                </div>
              </div>
            )}
            <div className="grid gap-4">
              {filteredCategories.map((category) => (
                <div key={category} className="flex items-center justify-between">
                  <Label htmlFor={`category-${category}`}>{category}</Label>
                  <Switch
                    id={`category-${category}`}
                    checked={!blockedCategories.includes(category)}
                    onCheckedChange={(checked) => handleCategoryToggle(category, !checked)}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Tags Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 justify-between">
              <div className="flex items-center gap-2">
                <Tag className="h-5 w-5" />
                Tags to
              </div>
              {!isLoadingTags && <div className="flex items-center gap-2">
                <span className="pl-2 text-xs text-muted-foreground">block</span>
                <Switch noCursor checked={true} />
                <span className="text-xs">include</span>
              </div>}
              {isLoadingTags && (
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent" />
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!isLoadingTags && (
              <div className="mb-4 gap-4 flex items-center justify-between">
              <SearchInput
                onSearch={setTagSearch}
                placeholder="Search tags..."
                delay={300}
              />
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={handleIncludeAllTags}>
                    Block all
                    <Switch checked={false} />
                  </Button>
                  <Button variant="outline" onClick={handleExcludeAllTags}>
                    <Switch checked={true} />
                    Include all
                  </Button>
                </div>
              </div>
            )}
            <div className="grid gap-4">
              {filteredTags.map((tag) => (
                <div key={tag} className="flex items-center justify-between">
                  <Label htmlFor={`tag-${tag}`}>{tag}</Label>
                  <Switch
                    id={`tag-${tag}`}
                    checked={!blockedTags.includes(tag)}
                    onCheckedChange={(checked) => handleTagToggle(tag, !checked)}
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