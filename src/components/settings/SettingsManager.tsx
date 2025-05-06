"use client";

import { useState, useRef } from "react";
import { TagsSettings } from "./TagsSettings";
import { SettingsActions } from "./SettingsActions";
import ScrollToTop from "~/app/_components/ScrollToTop";

interface SettingsManagerProps {
  allTags: string[];
}

export function SettingsManager({ allTags }: SettingsManagerProps) {
  const [hasDrawChanges, setHasDrawChanges] = useState(false);
  const [hasTagChanges, setHasTagChanges] = useState(false);

  // Use refs to store the save/cancel handlers
  const drawSettingsRef = useRef<{ save: () => void; cancel: () => void } | null>(null);
  const tagsSettingsRef = useRef<{ save: () => void; cancel: () => void } | null>(null);

  const hasChanges = hasDrawChanges || hasTagChanges;

  const handleSave = () => {
    // Call save on all components
    drawSettingsRef.current?.save();
    tagsSettingsRef.current?.save();
    
    // Reset change states
    setHasDrawChanges(false);
    setHasTagChanges(false);
  };

  const handleCancel = () => {
    // Call cancel on all components
    drawSettingsRef.current?.cancel();
    tagsSettingsRef.current?.cancel();
    
    // Reset change states
    setHasDrawChanges(false);
    setHasTagChanges(false);
  };

  return (
    <div className="grid gap-6">
      <SettingsActions
        hasChanges={hasChanges}
        onSave={handleSave}
        onCancel={handleCancel}
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