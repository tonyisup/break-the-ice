"use client";

import { Button } from "~/components/ui/button";
import { ArrowLeft } from "lucide-react";

export function BackButton() {
  return (
    <Button
      variant="outline"
      onClick={() => window.history.back()}
      className="flex items-center gap-2"
    >
      <ArrowLeft className="h-4 w-4" />
      Back to Questions
    </Button>
  );
} 