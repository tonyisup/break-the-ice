import { AIQuestionGenerator } from "@/components/ai-question-generator/ai-question-generator";
import { Doc } from "@convex/_generated/dataModel";
import { toast } from "sonner";

export const AdminPage = () => {
  const handleQuestionGenerated = (question: Doc<"questions">) => {
    toast.success(`Question ${question._id} generated`);
  };

  const handleClose = () => {
    toast("closed");
  };

  return (
    <AIQuestionGenerator
      onQuestionGenerated={handleQuestionGenerated}
      onClose={handleClose}
    />
  );
};