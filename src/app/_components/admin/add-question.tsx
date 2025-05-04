import { useState } from "react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { Label } from "~/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "~/components/ui/card";
import { useToast } from "~/hooks/use-toast";

export function AddQuestion() {
  const [text, setText] = useState("");
  const [category, setCategory] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const utils = api.useUtils();

  const addQuestion = api.questions.create.useMutation({
    onSuccess: () => {
      setText("");
      setCategory("");
      setIsSubmitting(false);
      toast({
        title: "Success",
        description: "Question added successfully",
      });
      void utils.questions.getAll.invalidate();
    },
    onError: (error) => {
      setIsSubmitting(false);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !category.trim()) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    addQuestion.mutate({
      text: text.trim(),
      category: category.trim(),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add New Question</CardTitle>
        <CardDescription>
          Create a new question with its category
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Input
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Enter category"
              disabled={isSubmitting}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="text">Question</Label>
            <Textarea
              id="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter question text"
              className="min-h-[100px]"
              disabled={isSubmitting}
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Adding..." : "Add Question"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
} 