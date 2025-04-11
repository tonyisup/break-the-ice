"use client";

import { Button } from "~/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { FilterIcon, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { Question } from "./types";

interface QuestionGridProps {
  questions: Question[];
  type: "likes" | "skips";
  onRemove: (id: string) => void;
}

export function QuestionGrid({ questions, type, onRemove }: QuestionGridProps) {
  const handleRemove = (id: string) => {
    onRemove(id);
  };

  const handleInspect = (id: string) => {
    window.location.href = `/inspect-card?id=${id}`;
  };
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 w-full">
      <AnimatePresence>
        {questions
          .map((question) => (
            <motion.div
              key={question.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
            >
              <Card className="h-full flex flex-col">
                <CardHeader className="pb-2">
                  <Badge variant={type === "likes" ? "default" : "secondary"}>
                    {type === "likes" ? "Liked" : "Skipped"}
                  </Badge>
                </CardHeader>
                <CardContent className="flex-grow">
                  <p className="text-lg">{question.text}</p>
                  <Badge variant="outline">{question.category}</Badge>
                  {question.tags && question.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-4">
                      {question.tags.map((tag) => (
                        <Badge key={tag.tag.id} variant="secondary" className="text-xs">
                          {tag.tag.name}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
                <CardFooter className="pt-2 flex justify-between">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleInspect(question.id)}
                    aria-label="Inspect question details"
                  >
                    <FilterIcon className="h-4 w-4 mr-2 text-blue-500" />
                    Inspect
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRemove(question.id)}
                    aria-label={`Remove ${type === "likes" ? "liked" : "skipped"} question`}
                  >
                    <X className="h-4 w-4 mr-2 text-red-500" />
                    {type === "likes" ? "Unlike" : "Unskip"}
                  </Button>
                </CardFooter>
              </Card>
            </motion.div>
          ))}
      </AnimatePresence>
    </div>
  );
} 