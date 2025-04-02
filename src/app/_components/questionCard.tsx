import GameCard from "./game-card";
import { type RouterOutputs } from "~/trpc/react";
import { cn } from "~/lib/utils";
type Question = NonNullable<RouterOutputs["questions"]["getRandom"]>;

interface QuestionCardProps {
  question: Question;
  className?: string
}

export function QuestionCard({ question, className }: QuestionCardProps) {
  return <GameCard text={question.text} description={question.category} className={cn("bg-[#eaeaea] dark:bg-[#222222]", className)} />
}