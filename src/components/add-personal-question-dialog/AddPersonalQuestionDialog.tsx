import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface AddPersonalQuestionDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

export function AddPersonalQuestionDialog({
  isOpen,
  onOpenChange,
}: AddPersonalQuestionDialogProps) {
  const [questionText, setQuestionText] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const addPersonalQuestion = useMutation(api.core.questions.addPersonalQuestion);

  const handleSubmit = async () => {
    if (questionText.trim() === "") {
      toast.error("Question text cannot be empty.");
      return;
    }
    try {
      await addPersonalQuestion({ customText: questionText, isPublic });
      if (isPublic) {
        toast.success("Question submitted for review!");
      } else {
        toast.success("Personal question added to your stash!");
      }
      setQuestionText("");
      onOpenChange(false);
    } catch (error) {
      toast.error("Failed to add personal question.");
      console.error(error);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a New Personal Question</DialogTitle>
          <DialogDescription>
            Create a question to add to your collection.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="dialog-question">Your Question</Label>
            <Textarea
              id="dialog-question"
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              placeholder="Enter your question here..."
              className="min-h-[120px]"
            />
          </div>
          <div className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border dark:border-gray-800">
            <Switch
              id="dialog-public-toggle"
              checked={isPublic}
              onCheckedChange={setIsPublic}
            />
            <div className="space-y-0.5">
              <Label htmlFor="dialog-public-toggle" className="text-sm cursor-pointer">
                Available for public feed
              </Label>
              <p className="text-[10px] text-gray-500 dark:text-gray-400">
                {isPublic
                  ? "Will be reviewed before being added to the public pool."
                  : "Will be exclusively for your personal stash."}
              </p>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit}>{isPublic ? "Submit for Review" : "Add to Stash"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
