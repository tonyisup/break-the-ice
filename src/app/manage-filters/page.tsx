"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  getBlockedCategories, saveBlockedCategory as saveBlockedCategory, removeBlockedCategory as removedBlockedCategory,
  getBlockedTags, saveBlockedTag as saveBlockedTag, removeBlockedTag
} from "~/lib/localStorage";
import { Button } from "~/components/ui/button";
import { ArrowLeft, Tag, Folder, FolderXIcon, FolderCheckIcon, SaveIcon, XIcon } from "lucide-react";
import { api } from "~/trpc/react";
import { Switch } from "~/components/ui/switch";
import { Label } from "~/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { SearchInput } from "~/components/SearchInput";

export default function ManageFiltersPage() {
  const router = useRouter();
  const [blockedCategories, setBlockedCategories] = useState<string[]>([]);
  const [blockedTags, setBlockedTags] = useState<string[]>([]);
  const [pendingBlockedCategories, setPendingBlockedCategories] = useState<string[]>([]);
  const [pendingBlockedTags, setPendingBlockedTags] = useState<string[]>([]);
  const [categorySearch, setCategorySearch] = useState("");
  const [tagSearch, setTagSearch] = useState("");

  const { data: allCategories, isLoading: isLoadingCategories } = api.questions.getAllCategories.useQuery();
  const { data: allTags, isLoading: isLoadingTags } = api.questions.getAllTags.useQuery();

  useEffect(() => {
    // Load excluded data
    const categories = getBlockedCategories();
    const tags = getBlockedTags();
    setBlockedCategories(categories);
    setPendingBlockedCategories(categories);
    setBlockedTags(tags);
    setPendingBlockedTags(tags);
  }, []);

  const handleCategoryToggle = (category: string, checked: boolean) => {
    if (checked) {
      setPendingBlockedCategories(prev => [...prev, category]);
    } else {
      setPendingBlockedCategories(prev => prev.filter(c => c !== category));
    }
  };

  const handleTagToggle = (tag: string, checked: boolean) => {
    if (checked) {
      setPendingBlockedTags(prev => [...prev, tag]);
    } else {
      setPendingBlockedTags(prev => prev.filter(t => t !== tag));
    }
  };

  const handleToggleAllCategories = (checked: boolean) => {
    if (checked) {
      setPendingBlockedCategories([]);
    } else {
      setPendingBlockedCategories(allCategories ?? []);
    }
  };

  const handleIncludeAllTags = () => {
    setPendingBlockedTags([]);
  };

  const handleExcludeAllTags = () => {
    setPendingBlockedTags(allTags ?? []);
  };

  const handleSave = () => {
    // Save categories
    const categoriesToRemove = blockedCategories.filter(category => !pendingBlockedCategories.includes(category));
    const categoriesToAdd = pendingBlockedCategories.filter(category => !blockedCategories.includes(category));

    categoriesToRemove.forEach(category => {
      removedBlockedCategory(category);
    });
    categoriesToAdd.forEach(category => {
      saveBlockedCategory(category);
    });

    // Save tags
    const tagsToRemove = blockedTags.filter(tag => !pendingBlockedTags.includes(tag));
    const tagsToAdd = pendingBlockedTags.filter(tag => !blockedTags.includes(tag));

    tagsToRemove.forEach(tag => {
      removeBlockedTag(tag);
    });
    tagsToAdd.forEach(tag => {
      saveBlockedTag(tag);
    });

    // Update state
    setBlockedCategories(pendingBlockedCategories);
    setBlockedTags(pendingBlockedTags);
  };

  const handleCancel = () => {
    setPendingBlockedCategories(blockedCategories);
    setPendingBlockedTags(blockedTags);
  };

  const hasChanges = () => {
    return (
      JSON.stringify(blockedCategories) !== JSON.stringify(pendingBlockedCategories) ||
      JSON.stringify(blockedTags) !== JSON.stringify(pendingBlockedTags)
    );
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
        <div className="flex gap-2">
          <Button disabled={!hasChanges()} variant="outline" onClick={handleCancel}>
            <XIcon className="text-red-500 h-4 w-4" />
            Cancel
          </Button>
          <Button disabled={!hasChanges()} onClick={handleSave}>
            <SaveIcon className="text-blue-500 h-4 w-4" />
            Save Changes
          </Button>
        </div>

      </div>

      <div className="grid gap-6">
        {/* Categories Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 justify-between">
              <div className="flex items-center gap-2">
                <Folder className="h-5 w-5" />
                Categories
              </div>
              {!isLoadingCategories && <div className="flex items-center gap-2">
                to
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
                    checked={!pendingBlockedCategories.includes(category)}
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
                Tags
              </div>
              {!isLoadingTags && <div className="flex items-center gap-2">
                to
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
                    checked={!pendingBlockedTags.includes(tag)}
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