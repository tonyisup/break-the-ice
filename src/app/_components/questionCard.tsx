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
  simpleMode: boolean;
}

export function QuestionCard({ question, className, simpleMode }: QuestionCardProps) {
  return <GameCard simpleMode={simpleMode} question={question} className={cn("bg-[#eaeaea] dark:bg-[#222222]", className)} />
}