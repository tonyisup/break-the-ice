import { useState } from "react";
import { BaseCard } from "../based-card/base-card";

export function StartingCard() {
  const [gradient, setGradient] = useState<Record<string, string>>({["style"]: "#667EEA", ["tone"]: "#764BA2"});

  return (
    <BaseCard
      gradient={gradient}
    >
      <h1>Starting Card</h1>
    </BaseCard>
  )
}