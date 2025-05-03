"use client";

import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Switch } from "~/components/ui/switch";
import { Label } from "~/components/ui/label";
import { Slider } from "~/components/ui/slider";
import { Folder } from "lucide-react";
import { getDrawCount, saveDrawCount, getAutoGetMore, saveAutoGetMore } from "~/lib/localStorage";

interface DrawSettingsProps {
  onHasChanges: (hasChanges: boolean) => void;
}

export interface DrawSettingsRef {
  save: () => void;
  cancel: () => void;
}

export const DrawSettings = forwardRef<DrawSettingsRef, DrawSettingsProps>(({ onHasChanges }, ref) => {
  const [drawCount, setDrawCount] = useState(5);
  const [pendingDrawCount, setPendingDrawCount] = useState(5);
  const [autoGetMore, setAutoGetMore] = useState(false);
  const [pendingAutoGetMore, setPendingAutoGetMore] = useState(false);

  useEffect(() => {
    const savedDrawCount = getDrawCount() ?? 5;
    const savedAutoGetMore = getAutoGetMore() ?? false;

    setDrawCount(savedDrawCount);
    setPendingDrawCount(savedDrawCount);
    setAutoGetMore(savedAutoGetMore);
    setPendingAutoGetMore(savedAutoGetMore);
  }, []);

  useEffect(() => {
    const hasDrawCountChanges = drawCount !== pendingDrawCount;
    const hasAutoGetMoreChanges = autoGetMore !== pendingAutoGetMore;
    onHasChanges(hasDrawCountChanges || hasAutoGetMoreChanges);
  }, [drawCount, pendingDrawCount, autoGetMore, pendingAutoGetMore, onHasChanges]);

  const handleDrawCountChange = (value: number[]) => {
    setPendingDrawCount(value[0] ?? 5);
  };

  const handleAutoGetMoreChange = (checked: boolean) => {
    setPendingAutoGetMore(checked);
  };

  const save = () => {
    saveDrawCount(pendingDrawCount);
    saveAutoGetMore(pendingAutoGetMore);
    setDrawCount(pendingDrawCount);
    setAutoGetMore(pendingAutoGetMore);
  };

  const cancel = () => {
    setPendingDrawCount(drawCount);
    setPendingAutoGetMore(autoGetMore);
  };

  useImperativeHandle(ref, () => ({
    save,
    cancel,
  }));

  return (
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
  );
});

DrawSettings.displayName = "DrawSettings"; 