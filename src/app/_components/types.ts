import type { RouterOutputs } from "~/trpc/react";

export type DBQuestion = NonNullable<RouterOutputs["questions"]["getRandom"]>; 
export type Question = {
  id: string;
  text: string;
  category: string;
} & {
  tags: {
    id: string;
    name: string;
  }[];
};