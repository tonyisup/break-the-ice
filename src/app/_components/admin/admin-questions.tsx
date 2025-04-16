import { Question, QuestionTag, Tag } from "@prisma/client";
import { Pencil, Save, Trash, X } from "lucide-react";
import { useState } from "react";
import { SearchInput } from "~/components/SearchInput";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Textarea } from "~/components/ui/textarea";
import { api } from "~/trpc/react";

export default function AdminQuestions() {
  const { data: questions, isLoading, refetch: refetchAll } = api.questions.getAll.useQuery();
  const removeQuestion = api.questions.removeQuestion.useMutation();
  const updateQuestion = api.questions.updateQuestion.useMutation();
  const removeTag = api.questions.removeTag.useMutation();
  const [editingQuestionId, setEditingQuestionId] = useState<number>(0);
  const [editingQuestionText, setEditingQuestionText] = useState<string>("");
  const [editingQuestionCategory, setEditingQuestionCategory] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!questions) {
    return <div>No questions found</div>;
  }


  const handleRemoveQuestion = (id: number) => {
    removeQuestion.mutate({ id }, {
      onSuccess: () => {
        refetchAll();
      }
    });
  }

  const handleStartEditingQuestion = (id: number) => {
    setEditingQuestionId(id);
    setEditingQuestionText(questions.find((question) => question.id === id)?.text || "");
    setEditingQuestionCategory(questions.find((question) => question.id === id)?.category || "");
  }

  const handleStopEditingQuestion = () => {
    setEditingQuestionId(0);
    setEditingQuestionText("");
    setEditingQuestionCategory("");
  }

  const handleSaveQuestion = (question: Question) => {
    question.text = editingQuestionText;
    question.category = editingQuestionCategory;
    updateQuestion.mutate({ id: question.id, text: editingQuestionText, category: editingQuestionCategory });
    handleStopEditingQuestion();
  }

  const handleRemoveTag = (questionId: number, tags: QuestionTag[], tag: Tag) => {
    tags = tags.filter((t) => t.tagId !== tag.id);
    removeTag.mutate({ questionId: questionId, tagId: tag.id });
  }

  const handleSearch = (query: string) => {
    setSearch(query);
  }

  return (
    <div className="flex flex-col gap-4 w-full justify-center items-center">
      <SearchInput 
        onSearch={handleSearch} 
        placeholder="Search questions..." 
        delay={300} 
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Action</TableHead>
            <TableHead>Question</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Tags</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {questions.filter((question) => question.text.toLowerCase().includes(search.toLowerCase())).map((question) => (
            <TableRow key={question.id}>
              <TableCell>
                <Button variant="destructive" onClick={() => {
                  handleRemoveQuestion(question.id);
                }}><Trash className="w-2 h-2" /></Button>
                {editingQuestionId !== question.id && <Button variant="outline" onClick={() => handleStartEditingQuestion(question.id)}>
                  <Pencil className="w-2 h-2" />
                </Button>}
                {editingQuestionId === question.id && <Button variant="outline" onClick={() => handleSaveQuestion(question)}>
                  <Save className="w-2 h-2" />
                </Button>}
                {editingQuestionId === question.id && <Button variant="outline" onClick={() => handleStopEditingQuestion()}>
                  <X className="w-2 h-2" />
                </Button>}
              </TableCell>
              <TableCell>{editingQuestionId === question.id ? (
                <Textarea value={editingQuestionText} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                  setEditingQuestionText(e.target.value);
                }} />
              ) : (
                question.text
              )}</TableCell>
              <TableCell>{editingQuestionId === question.id ? (
                <Input type="text" value={editingQuestionCategory} onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setEditingQuestionCategory(e.target.value);
                }} />
              ) : (
                question.category
              )}</TableCell>
              <TableCell>{question.tags.map((t) =>
                <Badge key={t.tag.id} variant="outline" className="m-1">{t.tag.name}
                  <Button variant="ghost" size="icon" onClick={() => handleRemoveTag(question.id, question.tags, t.tag)}>
                    <Trash />
                  </Button>
                </Badge>
              )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={3}>
              Total
            </TableCell>
            <TableCell>{questions.filter((question) => question.text.toLowerCase().includes(search.toLowerCase())).length}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
