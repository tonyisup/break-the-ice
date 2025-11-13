import { Doc } from "../../../convex/_generated/dataModel";

interface CustomQuestionListProps {
  questions: Doc<"questions">[];
}

export function CustomQuestionList({ questions }: CustomQuestionListProps) {
  return (
    <div className="space-y-4">
      {questions.map((question) => (
        <div key={question._id} className="p-4 bg-white/10 rounded-lg shadow">
          <p className="text-lg">{question.customText}</p>
          <div className="flex justify-between items-center mt-2 text-sm text-gray-400">
            <span>{new Date(question._creationTime).toLocaleDateString()}</span>
            <span className={`px-2 py-1 rounded-full text-xs ${
              question.status === "pending" ? "bg-yellow-500/20 text-yellow-300" :
              question.status === "approved" ? "bg-green-500/20 text-green-300" :
              "bg-blue-500/20 text-blue-300"
            }`}>
              {question.status}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
