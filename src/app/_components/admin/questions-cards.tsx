import type { Question, QuestionTag, Tag } from "@prisma/client";
import { Pencil, Save, Trash, X } from "lucide-react";
import { SearchInput } from "~/components/SearchInput";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "~/components/ui/card";
import { Textarea } from "~/components/ui/textarea";
import ScrollToTop from "../ScrollToTop";

interface QuestionWithTags extends Question {
  tags: Array<{
    questionId: number;
    tagId: number;
    createdAt: Date;
    tag: Tag;
  }>;
}

interface QuestionsCardsProps {
  questions: QuestionWithTags[];
  search: string;
  editingQuestionId: number;
  editingQuestionText: string;
  setEditingQuestionText: (text: string) => void;
  onRemoveQuestion: (id: number) => void;
  onStartEditingQuestion: (id: number) => void;
  onStopEditingQuestion: () => void;
  onSaveQuestion: (question: Question) => void;
  onRemoveTag: (questionId: number, tags: QuestionTag[], tag: Tag) => void;
  onSearch: (query: string) => void;
}

export function QuestionsCards({
  questions,
  search,
  editingQuestionId,
  editingQuestionText,
  setEditingQuestionText,
  onRemoveQuestion,
  onStartEditingQuestion,
  onStopEditingQuestion,
  onSaveQuestion,
  onRemoveTag,
  onSearch,
}: QuestionsCardsProps) {
  const filteredQuestions = questions.filter((question) => 
    question.text.toLowerCase().includes(search.toLowerCase())
    || question.tags.some((tag) => tag.tag.name.toLowerCase().includes(search.toLowerCase()))
  );

  const handleRemoveTag = (questionId: number, question: QuestionWithTags, tag: Tag) => {
    question.tags = question.tags.filter((t) => t.tagId !== tag.id);
    onRemoveTag(questionId, question.tags, tag);
  }

  return (
    <div className="flex flex-col gap-4 w-full">
      <SearchInput 
        id="search-questions"
        onSearch={onSearch} 
        placeholder="Search questions..." 
        delay={300} 
      />
      <ScrollToTop />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredQuestions.map((question) => (
          <Card key={question.id} className="flex flex-col">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardDescription>
                    {editingQuestionId === question.id ? (
                      <Textarea
                        value={editingQuestionText}
                        onChange={(e) => setEditingQuestionText(e.target.value)}
                        className="w-full min-h-[100px]"
                      />
                    ) : (
                      question.text
                    )}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="destructive" 
                    size="icon"
                    onClick={() => onRemoveQuestion(question.id)}
                  >
                    <Trash className="w-4 h-4" />
                  </Button>
                  {editingQuestionId !== question.id && (
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={() => onStartEditingQuestion(question.id)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                  )}
                  {editingQuestionId === question.id && (
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={() => onSaveQuestion(question)}
                    >
                      <Save className="w-4 h-4" />
                    </Button>
                  )}
                  {editingQuestionId === question.id && (
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={onStopEditingQuestion}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {question.tags.map((t) => (
                  <Badge key={t.tag.id} variant="outline" className="flex items-center gap-1">
                    {t.tag.name}
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-4 w-4 p-0"
                      onClick={() => handleRemoveTag(question.id, question, t.tag)}
                    >
                      <Trash className="h-3 w-3" />
                    </Button>
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      
      <div className="text-sm text-muted-foreground mt-4">
        Total: {filteredQuestions.length} questions
      </div>
    </div>
  );
} 