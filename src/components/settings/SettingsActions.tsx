"use client";

import { Button } from "~/components/ui/button";
import { SaveIcon, XIcon } from "lucide-react";

interface SettingsActionsProps {
  hasChanges: boolean;
  onSave: () => void;
  onCancel: () => void;
}

export function SettingsActions({ hasChanges, onSave, onCancel }: SettingsActionsProps) {
  return (
    <div className="flex gap-2">
      <Button disabled={!hasChanges} variant="outline" onClick={onCancel}>
        <XIcon className="text-red-500 h-4 w-4" />
        Cancel
      </Button>
      <Button disabled={!hasChanges} onClick={onSave}>
        <SaveIcon className="text-blue-500 h-4 w-4" />
        Save Changes
      </Button>
    </div>
  );
} 