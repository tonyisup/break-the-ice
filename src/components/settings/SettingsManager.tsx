"use client";

import { useState, useRef } from "react";
import { DrawSettings } from "./DrawSettings";
import { CategoriesSettings } from "./CategoriesSettings";
import { TagsSettings } from "./TagsSettings";
import { SettingsActions } from "./SettingsActions";
import ScrollToTop from "~/app/_components/ScrollToTop";

interface SettingsManagerProps {
  allCategories: string[];
  allTags: string[];
}

export function SettingsManager({ allCategories, allTags }: SettingsManagerProps) {
  const [hasDrawChanges, setHasDrawChanges] = useState(false);
  const [hasCategoryChanges, setHasCategoryChanges] = useState(false);
  const [hasTagChanges, setHasTagChanges] = useState(false);

  // Use refs to store the save/cancel handlers
  const drawSettingsRef = useRef<{ save: () => void; cancel: () => void } | null>(null);
  const categoriesSettingsRef = useRef<{ save: () => void; cancel: () => void } | null>(null);
  const tagsSettingsRef = useRef<{ save: () => void; cancel: () => void } | null>(null);

  const hasChanges = hasDrawChanges || hasCategoryChanges || hasTagChanges;

  const handleSave = () => {
    // Call save on all components
    drawSettingsRef.current?.save();
    categoriesSettingsRef.current?.save();
    tagsSettingsRef.current?.save();
    
    // Reset change states
    setHasDrawChanges(false);
    setHasCategoryChanges(false);
    setHasTagChanges(false);
  };

  const handleCancel = () => {
    // Call cancel on all components
    drawSettingsRef.current?.cancel();
    categoriesSettingsRef.current?.cancel();
    tagsSettingsRef.current?.cancel();
    
    // Reset change states
    setHasDrawChanges(false);
    setHasCategoryChanges(false);
    setHasTagChanges(false);
  };

  return (
    <div className="grid gap-6">
      <SettingsActions
        hasChanges={hasChanges}
        onSave={handleSave}
        onCancel={handleCancel}
      />
      <DrawSettings 
        onHasChanges={setHasDrawChanges} 
        ref={drawSettingsRef}
      />
      <CategoriesSettings 
        allCategories={allCategories} 
        onHasChanges={setHasCategoryChanges} 
        ref={categoriesSettingsRef}
      />
      <ScrollToTop />
      <TagsSettings 
        allTags={allTags} 
        onHasChanges={setHasTagChanges} 
        ref={tagsSettingsRef}
      />
    </div>
  );
} 