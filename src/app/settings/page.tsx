"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  getBlockedCategories, saveBlockedCategory as saveBlockedCategory, removeBlockedCategory as removedBlockedCategory,
  getBlockedTags, saveBlockedTag as saveBlockedTag, removeBlockedTag,
  getDrawCount, saveDrawCount,
  getAutoGetMore, saveAutoGetMore
} from "~/lib/localStorage";
import { Button } from "~/components/ui/button";
import { ArrowLeft, Tag, Folder, FolderXIcon, FolderCheckIcon, SaveIcon, XIcon } from "lucide-react";
import { api } from "~/trpc/react";
import { Switch } from "~/components/ui/switch";
import { Label } from "~/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { SearchInput } from "~/components/SearchInput";
import { Slider } from "~/components/ui/slider";

export default function SettingsPage() {
  const router = useRouter();
  const [blockedCategories, setBlockedCategories] = useState<string[]>([]);
  const [blockedTags, setBlockedTags] = useState<string[]>([]);
  const [pendingBlockedCategories, setPendingBlockedCategories] = useState<string[]>([]);
  const [pendingBlockedTags, setPendingBlockedTags] = useState<string[]>([]);
  const [categorySearch, setCategorySearch] = useState("");
  const [tagSearch, setTagSearch] = useState("");
  const [drawCount, setDrawCount] = useState(5);
  const [pendingDrawCount, setPendingDrawCount] = useState(5);
  const [autoGetMore, setAutoGetMore] = useState(false);
  const [pendingAutoGetMore, setPendingAutoGetMore] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const { data: allCategories, isLoading: isLoadingCategories } = api.questions.getAllCategories.useQuery();
  const { data: allTags, isLoading: isLoadingTags } = api.questions.getAllTags.useQuery();

  useEffect(() => {
    // Load excluded data
    const categories = getBlockedCategories();
    const tags = getBlockedTags();
    const savedDrawCount = getDrawCount() ?? 5;
    const savedAutoGetMore = getAutoGetMore() ?? false;

    setBlockedCategories(categories);
    setPendingBlockedCategories(categories);
    setBlockedTags(tags);
    setPendingBlockedTags(tags);
    setDrawCount(savedDrawCount);
    setPendingDrawCount(savedDrawCount);
    setAutoGetMore(savedAutoGetMore);
    setPendingAutoGetMore(savedAutoGetMore);
    setHasChanges(false);
  }, []);

  useEffect(() => {
    const hasCategoryChanges = JSON.stringify(blockedCategories) !== JSON.stringify(pendingBlockedCategories);
    const hasTagChanges = JSON.stringify(blockedTags) !== JSON.stringify(pendingBlockedTags);
    const hasDrawCountChanges = drawCount !== pendingDrawCount;
    const hasAutoGetMoreChanges = autoGetMore !== pendingAutoGetMore;
    
    setHasChanges(hasCategoryChanges || hasTagChanges || hasDrawCountChanges || hasAutoGetMoreChanges);
  }, [blockedCategories, pendingBlockedCategories, blockedTags, pendingBlockedTags, drawCount, pendingDrawCount, autoGetMore, pendingAutoGetMore]);

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

  const handleDrawCountChange = (value: number[]) => {
    setPendingDrawCount(value[0] ?? 5);
  };

  const handleAutoGetMoreChange = (checked: boolean) => {
    setPendingAutoGetMore(checked);
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

    // Save draw settings
    saveDrawCount(pendingDrawCount);
    saveAutoGetMore(pendingAutoGetMore);

    // Update state
    setBlockedCategories(pendingBlockedCategories);
    setBlockedTags(pendingBlockedTags);
    setDrawCount(pendingDrawCount);
    setAutoGetMore(pendingAutoGetMore);
    setHasChanges(false);
  };

  const handleCancel = () => {
    setPendingBlockedCategories(blockedCategories);
    setPendingBlockedTags(blockedTags);
    setPendingDrawCount(drawCount);
    setPendingAutoGetMore(autoGetMore);
    setHasChanges(false);
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
          <Button disabled={!hasChanges} variant="outline" onClick={handleCancel}>
            <XIcon className="text-red-500 h-4 w-4" />
            Cancel
          </Button>
          <Button disabled={!hasChanges} onClick={handleSave}>
            <SaveIcon className="text-blue-500 h-4 w-4" />
            Save Changes
          </Button>
        </div>
      </div>

      <div className="grid gap-6">
        {/* Draw Count Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 justify-between">
              <div className="flex items-center gap-2">
                <Folder className="h-5 w-5" />
                Draw Settings
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-16 justify-between items-start">
              <div className="flex-1 flex flex-col items-center gap-2">
                <Slider
                  id="draw-count"
                  min={1}
                  step={1}
                  max={10}
                  value={[pendingDrawCount]}
                  onValueChange={handleDrawCountChange}
                />
                <Label htmlFor="draw-count">Draw {pendingDrawCount}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={pendingAutoGetMore}
                  onCheckedChange={handleAutoGetMoreChange}
                  id="auto-get-more"
                />
                <Label htmlFor="auto-get-more">Auto Draw</Label>
              </div>
            </div>
          </CardContent>
        </Card>


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
                  <Label htmlFor="block-all-categories">
                    Block all
                  </Label>                  
                  <Switch id="block-all-categories" checked={false} onClick={() => handleToggleAllCategories(false)} />
                  <Switch id="include-all-categories" checked={true} onClick={() => handleToggleAllCategories(true)} />
                  <Label htmlFor="include-all-categories">
                    Include all
                  </Label>
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
                  <Label htmlFor="block-all-tags">
                    Block all
                  </Label>                  
                  <Switch id="block-all-tags" checked={false} onClick={handleIncludeAllTags} />
                  <Switch id="include-all-tags" checked={true} onClick={handleExcludeAllTags} />
                  <Label htmlFor="include-all-tags">
                    Include all
                  </Label>
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