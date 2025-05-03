"use client";

import { useState, useEffect, useMemo, forwardRef, useImperativeHandle } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Switch } from "~/components/ui/switch";
import { Label } from "~/components/ui/label";
import { Tag } from "lucide-react";
import { SearchInput } from "~/components/SearchInput";
import { getBlockedTags, saveBlockedTag, removeBlockedTag } from "~/lib/localStorage";

interface TagsSettingsProps {
  allTags: string[];
  onHasChanges: (hasChanges: boolean) => void;
}

export interface TagsSettingsRef {
  save: () => void;
  cancel: () => void;
}

export const TagsSettings = forwardRef<TagsSettingsRef, TagsSettingsProps>(
  ({ allTags, onHasChanges }, ref) => {
    const [blockedTags, setBlockedTags] = useState<string[]>([]);
    const [pendingBlockedTags, setPendingBlockedTags] = useState<string[]>([]);
    const [tagSearch, setTagSearch] = useState("");

    useEffect(() => {
      const tags = getBlockedTags();
      setBlockedTags(tags);
      setPendingBlockedTags(tags);
    }, []);

    useEffect(() => {
      const hasTagChanges =
        blockedTags.length !== pendingBlockedTags.length ||
        blockedTags.some(tag => !pendingBlockedTags.includes(tag)) ||
        pendingBlockedTags.some(tag => !blockedTags.includes(tag));
      onHasChanges(hasTagChanges);
    }, [blockedTags, pendingBlockedTags, onHasChanges]);

    const handleTagToggle = (tag: string, checked: boolean) => {
      if (checked) {
        setPendingBlockedTags(prev => [...prev, tag]);
      } else {
        setPendingBlockedTags(prev => prev.filter(t => t !== tag));
      }
    };

    const handleIncludeAllTags = () => {
      setPendingBlockedTags([]);
    };

    const handleBlockAllTags = () => {
      setPendingBlockedTags(allTags);
    };

    const save = () => {
      const tagsToRemove = blockedTags.filter(tag => !pendingBlockedTags.includes(tag));
      const tagsToAdd = pendingBlockedTags.filter(tag => !blockedTags.includes(tag));

      tagsToRemove.forEach(tag => {
        removeBlockedTag(tag);
      });
      tagsToAdd.forEach(tag => {
        saveBlockedTag(tag);
      });

      setBlockedTags(pendingBlockedTags);
    };

    const cancel = () => {
      setPendingBlockedTags(blockedTags);
    };

    useImperativeHandle(ref, () => ({
      save,
      cancel,
    }));

    const filteredTags = useMemo(() =>
      allTags.filter(tag =>
        tag.toLowerCase().includes(tagSearch.toLowerCase())
      ),
      [allTags, tagSearch]
    );

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 justify-between">
            <div className="flex items-center gap-2">
              <Tag className="h-5 w-5" />
              Tags
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
              id="tag-search"
              onSearch={setTagSearch}
              placeholder="Search tags..."
              delay={300}
            />
            <div className="flex items-center gap-2">                  
              <Label htmlFor="block-all-tags">
                Block all
              </Label>                  
              <Switch id="block-all-tags" checked={false} onClick={handleBlockAllTags} />
              <Switch id="include-all-tags" checked={true} onClick={handleIncludeAllTags} />
              <Label htmlFor="include-all-tags">
                Include all
              </Label>
            </div>
          </div>
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
    );
  }
);

TagsSettings.displayName = "TagsSettings"; 