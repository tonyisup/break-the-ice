import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";

export function QuestionCard({ question }: { question: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Question</CardTitle>
      </CardHeader>
      <CardContent>
        {question}
      </CardContent>
    </Card>
  )
}