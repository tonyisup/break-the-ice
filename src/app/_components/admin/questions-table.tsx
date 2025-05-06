import type { Question, QuestionTag, Tag } from "@prisma/client";
import { Pencil, Save, Trash, X } from "lucide-react";
import { SearchInput } from "~/components/SearchInput";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Textarea } from "~/components/ui/textarea";

interface QuestionWithTags extends Question {
  tags: Array<{
    questionId: number;
    tagId: number;
    createdAt: Date;
    tag: Tag;
  }>;
}

interface QuestionsTableProps {
  questions: QuestionWithTags[];
  search: string;
  editingQuestionId: number;
  editingQuestionText: string;
  onRemoveQuestion: (id: number) => void;
  onStartEditingQuestion: (id: number) => void;
  onStopEditingQuestion: () => void;
  onSaveQuestion: (question: Question) => void;
  onRemoveTag: (questionId: number, tags: QuestionTag[], tag: Tag) => void;
  onSearch: (query: string) => void;
}

export function QuestionsTable({
  questions,
  search,
  editingQuestionId,
  editingQuestionText,
  onRemoveQuestion,
  onStartEditingQuestion,
  onStopEditingQuestion,
  onSaveQuestion,
  onRemoveTag,
  onSearch,
}: QuestionsTableProps) {
  return (
    <div className="flex flex-col gap-4 w-full justify-center items-center">
      <SearchInput 
        id="search-questions"
        onSearch={onSearch} 
        placeholder="Search questions..." 
        delay={300} 
      />
      
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Action</TableHead>
            <TableHead>Question</TableHead>
            <TableHead>Tags</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {questions.filter((question) => question.text.toLowerCase().includes(search.toLowerCase())).map((question) => (
            <TableRow key={question.id}>
              <TableCell>
                <Button variant="destructive" onClick={() => {
                  onRemoveQuestion(question.id);
                }}><Trash className="w-2 h-2" /></Button>
                {editingQuestionId !== question.id && <Button variant="outline" onClick={() => onStartEditingQuestion(question.id)}>
                  <Pencil className="w-2 h-2" />
                </Button>}
                {editingQuestionId === question.id && <Button variant="outline" onClick={() => onSaveQuestion(question)}>
                  <Save className="w-2 h-2" />
                </Button>}
                {editingQuestionId === question.id && <Button variant="outline" onClick={() => onStopEditingQuestion()}>
                  <X className="w-2 h-2" />
                </Button>}
              </TableCell>
              <TableCell>{editingQuestionId === question.id ? (
                <Textarea value={editingQuestionText} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                  onSearch(e.target.value);
                }} />
              ) : (
                question.text
              )}</TableCell>
              <TableCell>{question.tags.map((t) =>
                <Badge key={t.tag.id} variant="outline" className="m-1">{t.tag.name}
                  <Button variant="ghost" size="icon" onClick={() => onRemoveTag(question.id, question.tags, t.tag)}>
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