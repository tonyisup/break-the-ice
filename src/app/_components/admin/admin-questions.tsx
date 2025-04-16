import { X } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { api } from "~/trpc/react";

export default function AdminQuestions() {
    const { data: questions, isLoading, refetch } = api.questions.getAll.useQuery();
    const removeQuestion = api.questions.removeQuestion.useMutation();

    if (isLoading) {
      return <div>Loading...</div>;
    }

    if (!questions) {
      return <div>No questions found</div>;
    }

    const handleRemoveQuestion = (id: number) => {
      removeQuestion.mutate({ id }, {
        onSuccess: () => {
          refetch();
        }
      });
    }

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Remove</TableHead>
            <TableHead>Question</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Tags</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {questions.map((question) => (
            <TableRow key={question.id}>
              <TableCell>
                <Button variant="outline" onClick={() => {
                  handleRemoveQuestion(question.id);
                }}><X className="w-4 h-4" /></Button>
              </TableCell>
              <TableCell>{question.text}</TableCell>
              <TableCell>{question.category}</TableCell>
              <TableCell>{question.tags.map((tag) => tag.tag.name).map((t) => 
                <Badge key={t} variant="outline" className="m-1">{t}</Badge>)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={4}>
              Total
            </TableCell>
            <TableCell>{questions.length}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
  );
}
