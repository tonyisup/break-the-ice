import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Link } from "react-router-dom";
import { toast } from 'sonner';
import { Header } from "@/components/header";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export default function AddQuestionPage() {
  const [questionText, setQuestionText] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const addCustomQuestion = useMutation(api.core.questions.addCustomQuestion);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (questionText.trim() === "") {
      toast.error("Please enter a question.");
      return;
    }

    try {
      await addCustomQuestion({ customText: questionText, isPublic });
      setQuestionText("");
      if (isPublic) {
        toast.success("Question submitted for review!");
      } else {
        toast.success("Personal question added to your stash!");
      }
    } catch (error) {
      toast.error("Failed to submit question. Please try again.");
      console.error(error);
    }
  };

  return (
    <div className="container mx-auto p-4 pt-24 max-w-2xl">
      <Header />
      <h1 className="text-2xl font-bold mb-4">Add a Custom Question</h1>
      <div className="mb-6 space-y-2">
        <p className="text-gray-600 dark:text-gray-400">
          Add your own questions to the pool. You can choose to make them public for everyone to see (after review) or keep them in your personal stash.
        </p>
        <p className="text-sm">
          You can check the status of your questions on your{" "}
          <Link to="/liked" className="text-blue-500 hover:underline font-medium">
            Liked Questions
          </Link>{" "}
          page.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="question" className="text-lg">Your Question</Label>
          <textarea
            id="question"
            className="w-full h-40 p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-900 dark:border-gray-800"
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
            placeholder="What's on your mind?"
          />
        </div>

        <div className="flex items-center space-x-3 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border dark:border-gray-800">
          <Switch
            id="public-toggle"
            checked={isPublic}
            onCheckedChange={setIsPublic}
          />
          <div className="space-y-0.5">
            <Label htmlFor="public-toggle" className="text-base cursor-pointer">
              Available for public feed
            </Label>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {isPublic
                ? "Your question will be reviewed by our team before it is added to the public pool."
                : "This question will be exclusively for your personal stash."}
            </p>
          </div>
        </div>

        <button
          type="submit"
          className="w-full py-3 bg-blue-500 text-white rounded-lg font-bold hover:bg-blue-600 transition-colors shadow-sm"
        >
          {isPublic ? "Submit for Review" : "Add to My Stash"}
        </button>
      </form>
    </div>
  );
}
