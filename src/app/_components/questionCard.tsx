import GameCard from "./game-card";
import { cn } from "~/lib/utils";

import type { Question as PrismaQuestion, Tag } from "@prisma/client";

type Question = PrismaQuestion & {
  tags: Array<{
    tag: Tag;
  }>;
};

interface QuestionCardProps {
  question: Question;
  className?: string;
  inspect?: boolean;
}

export function QuestionCard({ question, className, inspect }: QuestionCardProps) {
  return <GameCard inspect={inspect ?? false} question={question} className={cn("bg-[#eaeaea] dark:bg-[#222222]", className)} />
}