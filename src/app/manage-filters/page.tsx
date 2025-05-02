"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  getExcludedCategories, saveExcludedCategory, removeExcludedCategory,
  getExcludedTags, saveExcludedTag, removeExcludedTag,
  getIncludeByDefault
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
  const [excludedCategories, setExcludedCategories] = useState<string[]>([]);
  const [excludedTags, setExcludedTags] = useState<string[]>([]);
  const [categorySearch, setCategorySearch] = useState("");
  const [tagSearch, setTagSearch] = useState("");
  const [includeByDefault, setIncludeByDefault] = useState(true);

  const { data: allCategories, isLoading: isLoadingCategories } = api.questions.getAllCategories.useQuery();
  const { data: allTags, isLoading: isLoadingTags } = api.questions.getAllTags.useQuery();

  useEffect(() => {
    // Load excluded data
    const categories = getExcludedCategories();
    const tags = getExcludedTags();
    setExcludedCategories(categories);
    setExcludedTags(tags);
    setIncludeByDefault(getIncludeByDefault());
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

  const filteredCategories = allCategories?.filter(category =>
    category.toLowerCase().includes(categorySearch.toLowerCase())
  ) ?? [];

  const filteredTags = allTags?.filter(tag =>
    tag.toLowerCase().includes(tagSearch.toLowerCase())
  ) ?? [];

  const handleIncludeByDefaultToggle = (checked: boolean) => {
    if (checked) {
      // If we're including by default, remove all categories from excluded list
      allCategories?.forEach(category => {
        saveExcludedCategory(category);
      });
      setExcludedCategories(allCategories ?? []);
    } else {
      // If we're excluding by default, add all categories to excluded list
      allCategories?.forEach(category => {
        removeExcludedCategory(category);
      });
      setExcludedCategories([]);
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
            <CardTitle className="flex items-center gap-2 justify-between">
              <div className="flex items-center gap-2">
                <Folder className="h-5 w-5" />
                Categories to
              </div>
              {!isLoadingCategories && <div className="flex items-center gap-2">                
                <span className="pl-2 text-xs text-muted-foreground">include</span>
                <Switch checked={true} />
                <span className="text-xs">exclude</span>
              </div>}
              {isLoadingCategories && (
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent" />
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>

            {!isLoadingCategories &&
              <div className="mb-4">
                <SearchInput
                  onSearch={setCategorySearch}
                  placeholder="Search categories..."
                  delay={300}
                />
              </div>
            }
            <div className="grid gap-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="exclude-all-categories">Exclude all categories</Label>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" onClick={() => handleIncludeByDefaultToggle(false)}>
                    <FolderCheckIcon className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => handleIncludeByDefaultToggle(true)}>
                    <FolderXIcon className="h-4 w-4" />
                  </Button>
                </div>

              </div>
              {filteredCategories.map((category) => (
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
            <CardTitle className="flex items-center gap-2 justify-between">
              <div className="flex items-center gap-2">
                <Tag className="h-5 w-5" />
                Tags
              </div>
              {isLoadingTags && (
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent" />
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <SearchInput
                onSearch={setTagSearch}
                placeholder="Search tags..."
                delay={300}
              />
            </div>
            <div className="grid gap-4">
              {filteredTags.map((tag) => (
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