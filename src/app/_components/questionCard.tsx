import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "~/components/ui/card";

export function QuestionCard({ question }: { question: string }) {
  return (
    <Card className="flex-1 flex flex-col justify-center">
      <CardHeader>
        <CardTitle>&nbsp;</CardTitle>
      </CardHeader>
      <CardContent className="px-12 text-2xl text-center">
        {question}
      </CardContent>
      <CardFooter>&nbsp;</CardFooter>
    </Card>
  )
}