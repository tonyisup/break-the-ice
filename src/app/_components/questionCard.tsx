import GameCard from "./game-card";
import { cn } from "~/lib/utils";
import type { Question } from "./types";

interface QuestionCardProps {
  question: Question;
  className?: string
}

export function QuestionCard({ question, className }: QuestionCardProps) {
  return <GameCard text={question.text} description={question.category} className={cn("bg-[#eaeaea] dark:bg-[#222222]", className)} />
}