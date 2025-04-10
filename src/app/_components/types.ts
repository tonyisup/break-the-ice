import type { RouterOutputs } from "~/trpc/react";

export type DBQuestions = NonNullable<RouterOutputs["questions"]["getRandomStack"]>; 
export type Question = {
  id: string;
  text: string;
  category: string;
} & {
  tags: {
    tag: {
        id: string;
        name: string;
    };
}[];
};