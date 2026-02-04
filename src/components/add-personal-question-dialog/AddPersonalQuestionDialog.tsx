import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface AddPersonalQuestionDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

export function AddPersonalQuestionDialog({
  isOpen,
  onOpenChange,
}: AddPersonalQuestionDialogProps) {
  const [questionText, setQuestionText] = useState("");
  const addPersonalQuestion = useMutation(api.core.questions.addPersonalQuestion);

  const handleSubmit = async () => {
    if (questionText.trim() === "") {
      toast.error("Question text cannot be empty.");
      return;
    }
    try {
      await addPersonalQuestion({ customText: questionText });
      toast.success("Personal question added!");
      setQuestionText("");
      onOpenChange(false);
    } catch (error) {
      toast.error("Failed to add personal question.");
      console.error(error);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a New Personal Question</DialogTitle>
        </DialogHeader>
        <Textarea
          value={questionText}
          onChange={(e) => setQuestionText(e.target.value)}
          placeholder="Enter your question here..."
        />
        <DialogFooter>
          <Button onClick={handleSubmit}>Submit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
