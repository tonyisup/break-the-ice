import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Link } from "react-router-dom";
import { Toaster, toast } from 'sonner';
import { Header } from "@/components/header";

export default function AddQuestionPage() {
  const [questionText, setQuestionText] = useState("");
  const addCustomQuestion = useMutation(api.core.questions.addCustomQuestion);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (questionText.trim() === "") {
      toast.error("Please enter a question.");
      return;
    }

    try {
      await addCustomQuestion({ customText: questionText });
      setQuestionText("");
      toast.success("Your question has been submitted for review!");
    } catch (error) {
      toast.error("Failed to submit question. Please try again.");
      console.error(error);
    }
  };

  return (
    <div className="container mx-auto p-4 pt-24">
      <Toaster />
      <Header />
      <h1 className="text-2xl font-bold mb-4">Add a Custom Question</h1>
      <p className="mb-4">
        Your question will be reviewed by our team before it is added to the public pool.
        You can check the status of your submitted questions on your{" "}
        <Link to="/liked" className="text-blue-500 hover:underline">
          Liked Questions
        </Link>{" "}
        page.
      </p>
      <form onSubmit={handleSubmit}>
        <textarea
          className="w-full h-40 p-2 border rounded"
          value={questionText}
          onChange={(e) => setQuestionText(e.target.value)}
          placeholder="Enter your question here..."
        />
        <button
          type="submit"
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Submit Question
        </button>
      </form>
    </div>
  );
}
