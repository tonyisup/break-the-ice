import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "~/components/ui/card";

export function QuestionCard({ question }: { question: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>&nbsp;</CardTitle>
      </CardHeader>
      <CardContent className="px-12 text-2xl">
        {question}
      </CardContent>
      <CardFooter>&nbsp;</CardFooter>
    </Card>
  )
}