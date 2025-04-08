"use client";

import { useState } from "react";
import { type Question } from "./types";
import { removeLikedQuestion, removeSkippedQuestion } from "~/lib/localStorage";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { X, Heart, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface QuestionGridProps {
  questions: Question[];
  type: "likes" | "skips";
  onRemove: (id: string) => void;
}

export function QuestionGrid({ questions, type, onRemove }: QuestionGridProps) {
  const [removedIds, setRemovedIds] = useState<string[]>([]);

  const handleRemove = (id: string) => {
    setRemovedIds((prev) => [...prev, id]);
    onRemove(id);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 w-full">
      <AnimatePresence>
        {questions
          .filter((q) => !removedIds.includes(q.id))
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
                </CardContent>
                <CardFooter className="pt-2 flex justify-between">
                  <Badge variant="outline">{question.category}</Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemove(question.id)}
                    aria-label={`Remove ${type === "likes" ? "liked" : "skipped"} question`}
                  >
                    {type === "likes" ? (
                      <Heart className="h-4 w-4 text-red-500" />
                    ) : (
                      <X className="h-4 w-4 text-gray-500" />
                    )}
                  </Button>
                </CardFooter>
              </Card>
            </motion.div>
          ))}
      </AnimatePresence>
    </div>
  );
} 