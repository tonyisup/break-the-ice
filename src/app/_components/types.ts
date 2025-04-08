import type { RouterOutputs } from "~/trpc/react";

export type Question = NonNullable<RouterOutputs["questions"]["getRandom"]>; 