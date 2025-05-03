"use client";

import { useState, useEffect, useMemo, forwardRef, useImperativeHandle } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Switch } from "~/components/ui/switch";
import { Label } from "~/components/ui/label";
import { Folder } from "lucide-react";
import { SearchInput } from "~/components/SearchInput";
import { getBlockedCategories, saveBlockedCategory, removeBlockedCategory } from "~/lib/localStorage";

interface CategoriesSettingsProps {
  allCategories: string[];
  onHasChanges: (hasChanges: boolean) => void;
}

export interface CategoriesSettingsRef {
  save: () => void;
  cancel: () => void;
}

export const CategoriesSettings = forwardRef<CategoriesSettingsRef, CategoriesSettingsProps>(
  ({ allCategories, onHasChanges }, ref) => {
    const [blockedCategories, setBlockedCategories] = useState<string[]>([]);
    const [pendingBlockedCategories, setPendingBlockedCategories] = useState<string[]>([]);
    const [categorySearch, setCategorySearch] = useState("");

    useEffect(() => {
      const categories = getBlockedCategories();
      setBlockedCategories(categories);
      setPendingBlockedCategories(categories);
    }, []);

    useEffect(() => {
      const hasCategoryChanges =
        blockedCategories.length !== pendingBlockedCategories.length ||
        blockedCategories.some(cat => !pendingBlockedCategories.includes(cat)) ||
        pendingBlockedCategories.some(cat => !blockedCategories.includes(cat));
      onHasChanges(hasCategoryChanges);
    }, [blockedCategories, pendingBlockedCategories, onHasChanges]);

    const handleCategoryToggle = (category: string, checked: boolean) => {
      if (checked) {
        setPendingBlockedCategories(prev => [...prev, category]);
      } else {
        setPendingBlockedCategories(prev => prev.filter(c => c !== category));
      }
    };

    const handleToggleAllCategories = (checked: boolean) => {
      if (checked) {
        setPendingBlockedCategories([]);
      } else {
        setPendingBlockedCategories(allCategories);
      }
    };

    const save = () => {
      const categoriesToRemove = blockedCategories.filter(category => !pendingBlockedCategories.includes(category));
      const categoriesToAdd = pendingBlockedCategories.filter(category => !blockedCategories.includes(category));

      categoriesToRemove.forEach(category => {
        removeBlockedCategory(category);
      });
      categoriesToAdd.forEach(category => {
        saveBlockedCategory(category);
      });

      setBlockedCategories(pendingBlockedCategories);
    };

    const cancel = () => {
      setPendingBlockedCategories(blockedCategories);
    };

    useImperativeHandle(ref, () => ({
      save,
      cancel,
    }));

    const filteredCategories = useMemo(() =>
      allCategories.filter(category =>
        category.toLowerCase().includes(categorySearch.toLowerCase())
      ),
      [allCategories, categorySearch]
    );

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 justify-between">
            <div className="flex items-center gap-2">
              <Folder className="h-5 w-5" />
              Categories
            </div>
            <div className="flex items-center gap-2">
              to
              <span className="pl-2 text-xs text-muted-foreground">block</span>
              <Switch noCursor checked={true} />
              <span className="text-xs">include</span>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 gap-4 flex items-center justify-between">
            <SearchInput
              id="category-search"
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
    );
  }
); 