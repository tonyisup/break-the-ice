import type { Question, QuestionTag, Tag } from "@prisma/client";
import { LayoutGrid, Table } from "lucide-react";
import { useState } from "react";
import { api } from "~/trpc/react";
import { QuestionsCards } from "./questions-cards";
import { QuestionsTable } from "./questions-table";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { useToast } from "~/hooks/use-toast";

export default function AdminQuestions() {
  const { data: questions, isLoading, refetch: refetchAll } = api.questions.getAll.useQuery();
  const removeQuestion = api.questions.removeQuestion.useMutation();
  const updateQuestion = api.questions.updateQuestion.useMutation();
  const removeTag = api.questions.removeTag.useMutation();
  const [editingQuestionId, setEditingQuestionId] = useState<number>(0);
  const [editingQuestionText, setEditingQuestionText] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [viewMode, setViewMode] = useState<"table" | "cards">("cards");
  const { toast } = useToast();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!questions) {
    return <div>No questions found</div>;
  }

  const handleRemoveQuestion = (id: number) => {
    removeQuestion.mutate({ id }, {
      onSuccess: () => {
        void refetchAll();
        toast({
          title: "Success",
          description: "Question removed successfully",
        });
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      }
    });
  }

  const handleStartEditingQuestion = (id: number) => {
    setEditingQuestionId(id);
    setEditingQuestionText(questions.find((question) => question.id === id)?.text ?? "");
  }

  const handleStopEditingQuestion = () => {
    setEditingQuestionId(0);
    setEditingQuestionText("");
  }

  const handleSaveQuestion = (question: Question) => {
    question.text = editingQuestionText;
    updateQuestion.mutate({ id: question.id, text: editingQuestionText }, {
      onSuccess: () => {
        handleStopEditingQuestion();
        toast({
          title: "Success",
          description: "Question updated successfully",
        });
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      }
    });
  }

  const handleRemoveTag = (questionId: number, tags: QuestionTag[], tag: Tag) => {
    tags = tags.filter((t) => t.tagId !== tag.id);
    removeTag.mutate({ questionId: questionId, tagId: tag.id }, {
      onSuccess: () => {
        toast({
          title: "Success",
          description: "Tag removed successfully",
        });
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      }
    });
  }

  const handleSearch = (query: string) => {
    setSearch(query);
  }

  const commonProps = {
    questions,
    search,
    editingQuestionId,
    editingQuestionText,
    setEditingQuestionText,
    onRemoveQuestion: handleRemoveQuestion,
    onStartEditingQuestion: handleStartEditingQuestion,
    onStopEditingQuestion: handleStopEditingQuestion,
    onSaveQuestion: handleSaveQuestion,
    onRemoveTag: handleRemoveTag,
    onSearch: handleSearch,
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <ToggleGroup
          type="single"
          value={viewMode}
          onValueChange={(value: "table" | "cards") => setViewMode(value)}
        >
          <ToggleGroupItem value="table" aria-label="Table view">
            <Table className="h-4 w-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="cards" aria-label="Card view">
            <LayoutGrid className="h-4 w-4" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {viewMode === "table" ? (
        <QuestionsTable {...commonProps} />
      ) : (
        <QuestionsCards {...commonProps} />
      )}
    </div>
  );
}
